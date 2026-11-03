import React, { useEffect, useState, useCallback } from 'react';
import ReactPlayer from 'react-player';
import { useTranslation } from 'next-i18next';
import { isAudioPath } from 'lib/utils';
import { ArrowUp, ArrowDown, Eye, EyeOff } from 'lucide-react';

export type SubtitlePosition = 'top' | 'bottom';
export type SubtitleTrackRole = 'all' | 'source' | 'target';

interface VideoPlayerProps {
  videoPath: string;
  playerRef: React.RefObject<ReactPlayer>;
  isPlaying: boolean;
  onPlayingChange?: (playing: boolean) => void;
  onMediaReady?: () => void;
  playbackRate: number;
  subtitleTracks?: Array<{
    kind: string;
    src: string;
    srcLang: string;
    default?: boolean;
    label: string;
    role?: string;
  }>;
  togglePlay: () => void;
  goToNextSubtitle: () => void;
  goToPreviousSubtitle: () => void;
  seekVideo: (seconds: number) => void;
  handleProgress: (state: { playedSeconds: number }) => void;
  setDuration: (duration: number) => void;
  changePlaybackRate: (delta: number) => void;
  setPlaybackRate: (rate: number) => void;
}

const applyCuePositionToTrack = (track: TextTrack, pos: SubtitlePosition) => {
  if (!track || !track.cues) return;
  for (let i = 0; i < track.cues.length; i++) {
    const cue = track.cues[i] as any;
    if (cue) {
      try {
        cue.snapToLines = false;
        cue.line = pos === 'top' ? 8 : 90;
      } catch {
        // Safe fallback in environments where cue line cannot be modified
      }
    }
  }
};

