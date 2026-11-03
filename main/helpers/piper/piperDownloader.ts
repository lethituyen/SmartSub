import { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { logMessage } from '../storeManager';
import type { ModelDownloadProgress } from '../modelDownloader';
import {
  PIPER_VIETNAMESE_VOICES,
  PiperVoiceSpec,
  getPiperModelsDir,
  isPiperVoiceInstalled,
} from './piperManager';

const HF_BASE_URL = 'https://huggingface.co/hoanglinhn0/Model/resolve/main/';
const HF_RAW_URL = 'https://huggingface.co/hoanglinhn0/Model/raw/main/';

export const PIPER_PROGRESS_KEY = 'tts:piper-vietnamese';

function downloadFileWithRedirect(
  url: string,
  dest: string,
  signal: AbortSignal,
  onBytes: (chunkSize: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('Download cancelled'));

    const req = https.get(url, (res) => {
      if (
        res.statusCode &&
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        req.destroy();
        return downloadFileWithRedirect(
          res.headers.location,
          dest,
          signal,
          onBytes,
        )
          .then(resolve)
          .catch(reject);
      }

      if (res.statusCode !== 200) {
        req.destroy();
        return reject(
          new Error(`Tải tệp thất bại: ${url} (HTTP ${res.statusCode})`),
        );
      }

      const tempDest = dest + '.tmp';
      const fileStream = fs.createWriteStream(tempDest);

      const abortHandler = () => {
        req.destroy();
        fileStream.destroy();
        try {
          if (fs.existsSync(tempDest)) fs.unlinkSync(tempDest);
        } catch {
          /* ignore */
        }
        reject(new Error('Download cancelled'));
      };

      signal.addEventListener('abort', abortHandler, { once: true });

      res.on('data', (chunk) => {
        onBytes(chunk.length);
      });

      res.pipe(fileStream);

      fileStream.on('finish', () => {
        signal.removeEventListener('abort', abortHandler);
        fileStream.close(() => {
          try {
            if (fs.existsSync(dest)) fs.unlinkSync(dest);
            fs.renameSync(tempDest, dest);
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });

      fileStream.on('error', (err) => {
        signal.removeEventListener('abort', abortHandler);
        try {
          if (fs.existsSync(tempDest)) fs.unlinkSync(tempDest);
        } catch {
          /* ignore */
        }
        reject(err);
      });
    });

    req.on('error', reject);
  });
}

export class PiperModelDownloader {
  private abortController: AbortController | null = null;
  private mainWindow: BrowserWindow | null = null;
  private progress: ModelDownloadProgress = {
    status: 'idle',
    progress: 0,
    downloaded: 0,
    total: 0,
    speed: 0,
    eta: 0,
  };

  constructor(mainWindow?: BrowserWindow) {
    this.mainWindow = mainWindow || null;
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.progress = { ...this.progress, status: 'idle' };
    this.send();
  }

  private send(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      const ratio =
        this.progress.total > 0
          ? this.progress.downloaded / this.progress.total
          : 0;
      this.mainWindow.webContents.send(
        'downloadProgress',
        PIPER_PROGRESS_KEY,
        Math.min(ratio, 0.99),
      );
      this.mainWindow.webContents.send(
        'modelDownloadDetail',
        PIPER_PROGRESS_KEY,
        this.progress,
      );
    }
  }

  private update(p: Partial<ModelDownloadProgress>): void {
    this.progress = { ...this.progress, ...p };
    if (this.progress.total > 0) {
      this.progress.progress =
        (this.progress.downloaded / this.progress.total) * 100;
    }
    this.send();
  }

  /**
   * Tải một giọng cụ thể hoặc TẢI TẤT CẢ GIỌNG (Batch all)
   * @param voiceId Nếu truyền 'all' hoặc bỏ trống thì tải toàn bộ danh sách giọng
   */
  async download(voiceId?: string): Promise<{ success: boolean; error?: string }> {
    if (this.abortController) {
      return { success: false, error: 'anotherDownloadInProgress' };
    }

    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    const targetDir = getPiperModelsDir();

    const targets: PiperVoiceSpec[] =
      voiceId && voiceId !== 'all'
        ? PIPER_VIETNAMESE_VOICES.filter((v) => v.id === voiceId)
        : PIPER_VIETNAMESE_VOICES;

    if (targets.length === 0) {
      return { success: false, error: `Giọng đọc không hợp lệ: ${voiceId}` };
    }

    // Ước tính tổng dung lượng (mỗi giọng ~63MB ONNX + vài KB json)
    const approxTotalBytes = targets.length * 64 * 1024 * 1024;
    let totalDownloaded = 0;
    let lastTime = Date.now();
    let bytesSinceLast = 0;

    this.progress = {
      status: 'downloading',
      progress: 0,
      downloaded: 0,
      total: approxTotalBytes,
      speed: 0,
      eta: 0,
    };
    this.send();

    try {
      for (const spec of targets) {
        if (signal.aborted) break;

        const onnxDest = path.join(targetDir, spec.onnxFile);
        const jsonDest = path.join(targetDir, spec.jsonFile);

        // Bỏ qua nếu đã tải đủ
        if (fs.existsSync(onnxDest) && fs.existsSync(jsonDest)) {
          totalDownloaded += 64 * 1024 * 1024;
          this.update({ downloaded: totalDownloaded });
          continue;
        }

        const onnxUrl = `${HF_BASE_URL}${encodeURIComponent(spec.onnxFile)}`;
        const jsonUrl = `${HF_RAW_URL}${encodeURIComponent(spec.jsonFile)}`;

        logMessage(`Downloading Piper voice: ${spec.name} (${spec.onnxFile})`, 'info');

        const onChunk = (len: number) => {
          totalDownloaded += len;
          bytesSinceLast += len;
          const now = Date.now();
          const elapsed = now - lastTime;
          if (elapsed >= 500) {
            const speed = (bytesSinceLast / elapsed) * 1000;
            const remaining = Math.max(0, approxTotalBytes - totalDownloaded);
            const eta = speed > 0 ? Math.round(remaining / speed) : 0;
            lastTime = now;
            bytesSinceLast = 0;
            this.update({
              downloaded: totalDownloaded,
              speed,
              eta,
            });
          }
        };

        // Tải file config JSON trước
        await downloadFileWithRedirect(jsonUrl, jsonDest, signal, onChunk);

        // Tải file model ONNX
        await downloadFileWithRedirect(onnxUrl, onnxDest, signal, onChunk);
      }

      this.progress = {
        status: 'completed',
        progress: 100,
        downloaded: approxTotalBytes,
        total: approxTotalBytes,
        speed: 0,
        eta: 0,
      };
      this.send();
      return { success: true };
    } catch (err: any) {
      if (signal.aborted) {
        this.progress = { ...this.progress, status: 'idle' };
        this.send();
        return { success: false, error: 'Download cancelled' };
      }
      logMessage(`Piper download error: ${err.message}`, 'error');
      this.progress = { ...this.progress, status: 'error' };
      this.send();
      return { success: false, error: err.message };
    } finally {
      this.abortController = null;
    }
  }

  /** Xóa toàn bộ hoặc một giọng */
  delete(voiceId?: string): void {
    const targetDir = getPiperModelsDir();
    if (voiceId && voiceId !== 'all') {
      const spec = PIPER_VIETNAMESE_VOICES.find((v) => v.id === voiceId);
      if (spec) {
        const onnx = path.join(targetDir, spec.onnxFile);
        const json = path.join(targetDir, spec.jsonFile);
        if (fs.existsSync(onnx)) fs.unlinkSync(onnx);
        if (fs.existsSync(json)) fs.unlinkSync(json);
      }
    } else {
      // Xóa toàn bộ thư mục models
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
        fs.mkdirSync(targetDir, { recursive: true });
      }
    }
  }
}

let piperDownloaderInstance: PiperModelDownloader | null = null;
export function getPiperModelDownloader(mainWindow?: BrowserWindow): PiperModelDownloader {
  if (!piperDownloaderInstance) {
    piperDownloaderInstance = new PiperModelDownloader(mainWindow);
  } else if (mainWindow) {
    piperDownloaderInstance.setMainWindow(mainWindow);
  }
  return piperDownloaderInstance;
}
