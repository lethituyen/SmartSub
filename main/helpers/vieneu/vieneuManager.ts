import path from 'path';
import fs from 'fs';
import { getTtsModelsRoot } from '../ttsModelCatalog';
import { wavDurationMs } from '../dubbing/audioPipeline';
import { logMessage } from '../logger';
import { isAudioCppAvailable, synthesizeVieNeuWithAudioCpp } from '../audiocpp/audioCppManager';

export interface VieNeuVoiceSpec {
  id: string;
  name: string;
  label: string;
  labelEn: string;
  gender: 'f' | 'm';
  region: 'north' | 'south' | 'central';
  lang: 'vi';
}

/**
 * 11 giọng đọc tiếng Việt tích hợp sẵn của VieNeu-TTS v3 Nano / Turbo
 */
export const VIENEU_PRESET_VOICES: VieNeuVoiceSpec[] = [
  // --- Miền Bắc ---
  {
    id: 'minh_quan_pro',
    name: 'Minh Quân Pro',
    label: '⭐ Minh Quân Pro (Nam - Miền Bắc, tự nhiên)',
    labelEn: 'Minh Quan Pro (Male - North, natural)',
    gender: 'm',
    region: 'north',
    lang: 'vi',
  },
  {
    id: 'adam_bua',
    name: 'Adam bựa',
    label: '⭐ Adam bựa (Nam - Miền Bắc, hài hước/tự nhiên)',
    labelEn: 'Adam Bua (Male - North, humorous/natural)',
    gender: 'm',
    region: 'north',
    lang: 'vi',
  },
  {
    id: 'truc_ly',
    name: 'Trúc Ly',
    label: '⭐ Trúc Ly (Nữ - Miền Bắc, tự nhiên)',
    labelEn: 'Truc Ly (Female - North, natural)',
    gender: 'f',
    region: 'north',
    lang: 'vi',
  },
  {
    id: 'anh_khoi',
    name: 'Anh Khôi',
    label: '⭐ Anh Khôi (Nam - Miền Bắc, kể chuyện)',
    labelEn: 'Anh Khoi (Male - North, storytelling)',
    gender: 'm',
    region: 'north',
    lang: 'vi',
  },
  {
    id: 'mai_anh',
    name: 'Mai Anh',
    label: '⭐ Mai Anh (Nữ - Miền Bắc, tin tức)',
    labelEn: 'Mai Anh (Female - North, news)',
    gender: 'f',
    region: 'north',
    lang: 'vi',
  },
  {
    id: 'thien_tam_duc',
    name: 'Thiền Tâm Đức',
    label: '⭐ Thiền Tâm Đức (Nam - Miền Bắc, kể chuyện/tâm sự)',
    labelEn: 'Thien Tam Duc (Male - North, storytelling)',
    gender: 'm',
    region: 'north',
    lang: 'vi',
  },
  {
    id: 'ngoc_huyen',
    name: 'Ngọc Huyền',
    label: '⭐ Ngọc Huyền (Nữ - Miền Bắc, tự nhiên)',
    labelEn: 'Ngoc Huyen (Female - North, natural)',
    gender: 'f',
    region: 'north',
    lang: 'vi',
  },
  {
    id: 'minh_duc',
    name: 'Minh Đức',
    label: 'Minh Đức (Nam - Miền Bắc, tin tức)',
    labelEn: 'Minh Duc (Male - North, news)',
    gender: 'm',
    region: 'north',
    lang: 'vi',
  },
  {
    id: 'pham_tuyen',
    name: 'Phạm Tuyên',
    label: 'Phạm Tuyên (Nam - Miền Bắc, tự nhiên)',
    labelEn: 'Pham Tuyen (Male - North, natural)',
    gender: 'm',
    region: 'north',
    lang: 'vi',
  },
  {
    id: 'xuan_vinh',
    name: 'Xuân Vĩnh',
    label: 'Xuân Vĩnh (Nam - Miền Bắc, tự nhiên)',
    labelEn: 'Xuan Vinh (Male - North, natural)',
    gender: 'm',
    region: 'north',
    lang: 'vi',
  },
  {
    id: 'thanh_binh',
    name: 'Thanh Bình',
    label: 'Thanh Bình (Nam - Miền Bắc, kể chuyện)',
    labelEn: 'Thanh Binh (Male - North, storytelling)',
    gender: 'm',
    region: 'north',
    lang: 'vi',
  },
  {
    id: 'ngoc_linh',
    name: 'Ngọc Linh',
    label: 'Ngọc Linh (Nữ - Miền Bắc, kể chuyện)',
    labelEn: 'Ngoc Linh (Female - North, storytelling)',
    gender: 'f',
    region: 'north',
    lang: 'vi',
  },
  {
    id: 'doan_trang',
    name: 'Đoan Trang',
    label: 'Đoan Trang (Nữ - Miền Bắc, tự nhiên)',
    labelEn: 'Doan Trang (Female - North, natural)',
    gender: 'f',
    region: 'north',
    lang: 'vi',
  },
  {
    id: 'quynh_anh',
    name: 'Quỳnh Anh',
    label: 'Quỳnh Anh (Nữ - Miền Bắc, đọc truyện)',
    labelEn: 'Quynh Anh (Female - North, audiobook)',
    gender: 'f',
    region: 'north',
    lang: 'vi',
  },
  {
    id: 'manh_dung',
    name: 'Mạnh Dũng',
    label: 'Mạnh Dũng (Nam - Miền Bắc, tự nhiên)',
    labelEn: 'Manh Dung (Male - North, natural)',
    gender: 'm',
    region: 'north',
    lang: 'vi',
  },

  // --- Miền Trung ---
  {
    id: 'quang_son',
    name: 'Quang Sơn',
    label: '⭐ Quang Sơn (Nam - Miền Trung, tự nhiên)',
    labelEn: 'Quang Son (Male - Central, natural)',
    gender: 'm',
    region: 'central',
    lang: 'vi',
  },
  {
    id: 'ngoc_tran',
    name: 'Ngọc Trân',
    label: '⭐ Ngọc Trân (Nữ - Miền Trung, tự nhiên)',
    labelEn: 'Ngoc Tran (Female - Central, natural)',
    gender: 'f',
    region: 'central',
    lang: 'vi',
  },

  // --- Miền Nam ---
  {
    id: 'thuy_dung',
    name: 'Thùy Dung',
    label: '⭐ Thùy Dung (Nữ - Miền Nam, tin tức)',
    labelEn: 'Thuy Dung (Female - South, news)',
    gender: 'f',
    region: 'south',
    lang: 'vi',
  },
  {
    id: 'thai_son',
    name: 'Thái Sơn',
    label: 'Thái Sơn (Nam - Miền Nam, kể chuyện)',
    labelEn: 'Thai Son (Male - South, storytelling)',
    gender: 'm',
    region: 'south',
    lang: 'vi',
  },
  {
    id: 'thuc_doan',
    name: 'Thục Đoan',
    label: 'Thục Đoan (Nữ - Miền Nam, kể chuyện)',
    labelEn: 'Thuc Doan (Female - South, storytelling)',
    gender: 'f',
    region: 'south',
    lang: 'vi',
  },
  {
    id: 'minh_triet',
    name: 'Minh Triết',
    label: 'Minh Triết (Nam - Miền Nam, tin tức)',
    labelEn: 'Minh Triet (Male - South, news)',
    gender: 'm',
    region: 'south',
    lang: 'vi',
  },
  {
    id: 'my_duyen',
    name: 'Mỹ Duyên',
    label: 'Mỹ Duyên (Nữ - Miền Nam, đọc truyện)',
    labelEn: 'My Duyen (Female - South, audiobook)',
    gender: 'f',
    region: 'south',
    lang: 'vi',
  },
  {
    id: 'duc_tri',
    name: 'Đức Trí',
    label: 'Đức Trí (Nam - Miền Nam, đọc truyện)',
    labelEn: 'Duc Tri (Male - South, audiobook)',
    gender: 'm',
    region: 'south',
    lang: 'vi',
  },
  {
    id: 'kim_thanh',
    name: 'Kim Thanh',
    label: 'Kim Thanh (Nữ - Miền Nam, đọc truyện)',
    labelEn: 'Kim Thanh (Female - South, audiobook)',
    gender: 'f',
    region: 'south',
    lang: 'vi',
  },
  {
    id: 'adam',
    name: 'Adam',
    label: 'Adam (Nam - Miền Nam, tự nhiên)',
    labelEn: 'Adam (Male - South, natural)',
    gender: 'm',
    region: 'south',
    lang: 'vi',
  },
];

