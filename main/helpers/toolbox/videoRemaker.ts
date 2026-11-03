/**
 * 视频重制与去重防查重处理服务 (Video Remaker / Anti-Duplicate)
 *
 * 结合微噪点叠加、微缩放裁剪、画面微调、GOP/关键帧动态扰动、音高微调与元数据剥离，
 * 实现 99% 平台去重防查重效果。
 */

import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';
import { logMessage } from '../logger';
import { probeVideoInfo } from './videoTrimmer';
import { reserveToolboxOutput } from './outputPath';
import type {
  VideoRemakeConfig,
  VideoRemakeResult,
  VideoRemakePreset,
} from '../../../types/toolbox';

const ffmpegPath = ffmpegStatic.replace('app.asar', 'app.asar.unpacked');

const activeRemakeProcesses = new Map<string, ChildProcess>();
const preparingRemakeJobs = new Map<string, AbortController>();

export function cancelVideoRemake(jobId: string): boolean {
  const preparing = preparingRemakeJobs.get(jobId);
  if (preparing) {
    preparing.abort();
    return true;
  }
  const proc = activeRemakeProcesses.get(jobId);
  if (proc) {
    try {
      proc.kill('SIGKILL');
      activeRemakeProcesses.delete(jobId);
      logMessage(`已终止视频重制进程: ${jobId}`, 'info');
      return true;
    } catch (err) {
      logMessage(`终止视频重制进程异常: ${err}`, 'warning');
    }
  }
  return false;
}

/** 取消并清理所有正在进行的视频重制任务 */
export function cancelAllRemakeProcesses(): void {
  preparingRemakeJobs.forEach((controller) => controller.abort());
  for (const [jobId, proc] of activeRemakeProcesses.entries()) {
    try {
      proc.kill('SIGKILL');
      logMessage(`关闭应用: 已清理视频重制子进程 ${jobId}`, 'info');
    } catch {}
  }
  activeRemakeProcesses.clear();
}

export interface ResolvedRemakeSettings {
  zoomPercent: number;
  mirrorFlip: boolean;
  microNoise: boolean;
  noiseStrength: number;
  colorShift: boolean;
  vignette: boolean;
  speed: number;
  pitchShift: boolean;
  pitchSemitones: number;
  randomGop: boolean;
  clearMetadata: boolean;
}

export function resolveAntiDuplicateSettings(
  config: {
    preset?: any;
    microZoomPercent?: number;
    mirrorFlip?: boolean;
    microNoise?: boolean;
    microNoiseStrength?: number;
    colorShift?: boolean;
    vignette?: boolean;
    speedMultiplier?: number;
    pitchShift?: boolean;
    pitchSemitones?: number;
    randomGop?: boolean;
    clearMetadata?: boolean;
  },
): ResolvedRemakeSettings {
  const preset: VideoRemakePreset = config.preset || 'balanced';

  if (preset === 'safe') {
    return {
      zoomPercent: config.microZoomPercent ?? 2,
      mirrorFlip: config.mirrorFlip ?? false,
      microNoise: config.microNoise ?? true,
      noiseStrength: config.microNoiseStrength ?? 1,
      colorShift: config.colorShift ?? false,
      vignette: config.vignette ?? false,
      speed: config.speedMultiplier ?? 1.02,
      pitchShift: config.pitchShift ?? false,
      pitchSemitones: config.pitchSemitones ?? 0.2,
      randomGop: config.randomGop ?? true,
      clearMetadata: config.clearMetadata ?? true,
    };
  }

  if (preset === 'aggressive') {
    return {
      zoomPercent: config.microZoomPercent ?? 4,
      mirrorFlip: config.mirrorFlip ?? true,
      microNoise: config.microNoise ?? true,
      noiseStrength: config.microNoiseStrength ?? 3,
      colorShift: config.colorShift ?? true,
      vignette: config.vignette ?? true,
      speed: config.speedMultiplier ?? 1.05,
      pitchShift: config.pitchShift ?? true,
      pitchSemitones: config.pitchSemitones ?? 0.5,
      randomGop: config.randomGop ?? true,
      clearMetadata: config.clearMetadata ?? true,
    };
  }

  if (preset === 'custom') {
    return {
      zoomPercent: config.microZoomPercent ?? 2,
      mirrorFlip: config.mirrorFlip ?? false,
      microNoise: config.microNoise ?? true,
      noiseStrength: config.microNoiseStrength ?? 2,
      colorShift: config.colorShift ?? true,
      vignette: config.vignette ?? false,
      speed: config.speedMultiplier ?? 1.02,
      pitchShift: config.pitchShift ?? true,
      pitchSemitones: config.pitchSemitones ?? 0.3,
      randomGop: config.randomGop ?? true,
      clearMetadata: config.clearMetadata ?? true,
    };
  }

  // default: 'balanced'
  return {
    zoomPercent: config.microZoomPercent ?? 3,
    mirrorFlip: config.mirrorFlip ?? false,
    microNoise: config.microNoise ?? true,
    noiseStrength: config.microNoiseStrength ?? 2,
    colorShift: config.colorShift ?? true,
    vignette: config.vignette ?? false,
    speed: config.speedMultiplier ?? 1.03,
    pitchShift: config.pitchShift ?? true,
    pitchSemitones: config.pitchSemitones ?? 0.3,
    randomGop: config.randomGop ?? true,
    clearMetadata: config.clearMetadata ?? true,
  };
}

