import { Subtitle } from '../hooks/useSubtitles';
import { joinSubtitleContent } from './proofreadUtils';
import { mergeSpeakerIds } from '../../types/speakerDiarization';
import { normalizePrimarySpeakerId } from '../../types/proofreadData';

export interface AutoMergeOptions {
  /** Maximum duration (in seconds) of a cue to be considered "short" (default: 1.2s) */
  maxShortDuration?: number;
  /** Maximum silence gap (in seconds) between two consecutive cues to allow merging (default: 0.5s) */
  maxSilenceGap?: number;
  /** Maximum total duration (in seconds) of a merged cue (default: 6.0s) */
  maxMergedDuration?: number;
  /** Maximum characters of a merged cue (default: 60) */
  maxMergedChars?: number;
  /** Only merge if cues have the same speaker (default: true) */
  sameSpeakerOnly?: boolean;
}

export interface MergePreviewPair {
  before: Subtitle[];
  after: Subtitle;
}

export interface AutoMergeResult {
  mergedSubtitles: Subtitle[];
  mergedCount: number; // Number of original cues merged away (before.length - after.length)
  mergeGroupsCount: number; // Number of merge operations/groups
  previewPairs: MergePreviewPair[];
}

/** Converts SRT time string (HH:MM:SS,mmm or HH:MM:SS.mmm) to seconds */
export function timeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.replace(',', '.').split(':');
  if (parts.length !== 3) return 0;
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  const seconds = parseFloat(parts[2]) || 0;
  return hours * 3600 + minutes * 60 + seconds;
}

/** Formats seconds to SRT time format (HH:MM:SS,mmm) */
export function secondsToTime(seconds: number): string {
  const safeSeconds = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = (safeSeconds % 60).toFixed(3);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.padStart(6, '0').replace('.', ',')}`;
}

export function getCueStartSeconds(sub: Subtitle): number {
  if (
    typeof sub.startTimeInSeconds === 'number' &&
    Number.isFinite(sub.startTimeInSeconds)
  ) {
    return sub.startTimeInSeconds;
  }
  const parts = (sub.startEndTime || '').split(' --> ');
  return parts[0] ? timeToSeconds(parts[0]) : 0;
}

export function getCueEndSeconds(sub: Subtitle): number {
  if (
    typeof sub.endTimeInSeconds === 'number' &&
    Number.isFinite(sub.endTimeInSeconds)
  ) {
    return sub.endTimeInSeconds;
  }
  const parts = (sub.startEndTime || '').split(' --> ');
  return parts[1] ? timeToSeconds(parts[1]) : 0;
}

/**
 * Pure calculation function to merge short subtitle cues based on duration, gap, and speaker constraints.
 * Safe for production: never alters original array, guarantees 100% valid SRT timestamps and speaker assignments.
 */
export function computeAutoMerge(
  subtitles: Subtitle[],
  options: AutoMergeOptions = {},
): AutoMergeResult {
  const {
    maxShortDuration = 1.2,
    maxSilenceGap = 0.5,
    maxMergedDuration = 6.0,
    maxMergedChars = 60,
    sameSpeakerOnly = true,
  } = options;

  if (!subtitles || subtitles.length < 2) {
    return {
      mergedSubtitles: subtitles || [],
      mergedCount: 0,
      mergeGroupsCount: 0,
      previewPairs: [],
    };
  }

  const result: Subtitle[] = [];
  const previewPairs: MergePreviewPair[] = [];
  let i = 0;

  while (i < subtitles.length) {
    const current = subtitles[i];
    const currentStart = getCueStartSeconds(current);
    let currentEnd = getCueEndSeconds(current);
    let currentDuration = Math.max(0, currentEnd - currentStart);

    const mergeGroup: Subtitle[] = [current];
    let nextIdx = i + 1;

    while (nextIdx < subtitles.length) {
      const next = subtitles[nextIdx];
      const nextStart = getCueStartSeconds(next);
      const nextEnd = getCueEndSeconds(next);
      const nextDuration = Math.max(0, nextEnd - nextStart);
      const gap = nextStart - currentEnd;

      // Condition 1: At least one cue is "short"
      const hasShortCue =
        currentDuration <= maxShortDuration || nextDuration <= maxShortDuration;
      if (!hasShortCue) break;

      // Condition 2: Gap between cues must be within maxSilenceGap (allow tiny overlap up to -0.05s)
      if (gap < -0.05 || gap > maxSilenceGap) break;

      // Condition 3: Total duration after merging must not exceed maxMergedDuration
      const totalDuration = nextEnd - currentStart;
      if (totalDuration > maxMergedDuration) break;

      // Condition 4: Speaker compatibility
      if (sameSpeakerOnly) {
        const curSpeaker =
          current.primarySpeakerId ?? current.speakerIds?.[0];
        const nextSpeaker = next.primarySpeakerId ?? next.speakerIds?.[0];
        if (
          curSpeaker !== undefined &&
          nextSpeaker !== undefined &&
          curSpeaker !== nextSpeaker
        ) {
          break;
        }
      }

      // Condition 5: Total characters after merging
      const combinedSource = joinSubtitleContent([
        ...mergeGroup.map((s) => s.sourceContent || s.content?.join(' ') || ''),
        next.sourceContent || next.content?.join(' ') || '',
      ]);
      if (combinedSource.length > maxMergedChars) break;

      // All conditions met: append next to current merge group
      mergeGroup.push(next);
      currentEnd = nextEnd;
      currentDuration = currentEnd - currentStart;
      nextIdx++;
    }

    if (mergeGroup.length > 1) {
      const mergedSource = joinSubtitleContent(
        mergeGroup.map((s) => s.sourceContent || s.content?.join('\n') || ''),
      );
      const mergedTarget = joinSubtitleContent(
        mergeGroup.map((s) => s.targetContent || ''),
      );
      const mergedSpeakerIds = mergeSpeakerIds(
        ...mergeGroup.map((s) => s.speakerIds),
      );
      const preferredPrimary = mergeGroup.find((s) =>
        mergedSpeakerIds.includes(s.primarySpeakerId || -1),
      )?.primarySpeakerId;

      const mergedSubtitle: Subtitle = {
        ...mergeGroup[0],
        sourceContent: mergedSource,
        targetContent: mergedTarget || undefined,
        content: mergedSource.split('\n'),
        startEndTime: `${secondsToTime(currentStart)} --> ${secondsToTime(currentEnd)}`,
        startTimeInSeconds: currentStart,
        endTimeInSeconds: currentEnd,
        ...(mergedSpeakerIds.length
          ? {
              speakerIds: mergedSpeakerIds,
              primarySpeakerId: normalizePrimarySpeakerId(
                preferredPrimary,
                mergedSpeakerIds,
              ),
            }
          : { speakerIds: undefined, primarySpeakerId: undefined }),
        ...(mergeGroup.some((s) => s.speakerAssignmentSource === 'manual')
          ? { speakerAssignmentSource: 'manual' as const }
          : {}),
      };

      result.push(mergedSubtitle);
      previewPairs.push({
        before: [...mergeGroup],
        after: mergedSubtitle,
      });
      i = nextIdx;
    } else {
      result.push(current);
      i++;
    }
  }

  // Renormalize 1-based IDs
  const normalized = result.map((sub, idx) => {
    const id = String(idx + 1);
    return sub.id === id ? sub : { ...sub, id };
  });

  const mergedCount = subtitles.length - normalized.length;

  return {
    mergedSubtitles: normalized,
    mergedCount,
    mergeGroupsCount: previewPairs.length,
    previewPairs,
  };
}
