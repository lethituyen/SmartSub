import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { getExtraResourcesPath } from '../utils';
import { getTtsModelsRoot } from '../ttsModelCatalog';
import { wavDurationMs } from '../dubbing/audioPipeline';
import { logMessage } from '../storeManager';

export interface PiperVoiceSpec {
  id: string;
  name: string;
  label: string;
  labelEn: string;
  gender: 'f' | 'm';
  region: 'north' | 'south' | 'central';
  lang: 'vi';
  onnxFile: string;
  jsonFile: string;
  approxSizeMb: number;
}

export const PIPER_VIETNAMESE_VOICES: PiperVoiceSpec[] = [
  {
    id: 'banmai',
    name: 'Ban Mai',
    label: 'Ban Mai (Nữ - Miền Bắc, chuẩn)',
    labelEn: 'Ban Mai (Female - North, standard)',
    gender: 'f',
    region: 'north',
    lang: 'vi',
    onnxFile: 'banmai.onnx',
    jsonFile: 'banmai.onnx.json',
    approxSizeMb: 63,
  },
  {
    id: 'manhdung',
    name: 'Mạnh Dũng',
    label: 'Mạnh Dũng (Nam - Miền Bắc, trầm ấm)',
    labelEn: 'Manh Dung (Male - North, deep)',
    gender: 'm',
    region: 'north',
    lang: 'vi',
    onnxFile: 'manhdung.onnx',
    jsonFile: 'manhdung.onnx.json',
    approxSizeMb: 63,
  },
  {
    id: 'chieuthanh',
    name: 'Chiêu Thanh',
    label: 'Chiêu Thanh (Nam - Miền Nam)',
    labelEn: 'Chieu Thanh (Male - South)',
    gender: 'm',
    region: 'south',
    lang: 'vi',
    onnxFile: 'chieuthanh.onnx',
    jsonFile: 'chieuthanh.onnx.json',
    approxSizeMb: 63,
  },
  {
    id: 'ngocngan3701',
    name: 'Nguyễn Ngọc Ngạn',
    label: 'Ngọc Ngạn (Nam - Kể chuyện, truyền cảm)',
    labelEn: 'Ngoc Ngan (Male - Storyteller)',
    gender: 'm',
    region: 'south',
    lang: 'vi',
    onnxFile: 'ngocngan3701.onnx',
    jsonFile: 'ngocngan3701.onnx.json',
    approxSizeMb: 63,
  },
  {
    id: 'minhquang',
    name: 'Minh Quang',
    label: 'Minh Quang (Nam - Miền Bắc, tin tức)',
    labelEn: 'Minh Quang (Male - North, news)',
    gender: 'm',
    region: 'north',
    lang: 'vi',
    onnxFile: 'minhquang.onnx',
    jsonFile: 'minhquang.onnx.json',
    approxSizeMb: 63,
  },
  {
    id: 'minhkhang',
    name: 'Minh Khang',
    label: 'Minh Khang (Nam - Miền Nam, trẻ trung)',
    labelEn: 'Minh Khang (Male - South, young)',
    gender: 'm',
    region: 'south',
    lang: 'vi',
    onnxFile: 'minhkhang.onnx',
    jsonFile: 'minhkhang.onnx.json',
    approxSizeMb: 63,
  },
  {
    id: 'maiphuong',
    name: 'Mai Phương',
    label: 'Mai Phương (Nữ - Miền Bắc, nhẹ nhàng)',
    labelEn: 'Mai Phuong (Female - North, gentle)',
    gender: 'f',
    region: 'north',
    lang: 'vi',
    onnxFile: 'maiphuong.onnx',
    jsonFile: 'maiphuong.onnx.json',
    approxSizeMb: 63,
  },
  {
    id: 'ngochuyen',
    name: 'Ngọc Huyền',
    label: 'Ngọc Huyền (Nữ - Truyền cảm)',
    labelEn: 'Ngoc Huyen (Female - Expressive)',
    gender: 'f',
    region: 'south',
    lang: 'vi',
    onnxFile: 'ngochuyen.onnx',
    jsonFile: 'ngochuyen.onnx.json',
    approxSizeMb: 63,
  },
  {
    id: 'phuongtrang',
    name: 'Phương Trang',
    label: 'Phương Trang (Nữ - Miền Nam)',
    labelEn: 'Phuong Trang (Female - South)',
    gender: 'f',
    region: 'south',
    lang: 'vi',
    onnxFile: 'phuongtrang.onnx',
    jsonFile: 'phuongtrang.onnx.json',
    approxSizeMb: 63,
  },
  {
    id: 'thanhphuong2',
    name: 'Thanh Phương',
    label: 'Thanh Phương (Nữ - Miền Nam)',
    labelEn: 'Thanh Phuong (Female - South)',
    gender: 'f',
    region: 'south',
    lang: 'vi',
    onnxFile: 'thanhphuong2.onnx',
    jsonFile: 'thanhphuong2.onnx.json',
    approxSizeMb: 63,
  },
  {
    id: 'thientam',
    name: 'Thiện Tâm',
    label: 'Thiện Tâm (Nam - Trầm ấm, radio)',
    labelEn: 'Thien Tam (Male - Warm, radio)',
    gender: 'm',
    region: 'north',
    lang: 'vi',
    onnxFile: 'thientam.onnx',
    jsonFile: 'thientam.onnx.json',
    approxSizeMb: 63,
  },
  {
    id: 'taian4',
    name: 'Tài An',
    label: 'Tài An (Nam - Trẻ trung)',
    labelEn: 'Tai An (Male - Young)',
    gender: 'm',
    region: 'north',
    lang: 'vi',
    onnxFile: 'taian4.onnx',
    jsonFile: 'taian4.onnx.json',
    approxSizeMb: 63,
  },
  {
    id: 'vi_VN-vais1000-medium',
    name: 'Vais1000',
    label: 'Vais1000 Chuẩn (Nữ - Miền Bắc)',
    labelEn: 'Vais1000 Standard (Female - North)',
    gender: 'f',
    region: 'north',
    lang: 'vi',
    onnxFile: 'vi_VN-vais1000-medium.onnx',
    jsonFile: 'vi_VN-vais1000-medium.onnx.json',
    approxSizeMb: 63,
  },
  {
    id: 'lacphi',
    name: 'Lạc Phi',
    label: 'Lạc Phi (Nam)',
    labelEn: 'Lac Phi (Male)',
    gender: 'm',
    region: 'north',
    lang: 'vi',
    onnxFile: 'lacphi.onnx',
    jsonFile: 'lacphi.onnx.json',
    approxSizeMb: 63,
  },
  {
    id: 'duyoryx3175',
    name: 'Duy Oryx',
    label: 'Duy Oryx (Nam)',
    labelEn: 'Duy Oryx (Male)',
    gender: 'm',
    region: 'north',
    lang: 'vi',
    onnxFile: 'duyoryx3175.onnx',
    jsonFile: 'duyoryx3175.onnx.json',
    approxSizeMb: 63,
  },
];

