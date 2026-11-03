/**
 * 音视频与字幕周边工具箱（Toolbox）核心类型定义
 */

export type ToolCategory = 'all' | 'subtitles' | 'video' | 'audio';

export type ToolboxToolId =
  | 'subtitle-converter'
  | 'video-trimmer'
  | 'audio-extractor'
  | 'embedded-subtitles'
  | 'subtitle-sync'
  | 'bilingual-subtitles'
  | 'video-compressor'
  | 'video-to-gif'
  | 'video-ocr-subtitles'
  | 'video-remaker'
  | 'video-downloader';

export interface ToolboxToolManifest {
  id: ToolboxToolId;
  nameKey: string;
  descKey: string;
  category: ToolCategory;
  icon: string;
  badgeKey?: string;
  phase: 1 | 2 | 3;
}

// ----------------- 字符编码与字幕转换 -----------------

export interface EncodingDetectResult {
  encoding: string;
  hasBom: boolean;
  confidence: number;
  sampleText: string;
}

export type ChineseConvertMode =
  | 'none'
  | 's2t'
  | 't2s'
  | 's2tw'
  | 'tw2s'
  | 's2hk'
  | 'hk2s';

export interface SubtitleConvertItemConfig {
  filePath: string;
  targetFormat: 'srt' | 'vtt' | 'ass' | 'lrc' | 'txt';
  sourceEncoding?: string; // 'auto' or 'utf-8', 'gb18030', etc.
  targetEncoding?: 'utf-8' | 'utf-8-bom' | 'gb18030';
  chineseConversion?: ChineseConvertMode;
  cleanFormatting?: boolean;
  includeTimestampsInTxt?: boolean;
  outputDir?: string;
}

export interface SubtitleConvertItemResult {
  success: boolean;
  sourcePath: string;
  outputPath?: string;
  format?: string;
  count?: number;
  detectedEncoding?: string;
  error?: string;
}

// ----------------- 视频裁剪 -----------------

export interface VideoTrimConfig {
  videoPath: string;
  startSec: number;
  endSec: number;
  mode: 'lossless' | 'accurate';
  outputPath?: string;
  outputDir?: string;
}

export interface VideoTrimProgress {
  percent: number;
  currentTime?: number;
  timemark?: string;
}

export interface VideoTrimResult {
  success: boolean;
  outputPath: string;
  duration: number;
  size: number;
  error?: string;
}

// ----------------- 音频提取 -----------------

export type AudioExtractFormat = 'mp3' | 'wav' | 'aac' | 'm4a' | 'flac';

export interface AudioExtractConfig {
  videoPath: string;
  format: AudioExtractFormat;
  bitrate?: '128k' | '192k' | '256k' | '320k';
  wavPreset?: 'standard' | 'asr_16k_mono';
  outputPath?: string;
}

export interface AudioExtractResult {
  success: boolean;
  outputPath: string;
  format: string;
  size: number;
  error?: string;
}

// ----------------- 内封软字幕提取 -----------------

export interface EmbeddedSubtitleStreamInfo {
  subIndex: number;
  codec: string;
  language?: string;
  title?: string;
  isDefault: boolean;
  isForced: boolean;
  isText: boolean;
}

export interface ExtractEmbeddedSubtitleConfig {
  videoPath: string;
  streamIndices: number[]; // subIndex array
  targetFormat: 'srt' | 'ass' | 'vtt';
  outputDir?: string;
}

export interface ExtractEmbeddedSubtitleResult {
  success: boolean;
  extractedFiles: Array<{
    subIndex: number;
    outputPath: string;
    language?: string;
  }>;
  error?: string;
}

// ----------------- 字幕时间轴校准 -----------------

export type SubtitleSyncMode = 'offset' | 'scale' | 'two-point';

export interface SubtitleSyncConfig {
  filePath: string;
  mode: SubtitleSyncMode;
  offsetMs?: number;
  scaleRatio?: number;
  scaleFraction?: { numerator: number; denominator: number };
  p1SourceMs?: number;
  p1TargetMs?: number;
  p2SourceMs?: number;
  p2TargetMs?: number;
  outputPath?: string;
}

export interface SubtitleSyncResult {
  success: boolean;
  outputPath: string;
  cuesCount: number;
  error?: string;
}

// ----------------- 双语字幕合并与拆分 -----------------

