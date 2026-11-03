import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { app } from 'electron';
import ffmpegStatic from 'ffmpeg-static';
import { getExtraResourcesPath } from '../utils';
import { logMessage } from '../logger';
import type {
  VideoOcrSubtitlesConfig,
  VideoOcrSubtitlesProgress,
  VideoOcrSubtitlesResult,
  VideoOcrPreviewResult,
  VideoOcrRoi,
} from '../../../types/toolbox';

const ffmpegPath = (ffmpegStatic || '').replace('app.asar', 'app.asar.unpacked');

interface ActiveJob {
  videoPath: string;
  ffProc?: ChildProcess;
  ocrProc?: ChildProcess;
  tempDir?: string;
  cancelled?: boolean;
}

// Map of active OCR jobs keyed by videoPath
const activeOcrJobs = new Map<string, ActiveJob>();

export interface SubtitleCue {
  startTime: number;
  endTime: number;
  text: string;
}

/**
 * Resolves the path to the native RapidOCR-json binary.
 */
export function getOcrWorkerExe(): string | null {
  const candidates = [
    path.join(getExtraResourcesPath(), 'ocr', 'RapidOCR-json.exe'),
    path.join(process.cwd(), 'extraResources', 'ocr', 'RapidOCR-json.exe'),
    path.join(__dirname, '..', '..', 'extraResources', 'ocr', 'RapidOCR-json.exe'),
    path.join(getExtraResourcesPath(), 'ocr', 'ppocrv6_worker.exe'),
    path.join(process.cwd(), 'extraResources', 'ocr', 'ppocrv6_worker.exe'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Resolves paths to PP-OCRv6 detection, recognition models, and dictionary.
 */
export function getOcrModelPaths(): {
  modelsDir: string;
  detModel: string;
  recModel: string;
  clsModel: string;
  dictPath: string;
} {
  const extraDir = path.join(getExtraResourcesPath(), 'ocr', 'models');
  const localDir = path.join(process.cwd(), 'extraResources', 'ocr', 'models');

  let baseDir = extraDir;
  if (fs.existsSync(path.join(localDir, 'det.onnx'))) {
    baseDir = localDir;
  }

  return {
    modelsDir: baseDir,
    detModel: path.join(baseDir, 'det.onnx'),
    recModel: path.join(baseDir, 'rec.onnx'),
    clsModel: path.join(baseDir, 'cls.onnx'),
    dictPath: path.join(baseDir, 'dict.txt'),
  };
}

/**
 * Checks if the PP-OCRv6 models and Native engine exist locally.
 */
export function areOcrModelsReady(): boolean {
  const exe = getOcrWorkerExe();
  const { detModel, recModel, dictPath } = getOcrModelPaths();
  return (
    exe !== null &&
    fs.existsSync(exe) &&
    fs.existsSync(detModel) &&
    fs.existsSync(recModel) &&
    fs.existsSync(dictPath)
  );
}

/**
 * Converts a VideoOcrRoi object into normalized percentage string.
 */
export function normalizeRoi(roi?: VideoOcrRoi): {
  ymin: number;
  ymax: number;
  xmin: number;
  xmax: number;
} {
  return {
    ymin: Math.max(0, Math.min(1, roi?.ymin ?? 0.78)),
    ymax: Math.max(0, Math.min(1, roi?.ymax ?? 0.98)),
    xmin: Math.max(0, Math.min(1, roi?.xmin ?? 0.05)),
    xmax: Math.max(0, Math.min(1, roi?.xmax ?? 0.95)),
  };
}

/**
 * Formats seconds into standard SRT timestamp 00:00:00,000
 */
export function formatSrtTimestamp(seconds: number): string {
  const s = Math.max(0, seconds || 0);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 1000);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * Strips whitespace, punctuation, and non-alphanumeric characters for fuzzy matching.
 */
export function cleanText(s: string): string {
  return (s || '').replace(/[\s\W_]+/g, '').toLowerCase();
}

/**
 * Computes normalized Levenshtein similarity between 0.0 and 1.0.
 */
export function levenshteinSimilarity(s1: string, s2: string): number {
  const str1 = s1.trim();
  const str2 = s2.trim();
  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0.0;
  const l1 = str1.length;
  const l2 = str2.length;
  const dp: number[][] = Array.from({ length: l1 + 1 }, () => new Array(l2 + 1).fill(0));
  for (let i = 0; i <= l1; i++) dp[i][0] = i;
  for (let j = 0; j <= l2; j++) dp[0][j] = j;

  for (let i = 1; i <= l1; i++) {
    for (let j = 1; j <= l2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  const dist = dp[l1][l2];
  return 1.0 - dist / Math.max(l1, l2);
}

/**
 * Checks whether two cue texts match using containment and fuzzy similarity.
 */
export function areCuesMatching(s1: string, s2: string, simThreshold = 0.68): boolean {
  const c1 = cleanText(s1);
  const c2 = cleanText(s2);
  if (!c1 || !c2) return false;
  if (c1 === c2) return true;
  if (c1.includes(c2) || c2.includes(c1)) return true;
  return levenshteinSimilarity(c1, c2) >= simThreshold;
}

/**
 * Post-processing: Gap bridging and glitch suppression.
 */
export function optimizeSubtitleCues(
  cues: SubtitleCue[],
  maxGap = 0.8,
  minDuration = 0.35,
  simThreshold = 0.68,
): SubtitleCue[] {
  if (!cues || cues.length === 0) return [];

  // Pass 1: Consecutive fuzzy & containment merging
  const merged: SubtitleCue[] = [];
  let curr: SubtitleCue = {
    startTime: cues[0].startTime,
    endTime: cues[0].endTime,
    text: cues[0].text.trim(),
  };

  for (let i = 1; i < cues.length; i++) {
    const nxt = cues[i];
    const nxtText = nxt.text.trim();
    const gap = nxt.startTime - curr.endTime;

    if (gap <= maxGap && areCuesMatching(curr.text, nxtText, simThreshold)) {
      curr.endTime = Math.max(curr.endTime, nxt.endTime);
      if (cleanText(nxtText).length > cleanText(curr.text).length) {
        curr.text = nxtText;
      }
    } else {
      merged.push({ ...curr });
      curr = {
        startTime: nxt.startTime,
        endTime: nxt.endTime,
        text: nxtText,
      };
    }
  }
  if (curr) merged.push(curr);

  // Pass 2: Filter micro-glitches and bridge small dropouts
  const finalCues: SubtitleCue[] = [];
  for (const c of merged) {
    const duration = c.endTime - c.startTime;
    const clean = cleanText(c.text);

    if (duration < minDuration || clean.length < 2) {
      if (
        finalCues.length > 0 &&
        c.startTime - finalCues[finalCues.length - 1].endTime <= 1.0 &&
        areCuesMatching(finalCues[finalCues.length - 1].text, c.text, simThreshold)
      ) {
        finalCues[finalCues.length - 1].endTime = Math.max(
          finalCues[finalCues.length - 1].endTime,
          c.endTime,
        );
      }
      continue;
    }

    if (
      finalCues.length > 0 &&
      c.startTime - finalCues[finalCues.length - 1].endTime <= 0.6 &&
      areCuesMatching(finalCues[finalCues.length - 1].text, c.text, simThreshold)
    ) {
      finalCues[finalCues.length - 1].endTime = Math.max(
        finalCues[finalCues.length - 1].endTime,
        c.endTime,
      );
    } else {
      finalCues.push(c);
    }
  }

  return finalCues;
}

/**
 * Probes video duration, width, and height using bundled ffmpeg.
 */
export function probeVideoInfo(videoPath: string): Promise<{
  duration: number;
  width: number;
  height: number;
  fps: number;
}> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(videoPath)) {
      return reject(new Error(`Video file not found: ${videoPath}`));
    }

    const proc = spawn(ffmpegPath, ['-hide_banner', '-i', videoPath], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', () => {
      const durationMatch = /Duration:\s*(\d{2,}:\d{2}:\d{2}(?:\.\d+)?)/.exec(stderr);
      const videoMatch = /Video:[^\n]*?(\d{2,5})x(\d{2,5})/.exec(stderr);
      const fpsMatch = /(\d+(?:\.\d+)?)\s*fps/.exec(stderr);

      let duration = 0;
      if (durationMatch) {
        const parts = durationMatch[1].split(':');
        duration = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
      }

      const width = videoMatch ? parseInt(videoMatch[1], 10) : 1920;
      const height = videoMatch ? parseInt(videoMatch[2], 10) : 1080;
      const fps = fpsMatch ? parseFloat(fpsMatch[1]) : 25.0;

      resolve({ duration, width, height, fps });
    });

    proc.on('error', (err) => reject(err));
  });
}