/** Lấy đường dẫn file thực thi piper.exe */
export function getPiperExePath(): string {
  const candidates: string[] = [];
  try {
    const extra = getExtraResourcesPath();
    if (extra) {
      candidates.push(path.join(extra, 'piper', 'piper.exe'));
    }
  } catch {}

  if (process.resourcesPath) {
    candidates.push(
      path.join(process.resourcesPath, 'extraResources', 'piper', 'piper.exe'),
      path.join(process.resourcesPath, 'piper', 'piper.exe'),
    );
  }

  if (process.execPath) {
    const appDir = path.dirname(process.execPath);
    candidates.push(
      path.join(appDir, 'resources', 'extraResources', 'piper', 'piper.exe'),
      path.join(appDir, 'resources', 'piper', 'piper.exe'),
      path.join(appDir, 'extraResources', 'piper', 'piper.exe'),
    );
  }

  candidates.push(
    path.join(process.cwd(), 'extraResources', 'piper', 'piper.exe'),
    path.join(process.cwd(), 'resources', 'extraResources', 'piper', 'piper.exe'),
  );

  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return (
    candidates[0] ||
    path.join(process.cwd(), 'extraResources', 'piper', 'piper.exe')
  );
}

export function isPiperEngineInstalled(): boolean {
  return fs.existsSync(getPiperExePath());
}

/** Thư mục lưu trữ model Piper */
export function getPiperModelsDir(): string {
  const root = path.join(getTtsModelsRoot(), 'piper-vietnamese');
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }
  return root;
}

/** Thư mục dự phòng (extraResources/piper/models) */
export function getPiperBundledModelsDir(): string {
  const candidates: string[] = [];
  try {
    const extra = getExtraResourcesPath();
    if (extra) candidates.push(path.join(extra, 'piper', 'models'));
  } catch {}

  if (process.resourcesPath) {
    candidates.push(
      path.join(process.resourcesPath, 'extraResources', 'piper', 'models'),
      path.join(process.resourcesPath, 'piper', 'models'),
    );
  }

  if (process.execPath) {
    const appDir = path.dirname(process.execPath);
    candidates.push(
      path.join(appDir, 'resources', 'extraResources', 'piper', 'models'),
      path.join(appDir, 'resources', 'piper', 'models'),
    );
  }

  candidates.push(
    path.join(process.cwd(), 'extraResources', 'piper', 'models'),
    path.join(process.cwd(), 'resources', 'extraResources', 'piper', 'models'),
  );

  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return (
    candidates[0] ||
    path.join(process.cwd(), 'extraResources', 'piper', 'models')
  );
}