/** Thư mục chứa model VieNeu-TTS */
export function getVieNeuModelsDir(): string {
  const root = path.join(getTtsModelsRoot(), 'vieneu-vietnamese');
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }
  return root;
}

/** Kiểm tra xem model VieNeu-TTS đã được cài đặt chưa */
export function isVieNeuInstalled(): boolean {
  const modelDir = getVieNeuModelsDir();
  if (fs.existsSync(path.join(modelDir, 'installed.json'))) {
    return true;
  }

  // Kiểm tra model GGUF v3 Turbo (audio.cpp Native C++)
  if (fs.existsSync(path.join(modelDir, 'vieneu-v3-turbo-q8_0.gguf'))) {
    return true;
  }

  return false;
}

/** Danh sách giọng VieNeu có sẵn */
export function getInstalledVieNeuVoices(): VieNeuVoiceSpec[] {
  return VIENEU_PRESET_VOICES;
}

/** Kiểm tra xem VieNeu Engine có khả dụng không (dựa trên audio.cpp Native C++) */
export async function isVieNeuEngineInstalled(): Promise<boolean> {
  return isAudioCppAvailable();
}

export interface VieNeuSynthesisRequest {
  text: string;
  voiceId?: string;
  /** Đường dẫn file âm thanh tham chiếu 3-15s để clone giọng nói */
  refAudioPath?: string;
  speed?: number; // 0.5 - 2.0 (1.0 = normal)
  steps?: number; // Không dùng trong bản native GGUF
  outWavPath: string;
  signal?: AbortSignal;
}

