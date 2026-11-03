import fs from 'fs';
import path from 'path';
import type { AsrProvider } from '../../../types/asrProvider';
import {
  TaskCancelledError,
  throwIfSignalCancelled,
} from '../../helpers/taskContext';
import { logMessage } from '../../helpers/storeManager';
import type {
  AsrSegment,
  AsrTranscribeInput,
  AsrTranscribeResult,
  AsrWord,
} from './types';

// Webpack bundles the electron main process into CommonJS.
// jianying-subtitle is an ESM-only package ("type": "module").
// Using new Function('return import(...)') ensures native Node ESM dynamic import is used at runtime without Webpack converting it to require().
const loadJianying = async (): Promise<typeof import('jianying-subtitle')> => {
  const importer = new Function('return import("jianying-subtitle")') as () => Promise<
    typeof import('jianying-subtitle')
  >;
  return importer();
};

const DEFAULT_TIMEOUT_SEC = 300;

/**
 * 剪映 (JianYing / CapCut) 云端免费 ASR 识别实现。
 *
 * 底层对接字节跳动剪映 PC 端极速 ASR 接口（由 jianying-subtitle 封装）：
 * 1. 本地计算音频 CRC32 并申请 ByteDance VOD 上传凭据；
 * 2. 直传 ByteDance VOD（支持 mp3 / wav / flac / m4a）；
 * 3. 提交转写任务 /lv/v1/audio_subtitle/submit；
 * 4. 轮询结果 /lv/v1/audio_subtitle/query 并解析 utterances 与 word timestamps。
 *
 * 模型选项：
 * - `jianying-default` (默认)：保留抖音剪映原生切句边界（hasWordTimestamps = false），原汁原味短视频分句；
 * - `jianying-words`：输出词级时间戳（hasWordTimestamps = true），交给 SmartSub 成句管线基于字数上限重排。
 */
export async function transcribeWithJianying(
  provider: AsrProvider,
  input: AsrTranscribeInput,
): Promise<AsrTranscribeResult> {
  throwIfSignalCancelled(input.signal);

  if (!fs.existsSync(input.audioPath)) {
    throw new Error(`JianYing ASR: audio file not found: ${input.audioPath}`);
  }

  const timeoutSec =
    Number(provider?.requestTimeoutSec) > 0
      ? Number(provider.requestTimeoutSec)
      : DEFAULT_TIMEOUT_SEC;

  logMessage(
    `JianYing ASR: starting Douyin/CapCut transcription for ${path.basename(input.audioPath)}`,
    'info',
  );

  try {
    const { transcribe } = await loadJianying();
    const rawSegments = await transcribe({
      input: input.audioPath,
      signal: input.signal,
      queryTimeoutMs: timeoutSec * 1000,
      onProgress: (percent, msg) => {
        logMessage(`JianYing ASR (${percent}%): ${msg}`, 'info');
      },
    });

    throwIfSignalCancelled(input.signal);

    const segments: AsrSegment[] = [];
    const words: AsrWord[] = [];

    for (const seg of rawSegments) {
      const start = (seg.startMs || 0) / 1000;
      const end = (seg.endMs || 0) / 1000;
      const text = String(seg.text || '').trim();
      if (text && end > start) {
        segments.push({ start, end, text });
      }
      if (Array.isArray(seg.words)) {
        for (const w of seg.words) {
          const wText = String(w.text || '').trim();
          const wStart = (w.startMs || 0) / 1000;
          const wEnd = (w.endMs || 0) / 1000;
          if (wText && wEnd >= wStart) {
            words.push({ word: wText, start: wStart, end: wEnd });
          }
        }
      }
    }

    const fullText = segments.map((s) => s.text).join(' ');
    const duration =
      segments.length > 0 ? segments[segments.length - 1].end : undefined;

    const useWordTimestamps =
      input.model === 'jianying-words' && words.length > 0;

    return {
      text: fullText,
      language: 'zh',
      duration,
      segments,
      words,
      hasWordTimestamps: useWordTimestamps,
    };
  } catch (error) {
    if (input.signal?.aborted) throw new TaskCancelledError();
    logMessage(
      `JianYing ASR error: ${error instanceof Error ? error.message : String(error)}`,
      'error',
    );
    throw error;
  }
}