/** Tìm file model (.onnx và .onnx.json) của một giọng cụ thể */
export function resolvePiperVoiceFiles(voiceId: string): {
  onnxPath: string;
  jsonPath: string;
} | null {
  const spec = PIPER_VIETNAMESE_VOICES.find((v) => v.id === voiceId) || PIPER_VIETNAMESE_VOICES[0];
  const primaryDir = getPiperModelsDir();
  const bundledDir = getPiperBundledModelsDir();

  const candidates = [
    {
      onnx: path.join(primaryDir, spec.onnxFile),
      json: path.join(primaryDir, spec.jsonFile),
    },
    {
      onnx: path.join(bundledDir, spec.onnxFile),
      json: path.join(bundledDir, spec.jsonFile),
    },
  ];

  for (const c of candidates) {
    if (fs.existsSync(c.onnx) && fs.existsSync(c.json)) {
      return { onnxPath: c.onnx, jsonPath: c.json };
    }
  }

  return null;
}

/** Kiểm tra xem một giọng hoặc bất kỳ giọng nào đã được cài đặt */
export function isPiperVoiceInstalled(voiceId?: string): boolean {
  if (voiceId) {
    return resolvePiperVoiceFiles(voiceId) !== null;
  }
  // Kiểm tra xem có ít nhất một giọng đã cài đặt
  for (const v of PIPER_VIETNAMESE_VOICES) {
    if (resolvePiperVoiceFiles(v.id) !== null) return true;
  }
  return false;
}

export function getInstalledPiperVoices(): PiperVoiceSpec[] {
  return PIPER_VIETNAMESE_VOICES.filter((v) => isPiperVoiceInstalled(v.id));
}

export interface PiperSynthesisRequest {
  text: string;
  voiceId?: string;
  speed?: number; // 0.5 - 2.0 (1.0 = normal)
  outWavPath: string;
  signal?: AbortSignal;
}

export interface PiperSynthesisResult {
  durationMs: number;
}

/**
 * Tổng hợp giọng nói tiếng Việt bằng Piper Native
 */
export async function synthesizeWithPiper(
  req: PiperSynthesisRequest,
): Promise<PiperSynthesisResult> {
  const exePath = getPiperExePath();
  if (!fs.existsSync(exePath)) {
    throw new Error(`Không tìm thấy Piper engine tại: ${exePath}`);
  }

  const voiceId = req.voiceId || 'banmai';
  const voiceFiles = resolvePiperVoiceFiles(voiceId);
  if (!voiceFiles) {
    throw new Error(
      `Mô hình giọng đọc Piper "${voiceId}" chưa được cài đặt. Vui lòng tải xuống từ Trung tâm tài nguyên.`,
    );
  }

  // Đảm bảo thư mục đầu ra tồn tại
  const outDir = path.dirname(req.outWavPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // length_scale tỉ lệ nghịch với speed (speed 1.25 -> length_scale 0.8)
  const speed = Number.isFinite(req.speed) && req.speed! > 0 ? req.speed! : 1.0;
  const lengthScale = Math.max(0.5, Math.min(2.0, 1.0 / speed)).toFixed(2);

  const args = [
    '--model',
    voiceFiles.onnxPath,
    '--config',
    voiceFiles.jsonPath,
    '--output_file',
    req.outWavPath,
    '--length_scale',
    String(lengthScale),
  ];

  return new Promise<PiperSynthesisResult>((resolve, reject) => {
    if (req.signal?.aborted) {
      return reject(new Error('Piper synthesis aborted'));
    }

    const proc = spawn(exePath, args, {
      cwd: path.dirname(exePath),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        PATH: `${path.dirname(exePath)}${path.delimiter}${process.env.PATH || ''}`,
        ESPEAK_DATA_PATH: path.join(path.dirname(exePath), 'espeak-ng-data'),
      },
    });

    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    const onAbort = () => {
      try {
        proc.kill('SIGKILL');
      } catch {
        /* ignore */
      }
      reject(new Error('Piper synthesis cancelled'));
    };

    req.signal?.addEventListener('abort', onAbort, { once: true });

    proc.on('close', (code) => {
      req.signal?.removeEventListener('abort', onAbort);
      if (code === 0 && fs.existsSync(req.outWavPath)) {
        try {
          const durationMs = wavDurationMs(req.outWavPath);
          resolve({ durationMs });
        } catch (e) {
          reject(e);
        }
      } else {
        logMessage(`Piper synthesis failed (code ${code}): ${stderr}`, 'error');
        reject(
          new Error(
            `Tổng hợp âm thanh Piper thất bại (code ${code}): ${stderr || 'Unknown error'}`,
          ),
        );
      }
    });

    proc.on('error', (err) => {
      req.signal?.removeEventListener('abort', onAbort);
      reject(err);
    });

    // Truyền text tiếng Việt qua stdin UTF-8
    proc.stdin.write(req.text, 'utf8');
    proc.stdin.end();
  });
}