export interface VieNeuSynthesisResult {
  durationMs: number;
}

/**
 * Tổng hợp giọng nói tiếng Việt bằng VieNeu-TTS Engine thông qua audio.cpp C++ Native AVX2/SIMD
 * Không phụ thuộc Python hay PyTorch, khởi động tức thì < 0.2s và chất lượng 48kHz stereo.
 */
export async function synthesizeWithVieNeu(
  req: VieNeuSynthesisRequest,
): Promise<VieNeuSynthesisResult> {
  if (req.signal?.aborted) {
    throw new Error('VieNeu synthesis aborted');
  }

  const modelDir = getVieNeuModelsDir();
  const ggufPath = path.join(modelDir, 'vieneu-v3-turbo-q8_0.gguf');
  if (!fs.existsSync(ggufPath)) {
    throw new Error(
      'Chưa tìm thấy model VieNeu GGUF (vieneu-v3-turbo-q8_0.gguf). Vui lòng tải model trong Cài đặt.',
    );
  }

  // Đảm bảo thư mục đầu ra tồn tại
  const outDir = path.dirname(req.outWavPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const speed = Number.isFinite(req.speed) && req.speed! > 0 ? req.speed! : 1.0;
  const voiceId = (req.voiceId || 'minh_quan_pro').toLowerCase();
  const voicesDir = path.join(modelDir, 'voices');

  await synthesizeVieNeuWithAudioCpp({
    modelPath: ggufPath,
    text: req.text,
    outPath: req.outWavPath,
    voiceId,
    voicesDir: fs.existsSync(voicesDir) ? voicesDir : undefined,
    voiceRefPath: req.refAudioPath,
    speed,
  });

  const durationMs = wavDurationMs(req.outWavPath) || 0;
  logMessage(
    `VieNeu C++ synthesis done: voice=${req.refAudioPath ? 'clone' : voiceId}, duration=${durationMs}ms`,
  );
  return { durationMs };
}
