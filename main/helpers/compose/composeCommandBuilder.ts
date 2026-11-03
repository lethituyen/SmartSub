/**
 * 统一合成引擎 · 纯函数命令构建器。
 *
 * 把「字幕（none/soft/hard）× 音轨（keep/replace/mix/addTrack）」矩阵组装为
 * 单次 ffmpeg 执行的结构化计划（ComposePlan）。本模块零 I/O、零 electron 依赖，
 * 可在纯 node 下单测（args 断言，无需真实执行 ffmpeg）。
 *
 * 字幕封装显式映射视频、音频和字幕，避免复制不兼容数据流；audio 三形态在 subtitle=none 下沿用
 * dubbing/audioPipeline 的 replaceAudioTrack / duckMixIntoVideo / addAudioTrack
 * 一致（addTrack 保持「先预编 aac 再全流拷贝混流」两步形制，避免 -c:a:N
 * 输出序号在原视频多音轨时错位）。
 */

import * as path from 'path';
import {
  assertComposeOutputWritable,
  sourceAudioNeedsAac,
} from '../../../types/composeContainer';
import type {
  BlurSubtitleConfig,
  WatermarkConfig,
  AntiDuplicateConfig,
} from '../../../types/subtitleMerge';
import {
  resolveAntiDuplicateSettings,
  type ResolvedRemakeSettings,
} from '../toolbox/videoRemaker';
import type { EmbeddedSubtitleStream } from '../embeddedSubtitleParser';

/** 硬烧字幕的解析后输入：滤镜与编码参数由调用方（runner）解析完成后传入。 */
export interface ComposeHardSubtitle {
  mode: 'hard';
  /**
   * 完整字幕滤镜（`ass='…'` 或 `subtitles='…':force_style='…'`），
   * 不含偶数宽高裁剪与 format=nv12（由 buildComposePlan 依次追加）
   */
  filter: string;
  /** 从 -c:v 起的完整视频编码参数（libx264 或硬件编码器 + 画质参数） */
  encoderArgs: string[];
  /** 硬件编码器仅接受 8-bit 4:2:0：滤镜链末尾追加 format=nv12 */
  needsNv12: boolean;
  /** 抹除/模糊原视频硬字幕配置 */
  blurOldSubtitles?: BlurSubtitleConfig;
  /** 视频水印/Logo 配置 */
  watermark?: WatermarkConfig;
  /** 视频去重 / 防查重深度重塑配置 */
  antiDuplicate?: AntiDuplicateConfig;
  /** 视频原始宽度（用于自适应模糊区域与水印尺寸） */
  videoWidth?: number;
  /** 视频原始高度（用于自适应模糊区域） */
  videoHeight?: number;
}

export type ComposePlanSubtitle =
  | { mode: 'none' }
  | { mode: 'soft'; subtitlePath: string }
  | ComposeHardSubtitle;

export type ComposePlanAudio =
  | { mode: 'keep' }
  | {
      mode: 'replace' | 'mix' | 'addTrack';
      trackPath: string;
      /** mix 模式原声压低强度（sidechaincompress ratio），缺省 8 */
      duckRatio?: number;
    };

export interface ComposePlanInput {
  videoPath: string;
  outputPath: string;
  subtitle: ComposePlanSubtitle;
  audio: ComposePlanAudio;
  watermark?: WatermarkConfig;
  embeddedSubtitles?: EmbeddedSubtitleStream[];
  hasOriginalAudio?: boolean;
}

/** addTrack 模式的前置步骤：配音轨预编码为 aac 临时文件（主命令全流 -c copy） */
export interface ComposePrepStep {
  kind: 'encodeAac';
  src: string;
  dst: string;
}

/** 结构化执行计划：runner 按此组装 fluent-ffmpeg 命令 */
export interface ComposePlan {
  /** 按序 -i 输入（input 0 恒为视频） */
  inputs: string[];
  /** 简单视频滤镜（-vf；与 complexFilter 互斥） */
  videoFilter?: string;
  /** -filter_complex 行（音频混流/硬烧+混音的视频标签路径） */
  complexFilter?: string[];
  /** 全部输出选项（-map/-c/…，含结尾 -y） */
  outputOptions: string[];
  /** 主命令前的准备步骤（当前仅 addTrack 的 aac 预编码） */
  prep?: ComposePrepStep;
}

