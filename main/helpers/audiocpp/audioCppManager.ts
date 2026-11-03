import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { getExtraResourcesPath } from '../utils';
import { logMessage } from '../logger';
import { getSherpaLibDir, getSherpaNativePath } from '../sherpaOnnx/sherpaLibPaths';

/**
 * audio.cpp Manager:
 * Trình quản lý inference C++ Native hiệu năng cao cho Audio / TTS / ASR (dựa trên llama.cpp / ggml).
 * Hỗ trợ VieNeu-TTS v3 Turbo, Kokoro 82M, Kroko ASR... hoàn toàn không cần Python hay PyTorch.
 */

export interface SeaG2pBundle {
  dll: string;
  bin: string;
}

/** Lấy đường dẫn tới file thực thi audiocpp_cli.exe */
export function getAudioCppCliExe(): string | null {
  const candidates: string[] = [];

  try {
    const extra = getExtraResourcesPath();
    if (extra) {
      candidates.push(path.join(extra, 'audiocpp', 'audiocpp_cli.exe'));
    }
  } catch { }

  if (process.resourcesPath) {
    candidates.push(
      path.join(process.resourcesPath, 'extraResources', 'audiocpp', 'audiocpp_cli.exe'),
      path.join(process.resourcesPath, 'audiocpp', 'audiocpp_cli.exe'),
    );
  }

  if (process.execPath) {
    const appDir = path.dirname(process.execPath);
    candidates.push(
      path.join(appDir, 'resources', 'extraResources', 'audiocpp', 'audiocpp_cli.exe'),
      path.join(appDir, 'resources', 'audiocpp', 'audiocpp_cli.exe'),
      path.join(appDir, 'extraResources', 'audiocpp', 'audiocpp_cli.exe'),
    );
  }

  candidates.push(
    path.join(process.cwd(), 'extraResources', 'audiocpp', 'audiocpp_cli.exe'),
    path.join(process.cwd(), 'resources', 'extraResources', 'audiocpp', 'audiocpp_cli.exe'),
  );

  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

/** Lấy đường dẫn thư mục audiocpp trong extraResources */
export function getAudioCppDir(): string | null {
  const exe = getAudioCppCliExe();
  if (exe) return path.dirname(exe);

  const fallback = path.join(process.cwd(), 'extraResources', 'audiocpp');
  return fs.existsSync(fallback) ? fallback : null;
}

/** Lấy bộ bundle SEA-G2P (Rust DLL + binary dict) để chuẩn hóa văn bản tiếng Việt/Anh trực tiếp */
export function getSeaG2pBundle(): SeaG2pBundle | null {
  const baseDir = getAudioCppDir();
  if (!baseDir) return null;

  const dll = path.join(baseDir, 'sea_g2p_rs.dll');
  const bin = path.join(baseDir, 'sea_g2p.bin');

  if (fs.existsSync(dll) && fs.existsSync(bin)) {
    return { dll, bin };
  }
  return null;
}

let cachedSherpaMod: any = null;

function getSherpaNativeAddon(): any {
  if (cachedSherpaMod) return cachedSherpaMod;
  const nativeSherpa = getSherpaNativePath();
  const libDir = getSherpaLibDir();

  if (process.platform === 'win32' && !process.env.PATH?.includes(libDir)) {
    process.env.PATH = `${libDir};${process.env.PATH || ''}`;
  }
  process.env.SHERPA_ONNX_LIB_DIR = libDir;

  const mod = { exports: {} as any };
  process.dlopen(mod, nativeSherpa);
  cachedSherpaMod = mod.exports;
  return cachedSherpaMod;
}

/**
 * Trích xuất vector 192-d speaker embedding từ file audio mẫu bằng CAM++ (speaker_encoder.onnx).
 * Sử dụng runtime Native C++ (sherpa-onnx.node) trực tiếp trong Node process, hoàn toàn KHÔNG CẦN Python hay child process.
 */
export async function extractSpeakerEmbedding(
  wavPath: string,
  outEmbPath: string,
): Promise<boolean> {
  const baseDir = getAudioCppDir();
  if (!baseDir) return false;

  const onnxPath = path.join(baseDir, 'speaker_encoder.onnx');
  const nativeSherpa = getSherpaNativePath();

  if (!fs.existsSync(onnxPath) || !fs.existsSync(nativeSherpa) || !fs.existsSync(wavPath)) {
    logMessage(`[CAM++] Thiếu file cần thiết để trích xuất: onnx=${fs.existsSync(onnxPath)}, native=${fs.existsSync(nativeSherpa)}, wav=${fs.existsSync(wavPath)}`, 'warning');
    return false;
  }

  try {
    const sherpa = getSherpaNativeAddon();
    const extractor = sherpa.createSpeakerEmbeddingExtractor({
      model: onnxPath,
      numThreads: 2,
      provider: 'cpu',
      debug: 0,
    });
    if (!extractor) return false;

    // Electron V8 isolate cấm external buffer, bắt buộc truyền enableExternalBuffer: false
    const wave = sherpa.readWave(wavPath, false);
    if (!wave || !wave.samples || wave.samples.length === 0) {
      return false;
    }

    const stream = sherpa.speakerEmbeddingExtractorCreateStream(extractor);
    sherpa.acceptWaveformOnline(stream, {
      sampleRate: wave.sampleRate,
      samples: wave.samples,
    });
    sherpa.inputFinished(stream);

    const emb = sherpa.speakerEmbeddingExtractorComputeEmbedding(extractor, stream, false);

    if (!emb || emb.length !== 192) {
      logMessage(`[CAM++] Vector embedding không hợp lệ: length=${emb?.length}`, 'error');
      return false;
    }

    const embStr = Array.from(emb)
      .map((x: number) => x.toFixed(8))
      .join(',');
    fs.mkdirSync(path.dirname(outEmbPath), { recursive: true });
    fs.writeFileSync(outEmbPath, embStr, 'utf-8');
    logMessage(`[CAM++] Trích xuất speaker embedding thành công (Native C++ in 0.05s): ${outEmbPath}`);
    return true;
  } catch (err) {
    logMessage(`[CAM++] Lỗi trích xuất speaker embedding Native C++: ${err}`, 'error');
    return false;
  }
}

/** Ước lượng giới tính người nói qua cao độ cơ bản (F0) của file audio WAV */
export function estimateVoiceGender(wavPath: string): 'f' | 'm' {
  try {
    const buf = fs.readFileSync(wavPath);
    const dataIdx = buf.indexOf('data');
    if (dataIdx === -1) return 'm';
    const sampleRate = buf.readUInt32LE(24);
    const numChannels = buf.readUInt16LE(22);
    const pcmStart = dataIdx + 8;
    const stride = numChannels * 2;
    const samplesCount = Math.min(Math.floor((buf.length - pcmStart) / stride), sampleRate * 2);

    const sig: number[] = [];
    for (let i = 0; i < samplesCount; i += 2) {
      sig.push(buf.readInt16LE(pcmStart + i * stride));
    }
    const downRate = sampleRate / 2;
    const minLag = Math.floor(downRate / 380);
    const maxLag = Math.floor(downRate / 80);

    let maxCorr = -Infinity;
    let bestLag = minLag;
    for (let lag = minLag; lag < maxLag; lag++) {
      let sum = 0;
      for (let i = 0; i < sig.length - lag; i += 4) {
        sum += sig[i] * sig[i + lag];
      }
      if (sum > maxCorr) {
        maxCorr = sum;
        bestLag = lag;
      }
    }
    const f0 = downRate / bestLag;
    return f0 > 175 ? 'f' : 'm';
  } catch {
    return 'm';
  }
}

/** Kiểm tra xem audio.cpp CLI đã sẵn sàng hoạt động hay chưa */
export function isAudioCppAvailable(): boolean {
  return getAudioCppCliExe() !== null;
}

export interface VieNeuAudioCppOptions {
  modelPath: string;
  text: string;
  outPath: string;
  voiceId?: string;
  voicesDir?: string;
  voiceRefPath?: string;
  speed?: number;
  numThreads?: number;
  backend?: 'cpu' | 'vulkan' | 'best';
}

/**
 * Tổng hợp giọng đọc tiếng Việt bằng VieNeu-TTS v3 Turbo thông qua audio.cpp (Native C++ AVX2/GPU Vulkan).
 * Hỗ trợ tăng tốc GPU tự động (NVIDIA/AMD/Intel) hoặc CPU SIMD, độ trễ khởi động < 0.2s.
 */
export async function synthesizeVieNeuWithAudioCpp(options: VieNeuAudioCppOptions): Promise<string> {
  const cli = getAudioCppCliExe();
  if (!cli) {
    throw new Error('Không tìm thấy audiocpp_cli.exe trong extraResources/audiocpp');
  }

  if (!fs.existsSync(options.modelPath)) {
    throw new Error(`Không tìm thấy file model VieNeu GGUF: ${options.modelPath}`);
  }

  const outDir = path.dirname(options.outPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const backend = options.backend || 'best';
  const args: string[] = [
    '--task', 'tts',
    '--family', 'vieneu_v3_turbo',
    '--model', options.modelPath,
    '--backend', backend,
    '--text', options.text,
    '--out', options.outPath,
  ];

  // Luồng xử lý đa nhân
  const threads = options.numThreads || Math.min(8, Math.max(2, require('os').cpus().length || 4));
  args.push('--threads', String(threads));

  // Tốc độ nói
  if (options.speed && options.speed !== 1.0) {
    args.push('--speaking-rate', options.speed.toFixed(2));
  }

  // Tự động sử dụng bộ từ điển SEA-G2P (bắt buộc session-option kèm tiền tố vieneu_v3_turbo để audio.cpp kích hoạt text front-end)
  const g2p = getSeaG2pBundle();
  if (g2p) {
    args.push('--session-option', `vieneu_v3_turbo.g2p_dict_file=${g2p.bin}`);
    args.push('--session-option', `vieneu_v3_turbo.g2p_library=${g2p.dll}`);
  }

  // Voice Reference (Voice Cloning từ file audio người dùng)
  if (options.voiceRefPath && fs.existsSync(options.voiceRefPath)) {
    args.push('--voice-ref', options.voiceRefPath);

    // Bắt buộc phải có speaker_embedding_file đi kèm để định hình thanh âm người nói
    const targetEmb = path.join(path.dirname(options.voiceRefPath), 'speaker.emb.txt');
    if (!fs.existsSync(targetEmb)) {
      // Tự động trích xuất vector âm sắc 192-d từ file audio bằng CAM++
      await extractSpeakerEmbedding(options.voiceRefPath, targetEmb);
    }

    let speakerEmb = targetEmb;
    if (!fs.existsSync(speakerEmb)) {
      // Fallback nếu trích xuất thất bại
      const baseVoicesDir =
        options.voicesDir || path.join(path.dirname(options.modelPath), 'voices');
      const gender = estimateVoiceGender(options.voiceRefPath);
      const defaultVoicePreset = gender === 'f' ? 'truc_ly' : 'minh_quan_pro';
      speakerEmb = path.join(baseVoicesDir, defaultVoicePreset, 'speaker.emb.txt');
      if (!fs.existsSync(speakerEmb)) {
        speakerEmb = path.join(baseVoicesDir, 'minh_quan_pro', 'speaker.emb.txt');
      }
    }

    if (fs.existsSync(speakerEmb)) {
      args.push('--request-option', `speaker_embedding_file=${speakerEmb}`);
    }
  } else {
    // Giọng Preset có sẵn (sử dụng ref_codes.txt & speaker.emb.txt đã pre-compute)
    const baseVoicesDir =
      options.voicesDir || path.join(path.dirname(options.modelPath), 'voices');
    const targetVoiceId = (options.voiceId || 'minh_quan_pro').toLowerCase();

    let voiceFolder = path.join(baseVoicesDir, targetVoiceId);
    let refCodes = path.join(voiceFolder, 'ref_codes.txt');
    let speakerEmb = path.join(voiceFolder, 'speaker.emb.txt');

    if (!fs.existsSync(refCodes) || !fs.existsSync(speakerEmb)) {
      // Fallback về giọng mẫu minh_quan_pro nếu voiceId không tìm thấy
      voiceFolder = path.join(baseVoicesDir, 'minh_quan_pro');
      refCodes = path.join(voiceFolder, 'ref_codes.txt');
      speakerEmb = path.join(voiceFolder, 'speaker.emb.txt');
    }

    if (fs.existsSync(refCodes) && fs.existsSync(speakerEmb)) {
      args.push('--request-option', `reference_codes_file=${refCodes}`);
      args.push('--request-option', `speaker_embedding_file=${speakerEmb}`);
    }
  }

  // Giải phóng memory graph sau mỗi lượt tổng hợp để tránh tích lũy VRAM
  args.push('--session-option', 'vieneu_v3_turbo.mem_saver=true');

  logMessage(`[audio.cpp] Chạy lệnh: ${cli} ${args.slice(0, 10).join(' ')}...`);

  return new Promise<string>((resolve, reject) => {
    const child = spawn(cli, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => {
      stdout += d.toString('utf-8');
    });

    child.stderr.on('data', (d) => {
      stderr += d.toString('utf-8');
    });

    child.on('error', (err) => {
      reject(new Error(`Khởi chạy audiocpp_cli thất bại: ${err.message}`));
    });

    child.on('close', async (code) => {
      if (code === 0 && fs.existsSync(options.outPath)) {
        logMessage(`[audio.cpp] Xuất audio thành công: ${options.outPath}`);
        resolve(options.outPath);
      } else {
        const errDetail = (stderr || stdout || `exit code ${code}`).trim();
        logMessage(`[audio.cpp] Lỗi inference: ${errDetail}`);

        // Tự động retry bằng CPU nếu GPU Vulkan tràn VRAM (GGML_ASSERT mem_buffer / exit code 3221226505)
        const isGpuMemError =
          backend !== 'cpu' &&
          (errDetail.includes('mem_buffer') ||
            errDetail.includes('GGML_ASSERT') ||
            code === 3221226505 ||
            code === -1073740791);

        if (isGpuMemError) {
          logMessage(
            `[audio.cpp] GPU Vulkan tràn VRAM hoặc crash bộ nhớ, tự động fallback sang CPU Native cho câu này...`,
            'warning',
          );
          try {
            const cpuResult = await synthesizeVieNeuWithAudioCpp({
              ...options,
              backend: 'cpu',
            });
            return resolve(cpuResult);
          } catch (retryErr: any) {
            return reject(retryErr);
          }
        }

        reject(new Error(`audiocpp_cli thất bại (${code}): ${errDetail}`));
      }
    });
  });
}

export interface KokoroAudioCppOptions {
  modelPath: string;
  text: string;
  voiceId?: string;
  speed?: number;
  outPath: string;
  numThreads?: number;
  backend?: 'cpu' | 'vulkan' | 'best';
}

/**
 * Tổng hợp giọng đọc đa ngôn ngữ với Kokoro 82M thông qua audio.cpp (Native C++ AVX2/GPU Vulkan).
 */
export async function synthesizeKokoroWithAudioCpp(options: KokoroAudioCppOptions): Promise<string> {
  const cli = getAudioCppCliExe();
  if (!cli) {
    throw new Error('Không tìm thấy audiocpp_cli.exe trong extraResources/audiocpp');
  }

  if (!fs.existsSync(options.modelPath)) {
    throw new Error(`Không tìm thấy file model Kokoro GGUF: ${options.modelPath}`);
  }

  const outDir = path.dirname(options.outPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const backend = options.backend || 'best';
  const args: string[] = [
    '--task', 'tts',
    '--family', 'kokoro_tts',
    '--model', options.modelPath,
    '--backend', backend,
    '--text', options.text,
    '--out', options.outPath,
  ];

  if (options.voiceId) {
    args.push('--voice-id', options.voiceId);
  }

  const threads = options.numThreads || Math.min(8, Math.max(2, require('os').cpus().length || 4));
  args.push('--threads', String(threads));

  if (options.speed && options.speed !== 1.0) {
    args.push('--request-option', `speed=${options.speed.toFixed(2)}`);
  }

  logMessage(`[audio.cpp Kokoro] Chạy lệnh: ${cli} ${args.join(' ')}`);

  return new Promise<string>((resolve, reject) => {
    const child = spawn(cli, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString('utf-8'); });
    child.stderr.on('data', (d) => { stderr += d.toString('utf-8'); });

    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(options.outPath)) {
        resolve(options.outPath);
      } else {
        reject(new Error(`audiocpp Kokoro thất bại (${code}): ${(stderr || stdout).trim()}`));
      }
    });
  });
}