export interface BilingualSubtitleMergeConfig {
  primaryPath: string;
  secondaryPath: string;
  primaryPosition: 'top' | 'bottom';
  separator?: string;
  outputPath?: string;
}

export interface BilingualSubtitleSplitConfig {
  filePath: string;
  outputDir?: string;
}

export interface BilingualSubtitleResult {
  success: boolean;
  outputPaths: string[];
  cuesCount: number;
  error?: string;
}

// ----------------- 视频压缩 -----------------

export type VideoCompressPreset =
  | 'wechat_25mb'
  | 'balanced_1080p'
  | 'fast_720p'
  | 'target_size';

export interface VideoCompressConfig {
  videoPath: string;
  preset: VideoCompressPreset;
  targetSizeMb?: number;
  outputPath?: string;
}

export interface VideoCompressResult {
  success: boolean;
  outputPath: string;
  originalSize: number;
  compressedSize: number;
  skipped?: boolean;
  error?: string;
}

// ----------------- 视频转 GIF -----------------

export interface VideoToGifConfig {
  videoPath: string;
  startSec: number;
  endSec: number;
  fps?: number; // 10, 12, 15
  width?: number; // 360, 480, 640
  outputPath?: string;
}

export interface VideoToGifResult {
  success: boolean;
  outputPath: string;
  size: number;
  error?: string;
}

// ----------------- 视频硬字幕 OCR 提取 (PP-OCRv6) -----------------

export interface VideoOcrRoi {
  ymin: number; // 0.0 - 1.0 (e.g. 0.78)
  ymax: number; // 0.0 - 1.0 (e.g. 0.98)
  xmin: number; // 0.0 - 1.0 (e.g. 0.05)
  xmax: number; // 0.0 - 1.0 (e.g. 0.95)
}

export interface VideoOcrSubtitlesConfig {
  videoPath: string;
  outputPath?: string;
  roi?: VideoOcrRoi;
  sampleFps?: number; // 1.0 - 5.0, default 2.5
  minScore?: number; // 0.3 - 0.9, default 0.60
  simThreshold?: number; // 0.6 - 0.95, default 0.85
  forceCpu?: boolean;
  gpuId?: number; // -1 = CPU, 0 = GPU 0, 1 = GPU 1 (Vulkan acceleration)
}

export interface VideoOcrSubtitlesProgress {
  percent: number;
  currentTime?: number;
  duration?: number;
  timemark?: string;
  currentText?: string;
  cuesCount?: number;
}

export interface VideoOcrSubtitlesResult {
  success: boolean;
  outputPath: string;
  subtitlesCount: number;
  duration: number;
  error?: string;
}

export interface VideoOcrPreviewResult {
  success: boolean;
  time: number;
  width: number;
  height: number;
  dataUri: string;
  roiPixels: [number, number, number, number];
  detectedTexts?: Array<{ text: string; score: number }>;
  error?: string;
}

// ----------------- 视频重制 / 去重防查重 (Video Remaker) -----------------

export type VideoRemakePreset = 'safe' | 'balanced' | 'aggressive' | 'custom';

export interface VideoRemakeConfig {
  videoPath: string;
  preset?: VideoRemakePreset;
  /** 微裁剪与缩放比例 (0 - 8%, 默认 2) */
  microZoomPercent?: number;
  /** 水平镜像翻转 (默认 false) */
  mirrorFlip?: boolean;
  /** 动态微噪点 (随机微噪, 默认 true) */
  microNoise?: boolean;
  /** 噪点强度 (1 - 5, 默认 2) */
  microNoiseStrength?: number;
  /** 微调色彩/对比度/伽马 (默认 true) */
  colorShift?: boolean;
  /** 暗角微晕影 (默认 false) */
  vignette?: boolean;
  /** 播放微变速倍率 (0.95 - 1.05, 默认 1.02) */
  speedMultiplier?: number;
  /** 音频微调音高 (默认 true) */
  pitchShift?: boolean;
  /** 音高半音偏移 (-1 到 +1, 默认 0.3) */
  pitchSemitones?: number;
  /** 随机打乱 GOP / Keyframe 间距 (默认 true) */
  randomGop?: boolean;
  /** 清除所有 Exif / Metadata 元数据 (默认 true) */
  clearMetadata?: boolean;
  outputPath?: string;
  outputDir?: string;
}

export interface VideoRemakeResult {
  success: boolean;
  outputPath: string;
  originalSize: number;
  newSize: number;
  error?: string;
}