/** MP4 系容器（支持 -movflags +faststart） */
const FASTSTART_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v']);

/** 配音轨统一编码参数（与既有配音导出一致） */
const AAC_ARGS = ['-c:a', 'aac', '-b:a', '192k'];

/**
 * 硬烧重编码时映射的视频流。`V`（大写）只匹配真正的视频流，排除封面图（attached pic）；
 * 小写 `v` 会把封面一起映射，封面也被送进字幕滤镜和 libx264，写 MP4 头时失败
 * （`Could not find tag for codec h264 in stream #1`，旧版界面只剩 "Conversion failed!"）。
 * yt-dlp --embed-thumbnail、YoutubeDownloader 等下载的 MP4 常带封面。
 *
 * 仅用于重编码分支：软封装/无字幕是 -c copy，封面原样保留，仍用 0:v；
 * hard+mix 走 filter_complex 的 `[0:v]` 标签，只取第一路视频流，不会带上其后的封面。
 */
const REENCODED_VIDEO_MAP = '0:V';

/**
 * 硬烧重编码前把宽高向下取偶。libx264（yuv420p）拒绝奇数宽/高：
 * `[libx264] width not divisible by 2 (853x480)`，旧版界面只剩 "Conversion failed!"；
 * VP9/AV1/MPEG-4 等源可以是奇数分辨率。`crop` 丢掉右/下多出的 1 像素，不缩放、不加黑边，
 * 宽高本来就是偶数时是空操作（x/y 显式写 0，不依赖默认的居中取整）。
 *
 * 放在字幕滤镜之后：字幕仍按原始画面渲染，位置不变；放在 `format=nv12` 之前：
 * 硬件编码器同样拿到偶数宽高。软封装/无字幕是 -c copy，没有滤镜链，不受影响。
 */
const EVEN_DIMENSIONS_FILTER = 'crop=trunc(iw/2)*2:trunc(ih/2)*2:0:0';

const DEFAULT_DUCK_RATIO = 8;

/** The dual-audio workflow retains its MKV container contract. */
export function composePlanRequiresMkv(input: {
  subtitle: { mode: ComposePlanSubtitle['mode'] };
  audio: { mode: ComposePlanAudio['mode'] };
}): boolean {
  return input.audio.mode === 'addTrack';
}

/**
 * 构建硬字幕视频滤镜链（含原字幕区域模糊、水印/Logo 叠层，以及最顶层字幕渲染）。
 * 动态自适应视频分辨率（使用 ffmpeg 表达式 iw/ih），
 * 确保图层关系严格为：原视频 -> 模糊遮罩 -> 水印/Logo -> 翻译字幕。
 */