const shouldTrackShow = (
  trackItem: { default?: boolean; role?: string; label?: string },
  visible: boolean,
  roleChoice: SubtitleTrackRole,
) => {
  if (!visible) return false;
  if (roleChoice === 'source') {
    return (
      trackItem.role === 'source' ||
      trackItem.label?.toLowerCase().includes('source') ||
      trackItem.label?.includes('原文') ||
      false
    );
  }
  if (roleChoice === 'target') {
    return (
      trackItem.role === 'target' ||
      trackItem.label?.toLowerCase().includes('target') ||
      trackItem.label?.includes('译文') ||
      false
    );
  }
  return !!trackItem.default;
};

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  videoPath,
  playerRef,
  isPlaying,
  onPlayingChange,
  onMediaReady,
  playbackRate,
  subtitleTracks,
  handleProgress,
  setDuration,
}) => {
  const { t } = useTranslation('home');
  const [mediaElement, setMediaElement] = useState<HTMLMediaElement | null>(
    null,
  );

  // Vị trí phụ đề xem trước: mặc định 'top' (trên đỉnh) để không che hardsub gốc ở dưới
  const [subtitlePosition, setSubtitlePosition] = useState<SubtitlePosition>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('smartsub_preview_subtitle_position');
      if (saved === 'top' || saved === 'bottom') return saved;
    }
    return 'top';
  });

  // Bật/tắt hiển thị phụ đề xem trước (mặc định bật)
  const [subtitlesVisible, setSubtitlesVisible] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('smartsub_preview_subtitle_visible');
      if (saved !== null) return saved !== 'false';
    }
    return true;
  });

  // Lựa chọn track hiển thị khi có cả Gốc và Dịch
  const [selectedTrackRole, setSelectedTrackRole] = useState<SubtitleTrackRole>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('smartsub_preview_subtitle_role');
      if (saved === 'all' || saved === 'source' || saved === 'target') return saved;
    }
    return 'all';
  });

  const hasTracks = Boolean(subtitleTracks && subtitleTracks.length > 0);
  const hasMultipleTracks = Boolean(subtitleTracks && subtitleTracks.length > 1);

  // ReactPlayer v2 caches file config by URL, so late/retried tracks need
  // their own lifecycle without remounting the playing media element.
  useEffect(() => {
    if (!mediaElement) return;
    const tracks = (subtitleTracks || []).map((track) => {
      const element = document.createElement('track');
      element.kind = track.kind;
      element.src = track.src;
      element.srclang = track.srcLang;
      element.label = track.label;
      element.default = !!track.default;

      const isShowing = shouldTrackShow(track, subtitlesVisible, selectedTrackRole);

      element.onload = () => {
        try {
          if (element.track) {
            element.track.mode = isShowing ? 'showing' : 'disabled';
            applyCuePositionToTrack(element.track, subtitlePosition);
          }
        } catch {
          // ignore in jsdom / unsupported environments
        }
      };

      mediaElement.appendChild(element);
      try {
        if (element.track) {
          element.track.mode = isShowing ? 'showing' : 'hidden';
        }
      } catch {
        // ignore
      }
      return element;
    });

    return () =>
      tracks.forEach((track) => {
        track.onload = null;
        track.remove();
      });
  }, [mediaElement, subtitleTracks]);

  // Cập nhật chế độ hiển thị và vị trí cues khi state thay đổi
  useEffect(() => {
    if (!mediaElement || !mediaElement.textTracks) return;
    for (let i = 0; i < mediaElement.textTracks.length; i++) {
      const textTrack = mediaElement.textTracks[i];
      const matchingTrack = subtitleTracks?.find(
        (t) => t.label === textTrack.label || t.srcLang === textTrack.language,
      );
      const isShowing = matchingTrack
        ? shouldTrackShow(matchingTrack, subtitlesVisible, selectedTrackRole)
        : subtitlesVisible;

      try {
        textTrack.mode = isShowing ? 'showing' : 'hidden';
        applyCuePositionToTrack(textTrack, subtitlePosition);
      } catch {
        // ignore
      }
    }
  }, [subtitlesVisible, subtitlePosition, selectedTrackRole, mediaElement, subtitleTracks]);

  // Lắng nghe sự kiện cuechange để đảm bảo các cue xuất hiện luôn ở đúng vị trí
  useEffect(() => {
    if (!mediaElement || !mediaElement.textTracks) return;
    const handleCueChange = (e: Event) => {
      const track = e.target as TextTrack;
      if (track) {
        applyCuePositionToTrack(track, subtitlePosition);
      }
    };
    for (let i = 0; i < mediaElement.textTracks.length; i++) {
      try {
        mediaElement.textTracks[i].addEventListener('cuechange', handleCueChange);
      } catch {
        // ignore
      }
    }
    return () => {
      if (!mediaElement || !mediaElement.textTracks) return;
      for (let i = 0; i < mediaElement.textTracks.length; i++) {
        try {
          mediaElement.textTracks[i].removeEventListener('cuechange', handleCueChange);
        } catch {
          // ignore
        }
      }
    };
  }, [mediaElement, subtitlePosition]);

  // Phím tắt 'V' bật/tắt nhanh phụ đề xem trước
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === 'v' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.shiftKey
      ) {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable ||
            target.closest?.('[contenteditable="true"]') ||
            target.closest?.('[data-subtitle-editor]'))
        ) {
          return;
        }
        setSubtitlesVisible((prev) => {
          const next = !prev;
          try {
            localStorage.setItem('smartsub_preview_subtitle_visible', String(next));
          } catch {
            // ignore
          }
          return next;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const togglePosition = useCallback(() => {
    const nextPos: SubtitlePosition = subtitlePosition === 'top' ? 'bottom' : 'top';
    setSubtitlePosition(nextPos);
    try {
      localStorage.setItem('smartsub_preview_subtitle_position', nextPos);
    } catch {
      // ignore
    }
    if (mediaElement?.textTracks) {
      for (let i = 0; i < mediaElement.textTracks.length; i++) {
        applyCuePositionToTrack(mediaElement.textTracks[i], nextPos);
      }
    }
  }, [subtitlePosition, mediaElement]);

  const toggleVisibility = useCallback(() => {
    const nextVis = !subtitlesVisible;
    setSubtitlesVisible(nextVis);
    try {
      localStorage.setItem('smartsub_preview_subtitle_visible', String(nextVis));
    } catch {
      // ignore
    }
    if (mediaElement?.textTracks) {
      for (let i = 0; i < mediaElement.textTracks.length; i++) {
        const textTrack = mediaElement.textTracks[i];
        if (!nextVis) {
          textTrack.mode = 'hidden';
        } else {
          const matchingTrack = subtitleTracks?.find(
            (t) => t.label === textTrack.label || t.srcLang === textTrack.language,
          );
          textTrack.mode = shouldTrackShow(
            matchingTrack || {},
            true,
            selectedTrackRole,
          )
            ? 'showing'
            : 'hidden';
          applyCuePositionToTrack(textTrack, subtitlePosition);
        }
      }
    }
  }, [subtitlesVisible, subtitlePosition, selectedTrackRole, mediaElement, subtitleTracks]);

  const toggleTrackRole = useCallback(() => {
    let nextRole: SubtitleTrackRole = 'all';
    if (selectedTrackRole === 'all') nextRole = 'source';
    else if (selectedTrackRole === 'source') nextRole = 'target';
    else nextRole = 'all';

    setSelectedTrackRole(nextRole);
    try {
      localStorage.setItem('smartsub_preview_subtitle_role', nextRole);
    } catch {
      // ignore
    }
  }, [selectedTrackRole]);

  const onReady = (player: ReactPlayer) => {
    const media = player.getInternalPlayer();
    if (media instanceof HTMLMediaElement) setMediaElement(media);
    onMediaReady?.();
  };

  // 纯音频：渲染紧凑播放条（无黑色视频框/空白占位），使左侧首元素与右侧列表顶部对齐
  if (isAudioPath(videoPath)) {
    return (
      <div className="flex flex-col flex-shrink-0">
        <div className="mb-2 rounded-md border bg-muted/30 p-1.5">
          <ReactPlayer
            ref={playerRef}
            url={`media://${encodeURIComponent(videoPath)}`}
            width="100%"
            height="54px"
            playing={isPlaying}
            controls={true}
            onPlay={() => onPlayingChange?.(true)}
            onPause={() => onPlayingChange?.(false)}
            onEnded={() => onPlayingChange?.(false)}
            playbackRate={playbackRate}
            onProgress={handleProgress}
            onDuration={setDuration}
            onReady={onReady}
            progressInterval={100}
            key={videoPath}
            config={{ file: { forceAudio: true } }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-shrink-0">
      <div className="relative bg-black mb-2 max-h-[38.5vh] flex items-center justify-center group overflow-hidden rounded-md border border-border">
        {videoPath ? (
          <>
            <ReactPlayer
              ref={playerRef}
              url={`media://${encodeURIComponent(videoPath)}`}
              width="100%"
              height="100%"
              style={{ maxHeight: '38.5vh' }}
              playing={isPlaying}
              controls={true}
              onPlay={() => onPlayingChange?.(true)}
              onPause={() => onPlayingChange?.(false)}
              onEnded={() => onPlayingChange?.(false)}
              playbackRate={playbackRate}
              onProgress={handleProgress}
              onDuration={setDuration}
              onReady={onReady}
              progressInterval={100}
              key={videoPath}
            />

            {/* Thanh điều khiển phụ đề xem trước trên video */}
            {hasTracks && (
              <div
                className="absolute top-2 right-2 z-10 flex items-center gap-1.5 bg-black/75 backdrop-blur-md px-2 py-1 rounded-md border border-white/15 text-white text-xs select-none shadow-lg opacity-85 hover:opacity-100 transition-opacity"
                data-testid="preview-subtitle-controls"
              >
                {/* Nút đổi vị trí: Trên / Dưới */}
                <button
                  type="button"
                  onClick={togglePosition}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white/20 transition-colors text-neutral-200 hover:text-white"
                  title={t('previewPositionTooltip', 'Đổi vị trí phụ đề preview (Trên / Dưới) tránh đè lên sub gốc')}
                >
                  {subtitlePosition === 'top' ? (
                    <>
                      <ArrowUp className="w-3 h-3 text-emerald-400" />
                      <span>{t('previewPositionTop', 'Trên')}</span>
                    </>
                  ) : (
                    <>
                      <ArrowDown className="w-3 h-3 text-amber-400" />
                      <span>{t('previewPositionBottom', 'Dưới')}</span>
                    </>
                  )}
                </button>

                <span className="w-px h-3 bg-white/20" />

                {/* Nút chọn track Gốc / Dịch nếu có nhiều hơn 1 track */}
                {hasMultipleTracks && (
                  <>
                    <button
                      type="button"
                      onClick={toggleTrackRole}
                      className="px-1.5 py-0.5 rounded hover:bg-white/20 transition-colors text-neutral-200 hover:text-white font-mono"
                      title={t('previewTrackTooltip', 'Chuyển đổi phụ đề Gốc (ASR/OCR) hoặc Bản dịch')}
                    >
                      {selectedTrackRole === 'source'
                        ? t('previewTrackSource', 'Gốc')
                        : selectedTrackRole === 'target'
                        ? t('previewTrackTarget', 'Dịch')
                        : t('previewTrackAll', 'Tất cả')}
                    </button>
                    <span className="w-px h-3 bg-white/20" />
                  </>
                )}

                {/* Nút bật/tắt phụ đề xem trước */}
                <button
                  type="button"
                  onClick={toggleVisibility}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${
                    subtitlesVisible
                      ? 'hover:bg-white/20 text-neutral-200 hover:text-white'
                      : 'bg-red-500/30 text-red-300 hover:bg-red-500/40'
                  }`}
                  title={t('previewVisibilityTooltip', 'Ẩn/Hiện phụ đề xem trước (Phím tắt: V)')}
                >
                  {subtitlesVisible ? (
                    <>
                      <Eye className="w-3.5 h-3.5 text-blue-400" />
                      <span>{t('previewSubtitlesOn', 'Sub')}</span>
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-3.5 h-3.5 text-neutral-400" />
                      <span>{t('previewSubtitlesOff', 'Tắt')}</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
            {t('videoNotFound')}
          </div>
        )}
      </div>

      {/* 视频控制按钮区域 */}
      {/* <div className="p-2 border rounded-md bg-muted/30">
        <div className="text-sm mb-2">{t('playbackControls')}</div>
        <div className="flex justify-between items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => seekVideo(-5)}
          >
            <Rewind className="h-3 w-3" />
            <span className="sr-only">{t('rewind5Seconds')}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goToPreviousSubtitle}
          >
            <SkipBack className="h-3 w-3" />
            <span className="sr-only">{t('previousSubtitle')}</span>
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={togglePlay}
            className="flex-1"
          >
            {isPlaying ? (
              <Pause className="h-3 w-3 mr-1" />
            ) : (
              <Play className="h-3 w-3 mr-1" />
            )}
            {isPlaying ? t('pause') : t('play')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goToNextSubtitle}
          >
            <SkipForward className="h-3 w-3" />
            <span className="sr-only">{t('nextSubtitle')}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => seekVideo(5)}
          >
            <FastForward className="h-3 w-3" />
            <span className="sr-only">{t('forward5Seconds')}</span>
          </Button>
        </div>

        <div className="flex justify-between items-center mt-2">
          <div className="text-sm">
            {t('playbackSpeed')}: {playbackRate.toFixed(2)}x
          </div>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => changePlaybackRate(-0.25)}
              disabled={playbackRate <= 0.25}
            >
              -
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPlaybackRate(1)}
            >
              1x
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => changePlaybackRate(0.25)}
              disabled={playbackRate >= 2}
            >
              +
            </Button>
          </div>
        </div>
      </div> */}
    </div>
  );
};

export default VideoPlayer;