/**
 * Extracts a single preview frame with ROI overlay box for interactive UI configuration.
 */
export async function probeVideoOcrPreview(
  videoPath: string,
  timeSec: number = 2.0,
  roi?: VideoOcrRoi,
): Promise<VideoOcrPreviewResult> {
  const ocrExe = getOcrWorkerExe();
  if (!ocrExe || !fs.existsSync(ocrExe)) {
    throw new Error('RapidOCR engine binary not found in extraResources/ocr');
  }

  const { duration, width, height } = await probeVideoInfo(videoPath);
  const targetTime = Math.max(0, Math.min(duration || 1000, timeSec));
  const { ymin, ymax, xmin, xmax } = normalizeRoi(roi);

  const rx = Math.round(width * xmin);
  const ry = Math.round(height * ymin);
  const rw = Math.max(32, Math.round(width * (xmax - xmin)));
  const rh = Math.max(32, Math.round(height * (ymax - ymin)));

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smartsub_prev_'));
  const previewPath = path.join(tempDir, 'preview.jpg');
  const cropPath = path.join(tempDir, 'crop.jpg');

  try {
    // 1. Extract preview frame with drawbox overlay
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        ffmpegPath,
        [
          '-ss',
          String(targetTime),
          '-i',
          videoPath,
          '-vframes',
          '1',
          '-vf',
          `drawbox=x=${rx}:y=${ry}:w=${rw}:h=${rh}:color=yellow@0.25:t=fill,drawbox=x=${rx}:y=${ry}:w=${rw}:h=${rh}:color=yellow:t=2`,
          '-q:v',
          '2',
          previewPath,
          '-y',
        ],
        { windowsHide: true },
      );
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`FFmpeg code ${code}`))));
      proc.on('error', reject);
    });

    // 2. Extract cropped ROI for OCR
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        ffmpegPath,
        [
          '-ss',
          String(targetTime),
          '-i',
          videoPath,
          '-vframes',
          '1',
          '-vf',
          `crop=${rw}:${rh}:${rx}:${ry}`,
          '-q:v',
          '2',
          cropPath,
          '-y',
        ],
        { windowsHide: true },
      );
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`FFmpeg crop code ${code}`))));
      proc.on('error', reject);
    });

    // 3. Run RapidOCR-json on cropped ROI
    const { modelsDir } = getOcrModelPaths();
    const detectedTexts: Array<{ text: string; score: number }> = [];
    const gpuArg = '--GPU=-1';

    await new Promise<void>((resolve) => {
      const proc = spawn(
        ocrExe,
        [
          `--models=${modelsDir}`,
          '--det=det.onnx',
          '--cls=cls.onnx',
          '--rec=rec.onnx',
          '--keys=dict.txt',
          '--doAngle=0',
          '--ensureAscii=0',
          gpuArg,
          `--image_path=${cropPath.replace(/\\/g, '/')}`,
        ],
        { cwd: path.dirname(ocrExe), windowsHide: true },
      );

      let stdout = '';
      proc.stdout?.on('data', (d) => (stdout += d.toString('utf-8')));
      proc.on('close', () => {
        const lines = stdout.split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
          try {
            const res = JSON.parse(line.trim());
            if (res.code === 100 && Array.isArray(res.data)) {
              for (const item of res.data) {
                if (item.text && item.score >= 0.4) {
                  detectedTexts.push({
                    text: item.text.trim(),
                    score: Number(item.score.toFixed(3)),
                  });
                }
              }
            }
          } catch {
            // Ignore non-json
          }
        }
        resolve();
      });
      proc.on('error', () => resolve());
    });

    const previewBuffer = fs.readFileSync(previewPath);
    const dataUri = `data:image/jpeg;base64,${previewBuffer.toString('base64')}`;

    return {
      success: true,
      time: targetTime,
      width,
      height,
      dataUri,
      roiPixels: [ry, ry + rh, rx, rx + rw],
      detectedTexts,
    };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  }
}