function buildHardVideoFilters(params: {
  blurConfig?: BlurSubtitleConfig;
  watermarkConfig?: WatermarkConfig;
  watermarkInputIdx?: number;
  antiDuplicateConfig?: AntiDuplicateConfig;
  isVertical: boolean;
  videoWidth?: number;
  videoHeight?: number;
  subtitleFilter: string;
  needsNv12: boolean;
}): { complexVideoFilter: string; finalVideoTag: string } {
  const {
    blurConfig,
    watermarkConfig,
    watermarkInputIdx,
    antiDuplicateConfig,
    isVertical,
    videoWidth,
    videoHeight,
    subtitleFilter,
    needsNv12,
  } = params;

  const parts: string[] = [];
  let currentVideoTag = '[0:v]';

  // 0. 视频去重 / 防查重 (Anti-Duplicate / Remaker) 前置基础形变、动态噪点与滤镜
  if (antiDuplicateConfig?.enabled) {
    const s = resolveAntiDuplicateSettings(antiDuplicateConfig);
    const vW = videoWidth || 1920;
    const vH = videoHeight || 1080;
    const preFilters: string[] = [];

    // 0.1 微缩放与裁剪 (Micro-Zoom)
    if (s.zoomPercent > 0) {
      const factor = Math.max(0.9, Math.min(1.0, (100 - s.zoomPercent) / 100));
      const cropW = Math.floor((vW * factor) / 2) * 2;
      const cropH = Math.floor((vH * factor) / 2) * 2;
      preFilters.push(
        `crop=${cropW}:${cropH}:(in_w-${cropW})/2:(in_h-${cropH})/2,scale=${vW}:${vH}`,
      );
    }

    // 0.2 水平镜像翻转
    if (s.mirrorFlip) {
      preFilters.push('hflip');
    }

    // 0.3 动态时域微噪点 (破坏 pHash 指纹)
    if (s.microNoise) {
      const strength = Math.max(1, Math.min(5, s.noiseStrength));
      preFilters.push(`noise=alls=${strength}:allf=t`);
    }

    // 0.4 色彩/对比度/直方图微调
    if (s.colorShift) {
      preFilters.push('eq=contrast=1.02:brightness=0.01:saturation=1.02:gamma=1.01');
    }

    // 0.5 柔和电影暗角
    if (s.vignette) {
      preFilters.push('vignette=PI/5');
    }

    // 0.6 画面微变速
    if (s.speed > 0 && Math.abs(s.speed - 1) > 0.005) {
      preFilters.push(`setpts=PTS/${s.speed}`);
    }

    if (preFilters.length > 0) {
      parts.push(`${currentVideoTag}${preFilters.join(',')}[v_remade]`);
      currentVideoTag = '[v_remade]';
    }
  }

  // 1. 原字幕区域模糊/遮罩
  if (blurConfig?.enabled) {
    const yRatio =
      blurConfig.yPercent !== undefined
        ? blurConfig.yPercent / 100
        : isVertical
          ? 0.685
          : 0.84;
    const hRatio =
      blurConfig.heightPercent !== undefined
        ? blurConfig.heightPercent / 100
        : isVertical
          ? 0.125
          : 0.11;
    const wRatio =
      blurConfig.widthPercent !== undefined
        ? blurConfig.widthPercent / 100
        : isVertical
          ? 0.86
          : 0.8;
    const strength = blurConfig.blurStrength ?? 22;

    const crop = `crop=w=trunc(iw*${wRatio.toFixed(3)}/2)*2:h=trunc(ih*${hRatio.toFixed(3)}/2)*2:x=trunc((iw-ow)/2):y=trunc(ih*${yRatio.toFixed(3)}/2)*2`;
    const blur = `boxblur=${strength}:5`;
    const overlay = `overlay=x=trunc((W-w)/2):y=trunc(H*${yRatio.toFixed(3)}/2)*2`;

    parts.push(
      `[0:v]split[base][crop_in]`,
      `[crop_in]${crop},${blur}[blurred]`,
      `[base][blurred]${overlay}[cleared]`,
    );
    currentVideoTag = '[cleared]';
  }

  // 2. 视频水印/Logo 叠层（支持附带模糊背景以遮盖原视频 logo）
  if (
    watermarkConfig?.enabled &&
    watermarkInputIdx !== undefined &&
    watermarkConfig.imagePath
  ) {
    const vW = videoWidth || 1920;
    const vH = videoHeight || 1080;
    const scaleP = watermarkConfig.scalePercent ?? 15;
    const targetW = Math.max(
      32,
      Math.round((vW * scaleP) / 100 / 2) * 2,
    );
    const opacityVal = Math.min(
      1,
      Math.max(0.1, (watermarkConfig.opacity ?? 90) / 100),
    );

    const aspectRatio = watermarkConfig.aspectRatio || 2.5;
    const targetH = Math.max(
      16,
      Math.round((targetW / aspectRatio) / 2) * 2,
    );

    let overlayPos = 'x=W-w-24:y=24'; // 默认右上角
    let posX = vW - targetW - 24;
    let posY = 24;

    if (watermarkConfig.positionPreset === 'top-left') {
      overlayPos = 'x=24:y=24';
      posX = 24;
      posY = 24;
    } else if (watermarkConfig.positionPreset === 'bottom-left') {
      overlayPos = 'x=24:y=H-h-24';
      posX = 24;
      posY = Math.max(0, vH - targetH - 24);
    } else if (watermarkConfig.positionPreset === 'bottom-right') {
      overlayPos = 'x=W-w-24:y=H-h-24';
      posX = Math.max(0, vW - targetW - 24);
      posY = Math.max(0, vH - targetH - 24);
    } else if (watermarkConfig.positionPreset === 'custom') {
      const xP = (watermarkConfig.xPercent ?? 85) / 100;
      const yP = (watermarkConfig.yPercent ?? 5) / 100;
      posX = Math.max(0, Math.min(vW - targetW, Math.round((vW - targetW) * xP)));
      posY = Math.max(0, Math.min(vH - targetH, Math.round((vH - targetH) * yP)));
      overlayPos = `x=trunc((W-w)*${xP.toFixed(3)}):y=trunc((H-h)*${yP.toFixed(3)})`;
    }

    // 若开启附带模糊背景：在水印位置下方先做 crop + boxblur + 磨砂暗色框
    if (watermarkConfig.blurBackground) {
      const pad = 8;
      const blurX = Math.max(0, Math.floor((posX - pad) / 2) * 2);
      const blurY = Math.max(0, Math.floor((posY - pad) / 2) * 2);
      const blurW = Math.min(vW - blurX, Math.floor((targetW + pad * 2) / 2) * 2);
      const blurH = Math.min(vH - blurY, Math.floor((targetH + pad * 2) / 2) * 2);

      parts.push(
        `${currentVideoTag}split[v_base][v_crop]`,
        `[v_crop]crop=w=${blurW}:h=${blurH}:x=${blurX}:y=${blurY},boxblur=20:5,drawbox=x=0:y=0:w=iw:h=ih:color=black@0.35:t=fill[wm_blur_patch]`,
        `[v_base][wm_blur_patch]overlay=x=${blurX}:y=${blurY}[v_patched]`,
      );
      currentVideoTag = '[v_patched]';
    }

    parts.push(
      `[${watermarkInputIdx}:v]scale=${targetW}:-2,format=rgba,colorchannelmixer=aa=${opacityVal.toFixed(2)}[wm]`,
      `${currentVideoTag}[wm]overlay=${overlayPos}:repeatlast=1[with_wm]`,
    );
    currentVideoTag = '[with_wm]';
  }

  // 3. 字幕滤镜（始终在最上层，避免被模糊或水印遮挡）
  const chain = [
    subtitleFilter,
    EVEN_DIMENSIONS_FILTER,
    ...(needsNv12 ? ['format=nv12'] : []),
  ].join(',');

  parts.push(`${currentVideoTag}${chain}[vout]`);

  return { complexVideoFilter: parts.join(';'), finalVideoTag: '[vout]' };
}

