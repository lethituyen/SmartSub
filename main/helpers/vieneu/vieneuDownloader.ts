import { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import { logMessage } from '../logger';
import type { ModelDownloadProgress } from '../modelDownloader';
import { getVieNeuModelsDir, isVieNeuInstalled } from './vieneuManager';

export const VIENEU_PROGRESS_KEY = 'tts:vieneu-vietnamese';

const HF_PRIMARY_BASE = 'https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo/resolve/main/';
const HF_MIRROR_BASE = 'https://hf-mirror.com/pnnbao-ump/VieNeu-TTS-v3-Turbo/resolve/main/';

export const VIENEU_VOICE_IDS = [
  'minh_quan_pro', 'adam_bua', 'truc_ly', 'anh_khoi', 'mai_anh',
  'thuy_dung', 'thien_tam_duc', 'ngoc_huyen', 'quang_son', 'ngoc_tran',
  'minh_duc', 'pham_tuyen', 'thai_son', 'xuan_vinh', 'thanh_binh',
  'ngoc_linh', 'doan_trang', 'thuc_doan', 'minh_triet', 'my_duyen',
  'quynh_anh', 'duc_tri', 'kim_thanh', 'adam', 'manh_dung',
];

interface DownloadItem {
  remoteRel: string;
  localRel: string;
}

const GGUF_DOWNLOAD_ITEMS: DownloadItem[] = [
  { remoteRel: 'gguf/vieneu-v3-turbo-q8_0.gguf', localRel: 'vieneu-v3-turbo-q8_0.gguf' },
  ...VIENEU_VOICE_IDS.flatMap((id) => [
    { remoteRel: `gguf/voices/${id}/ref_codes.txt`, localRel: `voices/${id}/ref_codes.txt` },
    { remoteRel: `gguf/voices/${id}/speaker.emb.txt`, localRel: `voices/${id}/speaker.emb.txt` },
  ]),
];

function downloadFileWithRedirect(
  url: string,
  dest: string,
  signal: AbortSignal,
  onBytes: (chunkSize: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('Download cancelled'));

    const parsed = new URL(url);
    const client = parsed.protocol === 'http:' ? http : https;

    const req = client.get(
      url,
      {
        headers: {
          'User-Agent': 'SmartSub-Electron/3.11.0',
        },
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          req.destroy();
          const targetUrl = new URL(res.headers.location, url).href;
          return downloadFileWithRedirect(targetUrl, dest, signal, onBytes)
            .then(resolve)
            .catch(reject);
        }

        if (res.statusCode !== 200) {
          req.destroy();
          return reject(
            new Error(`HTTP ${res.statusCode}: Failed to download ${url}`),
          );
        }

        const tmpDest = `${dest}.part`;
        const fileStream = fs.createWriteStream(tmpDest);

        res.on('data', (chunk) => {
          onBytes(chunk.length);
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close(() => {
            try {
              if (fs.existsSync(dest)) fs.unlinkSync(dest);
              fs.renameSync(tmpDest, dest);
              resolve();
            } catch (err) {
              reject(err);
            }
          });
        });

        fileStream.on('error', (err) => {
          try {
            if (fs.existsSync(tmpDest)) fs.unlinkSync(tmpDest);
          } catch {
            /* ignore */
          }
          reject(err);
        });
      },
    );

    req.on('error', reject);

    const onAbort = () => {
      req.destroy();
      reject(new Error('Download aborted'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function downloadVieNeuModel(
  window: BrowserWindow | null,
  signal: AbortSignal,
): Promise<void> {
  const modelDir = getVieNeuModelsDir();
  if (!fs.existsSync(modelDir)) {
    fs.mkdirSync(modelDir, { recursive: true });
  }

  logMessage('Starting VieNeu-TTS model download from Hugging Face...');

  let totalBytes = 280_000_000; // ~280MB
  let downloadedBytes = 0;

  const notify = (status: 'downloading' | 'completed' | 'error', error?: string) => {
    if (window && !window.isDestroyed()) {
      const ratio = totalBytes > 0 ? downloadedBytes / totalBytes : 0;
      const progress: ModelDownloadProgress = {
        status,
        progress: Math.min(100, Math.round(ratio * 100)),
        downloaded: downloadedBytes,
        total: totalBytes,
        speed: 0,
        eta: 0,
        error,
      };
      window.webContents.send(
        'downloadProgress',
        VIENEU_PROGRESS_KEY,
        Math.min(ratio, 0.99),
      );
      window.webContents.send(
        'modelDownloadDetail',
        VIENEU_PROGRESS_KEY,
        progress,
      );
    }
  };

  notify('downloading');

  for (const item of GGUF_DOWNLOAD_ITEMS) {
    if (signal.aborted) {
      notify('error', 'Download cancelled');
      throw new Error('Download cancelled');
    }

    const dest = path.join(modelDir, item.localRel);
    const parentDir = path.dirname(dest);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    if (fs.existsSync(dest) && fs.statSync(dest).size > 10) {
      downloadedBytes += fs.statSync(dest).size;
      notify('downloading');
      continue;
    }

    let success = false;
    let lastError: Error | null = null;

    for (const base of [HF_PRIMARY_BASE, HF_MIRROR_BASE]) {
      try {
        const url = `${base}${item.remoteRel}`;
        await downloadFileWithRedirect(url, dest, signal, (chunk) => {
          downloadedBytes += chunk;
          notify('downloading');
        });
        success = true;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    if (!success) {
      notify('error', lastError?.message || `Failed to download ${item.remoteRel}`);
      throw lastError || new Error(`Failed to download ${item.remoteRel}`);
    }
  }

  try {
    fs.writeFileSync(
      path.join(modelDir, 'installed.json'),
      JSON.stringify({ version: 'v3-turbo', sampleRate: 48000, installedAt: new Date().toISOString() }, null, 2),
      'utf-8',
    );
  } catch {
    /* ignore */
  }

  notify('completed');
  logMessage('VieNeu-TTS v3 Turbo model download completed successfully.');
}