/**
 * Extracts hardcoded video subtitles using Native C++ RapidOCR-json & PP-OCRv6.
 */
export async function executeVideoOcrSubtitles(
  config: VideoOcrSubtitlesConfig,
  onProgress?: (progress: VideoOcrSubtitlesProgress) => void,
): Promise<VideoOcrSubtitlesResult> {
  const { videoPath, outputPath, roi, sampleFps = 2.5, minScore = 0.55, simThreshold = 0.68 } = config;

  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file does not exist: ${videoPath}`);
  }

  const ocrExe = getOcrWorkerExe();
  if (!ocrExe || !fs.existsSync(ocrExe)) {
    throw new Error('RapidOCR-json C++ engine binary not found. Please verify extraResources/ocr.');
  }

  const finalOutputPath =
    outputPath ||
    path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}.ocr.srt`,
    );

  const { duration, width, height } = await probeVideoInfo(videoPath);
  const { ymin, ymax, xmin, xmax } = normalizeRoi(roi);

  const rx = Math.round(width * xmin);
  const ry = Math.round(height * ymin);
  const rw = Math.max(32, Math.round(width * (xmax - xmin)));
  const rh = Math.max(32, Math.round(height * (ymax - ymin)));

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smartsub_ocr_'));
  const framesPattern = path.join(tempDir, 'f_%06d.jpg');

  const activeJob: ActiveJob = { videoPath, tempDir, cancelled: false };
  activeOcrJobs.set(videoPath, activeJob);

  logMessage(
    `[VideoOcrSubtitles] Starting Native PP-OCRv6 extraction: ${videoPath} (${duration.toFixed(1)}s, ROI: [${rx}, ${ry}, ${rw}, ${rh}])`,
    'info',
  );

  try {
    // 1. Slices video frames at sampleFps with ROI crop filter using ffmpeg
    onProgress?.({
      percent: 0,
      currentTime: 0,
      duration,
      timemark: '00:00:00,000',
      currentText: 'Trích xuất khung hình video...',
      cuesCount: 0,
    });

    await new Promise<void>((resolve, reject) => {
      const ffProc = spawn(
        ffmpegPath,
        [
          '-i',
          videoPath,
          '-vf',
          `fps=${sampleFps},crop=${rw}:${rh}:${rx}:${ry}`,
          '-q:v',
          '2',
          framesPattern,
          '-y',
        ],
        { windowsHide: true },
      );

      activeJob.ffProc = ffProc;

      ffProc.on('close', (code) => {
        activeJob.ffProc = undefined;
        if (activeJob.cancelled) {
          return reject(new Error('OCR extraction cancelled'));
        }
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg frame extraction failed with exit code ${code}`));
      });

      ffProc.on('error', (err) => {
        activeJob.ffProc = undefined;
        reject(err);
      });
    });

    if (activeJob.cancelled) {
      throw new Error('OCR extraction cancelled');
    }

    const frameFiles = fs
      .readdirSync(tempDir)
      .filter((f) => f.startsWith('f_') && f.endsWith('.jpg'))
      .sort();

    const totalFrames = frameFiles.length;
    if (totalFrames === 0) {
      throw new Error('No video frames could be extracted');
    }

    // 2. Start RapidOCR-json in interactive pipe mode
    const { modelsDir } = getOcrModelPaths();
    const gpuId = config.forceCpu ? -1 : (config.gpuId !== undefined ? config.gpuId : -1);
    const ocrProc = spawn(
      ocrExe,
      [
        `--models=${modelsDir}`,
        '--det=det.onnx',
        '--cls=cls.onnx',
        '--rec=rec.onnx',
        '--keys=dict.txt',
        '--doAngle=0',
        '--ensureAscii=0',
        `--GPU=${gpuId}`,
      ],
      {
        cwd: path.dirname(ocrExe),
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'ignore'],
      },
    );

    activeJob.ocrProc = ocrProc;

    const cues: SubtitleCue[] = [];
    let activeCue: SubtitleCue | null = null;
    const frameStepSec = 1.0 / sampleFps;

    let buffer = '';
    let ocrReady = false;
    let frameIdx = 0;
    let prevFileSize = 0;
    let prevText = '';

    await new Promise<void>((resolve, reject) => {
      ocrProc.stdout?.on('data', (chunk) => {
        buffer += chunk.toString('utf-8');
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (!ocrReady) {
            if (trimmed.includes('OCR init completed')) {
              ocrReady = true;
              feedNext();
            }
            continue;
          }

          if (activeJob.cancelled) {
            return reject(new Error('OCR extraction cancelled'));
          }

          try {
            const res = JSON.parse(trimmed);
            const currentTime = frameIdx * frameStepSec;
            let detectedText = '';

            if (res.code === 100 && Array.isArray(res.data) && res.data.length > 0) {
              const valid = res.data.filter((d: any) => (d.score || 0) >= minScore);
              valid.sort((a: any, b: any) => {
                const ay = a.box[0][1];
                const by = b.box[0][1];
                if (Math.abs(ay - by) > 15) return ay - by;
                return a.box[0][0] - b.box[0][0];
              });
              detectedText = valid
                .map((d: any) => (d.text || '').trim())
                .filter(Boolean)
                .join(' ');
            }

            prevText = detectedText;

            // Temporal clustering
            if (detectedText) {
              if (!activeCue) {
                activeCue = {
                  startTime: currentTime,
                  endTime: currentTime + frameStepSec,
                  text: detectedText,
                };
              } else {
                if (areCuesMatching(activeCue.text, detectedText, simThreshold)) {
                  activeCue.endTime = currentTime + frameStepSec;
                  if (cleanText(detectedText).length > cleanText(activeCue.text).length) {
                    activeCue.text = detectedText;
                  }
                } else {
                  cues.push({ ...activeCue });
                  activeCue = {
                    startTime: currentTime,
                    endTime: currentTime + frameStepSec,
                    text: detectedText,
                  };
                }
              }
            } else {
              if (activeCue) {
                cues.push({ ...activeCue });
                activeCue = null;
              }
            }

            // Report progress every 3 frames or on last frame
            if (frameIdx % 3 === 0 || frameIdx === totalFrames - 1) {
              const percent = Math.min(100, Math.round(((frameIdx + 1) / totalFrames) * 100));
              onProgress?.({
                percent,
                currentTime: Number(currentTime.toFixed(2)),
                duration: Number(duration.toFixed(2)),
                timemark: formatSrtTimestamp(currentTime),
                currentText: detectedText || activeCue?.text || '',
                cuesCount: cues.length + (activeCue ? 1 : 0),
              });
            }
          } catch {
            // Ignore parse errors on raw debug output
          }

          frameIdx++;
          feedNext();
        }
      });

      ocrProc.on('error', (err) => {
        reject(err);
      });

      ocrProc.on('close', (code) => {
        if (!activeJob.cancelled && frameIdx < totalFrames) {
          reject(new Error(`RapidOCR engine process exited unexpectedly with code ${code}`));
        }
      });

      function feedNext() {
        if (activeJob.cancelled) {
          try {
            ocrProc.kill();
          } catch {
            // Ignore
          }
          return reject(new Error('OCR extraction cancelled'));
        }

        if (frameIdx >= totalFrames) {
          if (activeCue) {
            cues.push({ ...activeCue });
            activeCue = null;
          }
          try {
            ocrProc.stdin?.end();
            ocrProc.kill();
          } catch {
            // Ignore
          }
          resolve();
          return;
        }

        const currentFramePath = path.join(tempDir, frameFiles[frameIdx]);
        // Quick identical-frame heuristic: if frame size diff < 1.5%, reuse previous text
        try {
          const stats = fs.statSync(currentFramePath);
          if (prevFileSize > 0 && Math.abs(stats.size - prevFileSize) / prevFileSize < 0.015) {
            // Frame is identical to previous, skip OCR inference
            const currentTime = frameIdx * frameStepSec;
            if (prevText && activeCue) {
              activeCue.endTime = currentTime + frameStepSec;
            }
            frameIdx++;
            setImmediate(feedNext);
            return;
          }
          prevFileSize = stats.size;
        } catch {
          // Fall through to normal OCR
        }

        const normalizedPath = currentFramePath.replace(/\\/g, '/');
        ocrProc.stdin?.write(JSON.stringify({ image_path: normalizedPath }) + '\n');
      }
    });

    // 3. Optimize subtitle cues (gap bridging, noise suppression)
    const finalCues = optimizeSubtitleCues(cues, 0.8, 0.35, simThreshold);

    // 4. Generate standard SRT file
    let srtContent = '';
    finalCues.forEach((cue, idx) => {
      srtContent += `${idx + 1}\n${formatSrtTimestamp(cue.startTime)} --> ${formatSrtTimestamp(cue.endTime)}\n${cue.text}\n\n`;
    });

    fs.mkdirSync(path.dirname(finalOutputPath), { recursive: true });
    fs.writeFileSync(finalOutputPath, srtContent, 'utf-8');

    onProgress?.({
      percent: 100,
      currentTime: Number(duration.toFixed(2)),
      duration: Number(duration.toFixed(2)),
      timemark: formatSrtTimestamp(duration),
      currentText: '',
      cuesCount: finalCues.length,
    });

    logMessage(
      `[VideoOcrSubtitles] Successfully extracted ${finalCues.length} subtitles to ${finalOutputPath}`,
      'info',
    );

    return {
      success: true,
      outputPath: finalOutputPath,
      subtitlesCount: finalCues.length,
      duration,
    };
  } finally {
    activeOcrJobs.delete(videoPath);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  }
}

/**
 * Cancels a running OCR extraction process for the specified video file.
 */
export function cancelVideoOcrSubtitles(videoPath: string): boolean {
  const job = activeOcrJobs.get(videoPath);
  if (job) {
    job.cancelled = true;
    try {
      job.ffProc?.kill();
    } catch {
      // Ignore
    }
    try {
      job.ocrProc?.kill();
    } catch {
      // Ignore
    }
    if (job.tempDir) {
      try {
        fs.rmSync(job.tempDir, { recursive: true, force: true });
      } catch {
        // Ignore
      }
    }
    activeOcrJobs.delete(videoPath);
    logMessage(`[VideoOcrSubtitles] Cancelled OCR extraction for ${videoPath}`, 'info');
    return true;
  }
  return false;
}

/**
 * Cancels all active OCR processes (e.g. on window close or tab switch).
 */
export function cancelAllOcrProcesses(): void {
  for (const [videoPath, job] of activeOcrJobs.entries()) {
    job.cancelled = true;
    try {
      job.ffProc?.kill();
    } catch {
      // Ignore
    }
    try {
      job.ocrProc?.kill();
    } catch {
      // Ignore
    }
    if (job.tempDir) {
      try {
        fs.rmSync(job.tempDir, { recursive: true, force: true });
      } catch {
        // Ignore
      }
    }
    logMessage(`[VideoOcrSubtitles] Terminated OCR process for ${videoPath}`, 'info');
  }
  activeOcrJobs.clear();
}