/**
 * ducking 混音滤镜（与既有 duckMixIntoVideo 相同语义）：
 * 配音一分为二（sidechain 触发源 + 混音源），原声被压低后与配音叠加。
 */
function buildDuckMixFilters(duckRatio: number): string[] {
  return [
    '[1:a]asplit=2[sc][dub]',
    `[0:a][sc]sidechaincompress=threshold=0.03:ratio=${duckRatio}:attack=20:release=300[bg]`,
    '[bg][dub]amix=inputs=2:duration=first:normalize=0[mix]',
  ];
}

/**
 * 组装合成计划。纯函数：不触盘、不探测；硬烧滤镜与编码参数须由调用方先解析。
 *
 * @param tempTag addTrack 预编码临时文件名标记（缺省时间戳；测试注入固定值）
 */
export function buildComposePlan(
  input: ComposePlanInput,
  opts?: { tempTag?: string },
): ComposePlan {
  const { videoPath, outputPath, subtitle } = input;
  const audio: ComposePlanAudio =
    input.audio.mode === 'mix' && input.hasOriginalAudio === false
      ? { ...input.audio, mode: 'replace' }
      : input.audio;
  const extension = path.extname(outputPath).toLowerCase();
  if (subtitle.mode === 'soft' && !['.mkv', '.mp4'].includes(extension)) {
    throw new Error('Soft subtitles require an MKV or MP4 output container');
  }
  // 纵深防御：WebM/Ogg 写不下这里产出的 H.264/AAC，构建期拒绝而不是等 ffmpeg 写头失败（#521）
  assertComposeOutputWritable(outputPath);
  const softSubtitleTail = [
    extension === '.mp4' ? '-c:s' : '-c:s:0',
    extension === '.mp4' ? 'mov_text' : 'srt',
    '-disposition:s:0',
    'default',
  ];
  if (
    subtitle.mode === 'soft' &&
    extension === '.mp4' &&
    input.embeddedSubtitles?.some((stream) => !stream.isText)
  ) {
    throw new Error('MP4 cannot retain bitmap subtitle tracks; choose MKV');
  }
  for (const stream of input.embeddedSubtitles || []) {
    if (stream.isDefault)
      softSubtitleTail.push(
        `-disposition:s:${stream.subIndex + 1}`,
        '-default',
      );
  }

  if (subtitle.mode === 'none' && audio.mode === 'keep') {
    throw new Error('compose: nothing to do (subtitle=none, audio=keep)');
  }

  const hasTrack = audio.mode !== 'keep';
  const faststart =
    subtitle.mode === 'hard' &&
    FASTSTART_EXTENSIONS.has(path.extname(outputPath).toLowerCase());

  // addTrack：预编 aac 临时文件，主命令用它替代原始配音轨输入
  let prep: ComposePrepStep | undefined;
  let trackInput = hasTrack ? audio.trackPath : null;
  if (audio.mode === 'addTrack') {
    const dst = path.join(
      path.dirname(outputPath),
      `.dub-track-${opts?.tempTag ?? Date.now()}.m4a`,
    );
    prep = { kind: 'encodeAac', src: audio.trackPath, dst };
    trackInput = dst;
  }

  // 输入顺序：视频 0 → 配音轨 1（若有）→ 水印图片（若有）→ 软封字幕文件（若有）
  const inputs = [videoPath];
  if (trackInput) inputs.push(trackInput);

  let watermarkInputIdx: number | undefined;
  const effectiveWatermark =
    subtitle.mode === 'hard' ? (subtitle.watermark ?? input.watermark) : input.watermark;
  if (
    subtitle.mode === 'hard' &&
    effectiveWatermark?.enabled &&
    effectiveWatermark.imagePath
  ) {
    inputs.push(effectiveWatermark.imagePath);
    watermarkInputIdx = inputs.length - 1;
  }

  if (subtitle.mode === 'soft') inputs.push(subtitle.subtitlePath);
  const softSubIndex = inputs.length - 1;

  const duckRatio =
    audio.mode === 'mix' ? (audio.duckRatio ?? DEFAULT_DUCK_RATIO) : 0;

  let videoFilter: string | undefined;
  let complexFilter: string[] | undefined;
  const opt: string[] = [];

  if (subtitle.mode === 'hard') {
    const isBlur = subtitle.blurOldSubtitles?.enabled === true;
    const isWatermark =
      effectiveWatermark?.enabled === true &&
      Boolean(effectiveWatermark.imagePath);
    const isAntiDuplicate = subtitle.antiDuplicate?.enabled === true;
    const hasComplexVideo = isBlur || isWatermark || isAntiDuplicate;
    const isVertical =
      subtitle.videoHeight && subtitle.videoWidth
        ? subtitle.videoHeight > subtitle.videoWidth
        : false;

    if (hasComplexVideo) {
      const { complexVideoFilter, finalVideoTag } = buildHardVideoFilters({
        blurConfig: subtitle.blurOldSubtitles,
        watermarkConfig: effectiveWatermark,
        watermarkInputIdx,
        antiDuplicateConfig: subtitle.antiDuplicate,
        isVertical,
        videoWidth: subtitle.videoWidth,
        videoHeight: subtitle.videoHeight,
        subtitleFilter: subtitle.filter,
        needsNv12: subtitle.needsNv12,
      });

      // 解析防查重音频滤镜（若启用 Pitch Shift 或微变速）
      let audioAf: string | null = null;
      if (isAntiDuplicate) {
        const s = resolveAntiDuplicateSettings(subtitle.antiDuplicate!);
        const af: string[] = [];
        if (s.pitchShift && Math.abs(s.pitchSemitones) > 0.05) {
          const pitchRatio = Math.pow(2, s.pitchSemitones / 12);
          const sampleRate = 44100;
          const targetRate = Math.round(sampleRate * pitchRatio);
          const tempoCompensation = 1 / pitchRatio;
          af.push(`asetrate=${targetRate},aresample=${sampleRate}`);
          const totalTempo = tempoCompensation * s.speed;
          if (Math.abs(totalTempo - 1) > 0.005) {
            af.push(`atempo=${totalTempo.toFixed(5)}`);
          }
        } else if (s.speed > 0 && Math.abs(s.speed - 1) > 0.005) {
          af.push(`atempo=${s.speed}`);
        }
        if (af.length > 0) audioAf = af.join(',');
      }

      if (audio.mode === 'mix') {
        if (audioAf) {
          complexFilter = [
            complexVideoFilter,
            ...buildDuckMixFilters(duckRatio),
            `[mix]${audioAf}[a_final]`,
          ];
          opt.push('-map', finalVideoTag, '-map', '[a_final]');
        } else {
          complexFilter = [
            complexVideoFilter,
            ...buildDuckMixFilters(duckRatio),
          ];
          opt.push('-map', finalVideoTag, '-map', '[mix]');
        }
        opt.push(...subtitle.encoderArgs, ...AAC_ARGS);
      } else if (audio.mode === 'replace') {
        if (audioAf) {
          complexFilter = [
            complexVideoFilter,
            `[1:a]${audioAf}[a_final]`,
          ];
          opt.push('-map', finalVideoTag, '-map', '[a_final]');
        } else {
          complexFilter = [complexVideoFilter];
          opt.push('-map', finalVideoTag, '-map', '1:a');
        }
        opt.push(...subtitle.encoderArgs, ...AAC_ARGS);
      } else if (audio.mode === 'addTrack') {
        if (audioAf) {
          complexFilter = [
            complexVideoFilter,
            `[1:a]${audioAf}[a_final]`,
          ];
          opt.push('-map', finalVideoTag, '-map', '0:a?', '-map', '[a_final]');
          opt.push(...subtitle.encoderArgs, ...AAC_ARGS);
        } else {
          complexFilter = [complexVideoFilter];
          opt.push('-map', finalVideoTag, '-map', '0:a?', '-map', '1:a');
          opt.push(...subtitle.encoderArgs, '-c:a', 'copy');
        }
      } else {
        if (audioAf) {
          complexFilter = [
            complexVideoFilter,
            `[0:a]${audioAf}[a_final]`,
          ];
          opt.push('-map', finalVideoTag, '-map', '[a_final]');
          opt.push(...subtitle.encoderArgs, ...AAC_ARGS);
        } else {
          complexFilter = [complexVideoFilter];
          opt.push('-map', finalVideoTag, '-map', '0:a?');
          opt.push(
            ...subtitle.encoderArgs,
            ...(sourceAudioNeedsAac(path.extname(videoPath), extension)
              ? AAC_ARGS
              : ['-c:a', 'copy']),
          );
        }
      }

      if (isAntiDuplicate) {
        const s = resolveAntiDuplicateSettings(subtitle.antiDuplicate!);
        if (s.randomGop) {
          opt.push('-g', '37', '-keyint_min', '15', '-sc_threshold', '40');
        }
        if (s.clearMetadata) {
          opt.push('-map_metadata', '-1');
        }
      }
    } else {
      const chain = [
        subtitle.filter,
        EVEN_DIMENSIONS_FILTER,
        ...(subtitle.needsNv12 ? ['format=nv12'] : []),
      ].join(',');
      if (audio.mode === 'mix') {
        // -vf 与 -filter_complex 不能并用：视频滤镜并入 complex 图
        complexFilter = [
          `[0:v]${chain}[vout]`,
          ...buildDuckMixFilters(duckRatio),
        ];
        opt.push('-map', '[vout]', '-map', '[mix]');
        opt.push(...subtitle.encoderArgs, ...AAC_ARGS);
      } else if (audio.mode === 'replace') {
        videoFilter = chain;
        opt.push('-map', REENCODED_VIDEO_MAP, '-map', '1:a');
        opt.push(...subtitle.encoderArgs, ...AAC_ARGS);
      } else if (audio.mode === 'addTrack') {
        videoFilter = chain;
        // 原音轨全部保留 + 预编 aac 配音轨；音频统一流拷贝（无 -c:a:N 序号错位）
        opt.push('-map', REENCODED_VIDEO_MAP, '-map', '0:a?', '-map', '1:a');
        opt.push(...subtitle.encoderArgs, '-c:a', 'copy');
      } else {
        // Explicit maps retain every original audio track without also auto-selecting
        // an embedded subtitle that a player could render over the burned text.
        videoFilter = chain;
        opt.push('-map', REENCODED_VIDEO_MAP, '-map', '0:a?');
        // WebM/Ogg 源的 Opus/Vorbis 写进 MP4 系容器时转 AAC（兼容性/部分容器无法直拷）；
        // 其余组合保持直拷，用户手动选的 .mkv 也一样（#521）。
        opt.push(
          ...subtitle.encoderArgs,
          ...(sourceAudioNeedsAac(path.extname(videoPath), extension)
            ? AAC_ARGS
            : ['-c:a', 'copy']),
        );
      }
    }
    if (faststart) opt.push('-movflags', '+faststart');
  } else if (subtitle.mode === 'soft') {
    // The new subtitle is s:0; original subtitles follow it, unchanged in MKV.
    // MP4 text tracks use mov_text. Data and attachments are not MP4 media tracks.
    if (audio.mode === 'keep') {
      opt.push('-map', '0:v', '-map', '0:a?');
    } else if (audio.mode === 'replace') {
      opt.push('-map', '0:v', '-map', '1:a');
    } else if (audio.mode === 'mix') {
      complexFilter = buildDuckMixFilters(duckRatio);
      opt.push('-map', '0:v', '-map', '[mix]');
    } else {
      opt.push('-map', '0:v', '-map', '0:a?', '-map', '1:a');
    }
    opt.push('-map', `${softSubIndex}:s:0`, '-map', '0:s?');
    if (extension === '.mkv') opt.push('-map', '0:t?');
    opt.push('-c', 'copy');
    if (audio.mode === 'replace' || audio.mode === 'mix') opt.push(...AAC_ARGS);
    opt.push(...softSubtitleTail);
    if (extension === '.mp4') opt.push('-movflags', '+faststart');
  } else {
    // subtitle=none：与收敛前 audioPipeline 三形态逐参数一致
    if (audio.mode === 'replace') {
      opt.push('-map', '0:v', '-map', '1:a', '-map', '0:s?');
      opt.push('-c:v', 'copy', '-c:s', 'copy', ...AAC_ARGS);
    } else if (audio.mode === 'mix') {
      complexFilter = buildDuckMixFilters(duckRatio);
      opt.push('-map', '0:v', '-map', '[mix]', '-map', '0:s?');
      opt.push('-c:v', 'copy', '-c:s', 'copy', ...AAC_ARGS);
    } else if (audio.mode === 'addTrack') {
      opt.push('-map', '0', '-map', '1:a', '-c', 'copy');
    }
  }

  opt.push('-y');

  return {
    inputs,
    videoFilter,
    complexFilter,
    outputOptions: opt,
    prep,
  };
}

/** 计划的可读摘要（日志用）：输入清单 + 滤镜 + 输出选项 */
export function composePlanSummary(plan: ComposePlan): string {
  const parts = [
    `inputs=[${plan.inputs.join(' | ')}]`,
    plan.videoFilter ? `vf=${plan.videoFilter}` : null,
    plan.complexFilter
      ? `filter_complex=${plan.complexFilter.join('; ')}`
      : null,
    `output=[${plan.outputOptions.join(' ')}]`,
    plan.prep ? `prep=encodeAac(${plan.prep.src} -> ${plan.prep.dst})` : null,
  ];
  return parts.filter(Boolean).join(' ');
}