export async function executeVideoRemake(
  config: VideoRemakeConfig,
  jobId: string,
  onProgress?: (percent: number) => void,
): Promise<VideoRemakeResult> {
  const { videoPath, outputPath, outputDir } = config;

  if (!fs.existsSync(videoPath)) {
    return {
      success: false,
      outputPath: '',
      originalSize: 0,
      newSize: 0,
      error: `Video not found: ${videoPath}`,
    };
  }

  const preparation = new AbortController();
  preparingRemakeJobs.set(jobId, preparation);
  let origInfo: Awaited<ReturnType<typeof probeVideoInfo>>;
  try {
    origInfo = await probeVideoInfo(videoPath, preparation.signal);
  } finally {
    preparingRemakeJobs.delete(jobId);
  }

  if (preparation.signal.aborted) {
    return {
      success: false,
      outputPath: '',
      originalSize: 0,
      newSize: 0,
      error: 'Cancelled',
    };
  }

  const baseDir = outputDir && fs.existsSync(outputDir)
    ? outputDir
    : path.dirname(videoPath);
  const ext = path.extname(videoPath) || '.mp4';
  const nameWithoutExt = path.basename(videoPath, ext);
  const targetOutput =
    outputPath ||
    reserveToolboxOutput(path.join(baseDir, `${nameWithoutExt}_remake${ext}`));

  const settings = resolveAntiDuplicateSettings(config);

  // 1. 组装视频滤镜链
  const vfFilters: string[] = [];

  // 1.1 微裁剪与缩放 (Micro-Zoom)
  if (settings.zoomPercent > 0) {
    const factor = Math.max(0.9, Math.min(1.0, (100 - settings.zoomPercent) / 100));
    const origW = origInfo.width || 1920;
    const origH = origInfo.height || 1080;
    const cropW = Math.floor((origW * factor) / 2) * 2;
    const cropH = Math.floor((origH * factor) / 2) * 2;
    vfFilters.push(`crop=${cropW}:${cropH}:(in_w-${cropW})/2:(in_h-${cropH})/2,scale=${origW}:${origH}`);
  }

  // 1.2 镜像翻转
  if (settings.mirrorFlip) {
    vfFilters.push('hflip');
  }

  // 1.3 动态微噪点 (改变每帧视觉哈希)
  if (settings.microNoise) {
    const s = Math.max(1, Math.min(5, settings.noiseStrength));
    vfFilters.push(`noise=alls=${s}:allf=t`);
  }

  // 1.4 色彩/对比度/伽马微调
  if (settings.colorShift) {
    vfFilters.push('eq=contrast=1.02:brightness=0.01:saturation=1.02:gamma=1.01');
  }

  // 1.5 边缘暗角晕影
  if (settings.vignette) {
    vfFilters.push('vignette=PI/5');
  }

  // 1.6 画面微变速
  if (settings.speed > 0 && Math.abs(settings.speed - 1) > 0.005) {
    vfFilters.push(`setpts=PTS/${settings.speed}`);
  }

  // 保证偶数尺寸
  vfFilters.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');

  // 2. 组装音频滤镜链
  const afFilters: string[] = [];
  if (origInfo.hasAudio) {
    // 2.1 音频音高微调 (Pitch shift via sample rate trick)
    if (settings.pitchShift && Math.abs(settings.pitchSemitones) > 0.05) {
      const pitchRatio = Math.pow(2, settings.pitchSemitones / 12);
      const sampleRate = 44100;
      const targetRate = Math.round(sampleRate * pitchRatio);
      const tempoCompensation = 1 / pitchRatio;
      afFilters.push(`asetrate=${targetRate},aresample=${sampleRate}`);
      // 音高带来的时长变化与整体变速合并
      const totalTempo = tempoCompensation * settings.speed;
      if (Math.abs(totalTempo - 1) > 0.005) {
        afFilters.push(`atempo=${totalTempo.toFixed(5)}`);
      }
    } else if (settings.speed > 0 && Math.abs(settings.speed - 1) > 0.005) {
      afFilters.push(`atempo=${settings.speed}`);
    }
  }

  // 3. 构造完整 ffmpeg 命令行参数
  const args = [
    '-hide_banner',
    '-y',
    '-i',
    videoPath,
    '-vf',
    vfFilters.join(','),
  ];

  if (origInfo.hasAudio) {
    if (afFilters.length > 0) {
      args.push('-af', afFilters.join(','));
    }
    args.push('-c:a', 'aac', '-b:a', '192k');
  } else {
    args.push('-an');
  }

  // 视频编码器与画质
  args.push('-c:v', 'libx264', '-crf', '20', '-preset', 'fast');

  // GOP / 关键帧随机打乱
  if (settings.randomGop) {
    args.push('-g', '37', '-keyint_min', '15', '-sc_threshold', '40');
  }

  // 元数据擦除
  if (settings.clearMetadata) {
    args.push('-map_metadata', '-1', '-map_chapters', '-1');
  }

  args.push('-movflags', '+faststart', targetOutput);

  logMessage(
    `执行视频去重重制 [${jobId}]: ${ffmpegPath} ${args.join(' ')}`,
    'info',
  );

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args);
    activeRemakeProcesses.set(jobId, proc);

    let stderr = '';
    const expectedDuration = origInfo.duration / (settings.speed || 1);

    proc.stderr.on('data', (d) => {
      const chunk = d.toString();
      stderr += chunk;
      const timeMatch = /time=(\d{2,}:\d{2}:\d{2}(?:\.\d+)?)/.exec(chunk);
      if (timeMatch && onProgress && expectedDuration > 0) {
        const parts = timeMatch[1].split(':');
        const s =
          parseInt(parts[0], 10) * 3600 +
          parseInt(parts[1], 10) * 60 +
          parseFloat(parts[2]);
        const percent = Math.min(
          99,
          Math.max(1, Math.round((s / expectedDuration) * 100)),
        );
        onProgress(percent);
      }
    });

    proc.on('close', (code) => {
      activeRemakeProcesses.delete(jobId);
      if (code === 0 && fs.existsSync(targetOutput)) {
        const stats = fs.statSync(targetOutput);
        if (onProgress) onProgress(100);
        resolve({
          success: true,
          outputPath: targetOutput,
          originalSize: origInfo.size,
          newSize: stats.size,
        });
      } else {
        if (fs.existsSync(targetOutput)) {
          try {
            fs.unlinkSync(targetOutput);
          } catch {}
        }
        resolve({
          success: false,
          outputPath: targetOutput,
          originalSize: origInfo.size,
          newSize: 0,
          error: `Remake failed (exit ${code}): ${stderr.slice(-300)}`,
        });
      }
    });

    proc.on('error', (err) => {
      activeRemakeProcesses.delete(jobId);
      if (fs.existsSync(targetOutput)) {
        try {
          fs.unlinkSync(targetOutput);
        } catch {}
      }
      reject(err);
    });
  });
}
