import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import ReactPlayer from 'react-player';
import {
  ScanText,
  Sliders,
  Play,
  Pause,
  RotateCcw,
  FolderOpen,
  CheckCircle2,
  FileText,
  Eye,
  Cpu,
  FastForward,
  Rewind,
  ChevronDown,
  ChevronUp,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import ToolboxQueueList from '../common/ToolboxQueueList';
import {
  droppedToolboxPaths,
  useToolboxQueue,
} from '../../../hooks/useToolboxQueue';
import type {
  VideoOcrSubtitlesConfig,
  VideoOcrSubtitlesResult,
  VideoOcrSubtitlesProgress,
  VideoOcrRoi,
  VideoOcrPreviewResult,
} from '../../../../types/toolbox';
import { toast } from 'sonner';

interface VideoInputItem {
  filePath: string;
}

function formatSeconds(sec: number): string {
  const s = Math.max(0, sec || 0);
  const m = Math.floor(s / 60);
  const rem = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}.${ms}`;
}

export default function VideoOcrSubtitlesPanel() {
  const router = useRouter();
  const locale = router.locale || 'vi';
  const { t } = useTranslation('toolbox');
  const playerRef = useRef<ReactPlayer>(null);

  // Queue state
  const queueState = useToolboxQueue<VideoInputItem, VideoOcrSubtitlesResult>(
    'toolbox:videoOcrProgress',
  );
  const { queue, items, running: isExtracting } = queueState;

  // Selected video
  const [selectedId, setSelectedId] = useState<string>('');
  const activeItem = items.find((item) => item.id === selectedId) || items[0];
  const videoPath = activeItem?.input?.filePath || activeItem?.filePath || '';
  const isSelectingRef = useRef(false);

  // Player state
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isSeeking, setIsSeeking] = useState<boolean>(false);

  // ROI parameters (percentages 0.0 - 1.0)
  const [ymin, setYmin] = useState<number>(0.78);
  const [ymax, setYmax] = useState<number>(0.98);
  const [xmin, setXmin] = useState<number>(0.05);
  const [xmax, setXmax] = useState<number>(0.95);

  // OCR parameters
  const [sampleFps, setSampleFps] = useState<string>('2.5');
  const [minScore, setMinScore] = useState<number>(0.55);
  const [forceCpu, setForceCpu] = useState<boolean>(false);

  // Live single-frame probe state
  const [isProbing, setIsProbing] = useState<boolean>(false);
  const [probeResult, setProbeResult] = useState<VideoOcrPreviewResult | null>(null);
  const [showProbeImage, setShowProbeImage] = useState<boolean>(false);

  // Live extraction progress text
  const [liveText, setLiveText] = useState<string>('');
  const [liveCuesCount, setLiveCuesCount] = useState<number>(0);

  // Update selectedId on items change
  useEffect(() => {
    if (items.length > 0) {
      if (!selectedId || !items.some((i) => i.id === selectedId)) {
        setSelectedId(items[0].id);
      }
    } else if (selectedId) {
      setSelectedId('');
    }
  }, [items, selectedId]);

  // Reset player when switching video
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setProbeResult(null);
  }, [videoPath]);

  // Listen to live progress text from active worker
  useEffect(() => {
    if (!window.ipc) return;
    const unsub = window.ipc.on(
      'toolbox:videoOcrProgress',
      (data: { jobId: string } & VideoOcrSubtitlesProgress) => {
        if (data.currentText) {
          setLiveText(data.currentText);
        }
        if (typeof data.cuesCount === 'number') {
          setLiveCuesCount(data.cuesCount);
        }
      },
    );
    return () => unsub?.();
  }, []);

  const handleSelectVideo = async () => {
    if (isSelectingRef.current) return;
    isSelectingRef.current = true;
    try {
      const paths = await window.ipc.invoke('toolbox:selectFile', {
        type: 'video',
        multiSelections: true,
      });
      if (Array.isArray(paths) && paths.length > 0) {
        queue.add(paths.map((filePath: string) => ({ filePath })));
        const currentItems = queue.getSnapshot().items;
        if (currentItems.length > 0) {
          setSelectedId(currentItems[0].id);
        }
      }
    } finally {
      isSelectingRef.current = false;
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    const paths = droppedToolboxPaths(event);
    if (paths.length > 0) {
      queue.add(paths.map((filePath) => ({ filePath })));
      const currentItems = queue.getSnapshot().items;
      if (currentItems.length > 0) {
        setSelectedId(currentItems[0].id);
      }
    }
  };

  // Seek helper
  const seekTo = (sec: number) => {
    const target = Math.max(0, Math.min(duration || 1000, sec));
    setCurrentTime(target);
    playerRef.current?.seekTo(target, 'seconds');
  };

  const seekDelta = (deltaSec: number) => {
    seekTo(currentTime + deltaSec);
  };

  // Test OCR detection at the current playhead
  const handleTestOcrAtCurrentFrame = useCallback(async () => {
    if (!videoPath) return;
    setIsProbing(true);
    try {
      const roi: VideoOcrRoi = { ymin, ymax, xmin, xmax };
      const res: VideoOcrPreviewResult = await window.ipc.invoke(
        'toolbox:videoOcrSubtitles:previewFrame',
        {
          videoPath,
          timeSec: currentTime,
          roi,
        },
      );
      if (res && res.success) {
        setProbeResult(res);
        const hasText = res.detectedTexts && res.detectedTexts.length > 0;
        if (hasText) {
          toast.success(
            `Đã quét tại ${formatSeconds(currentTime)}: ${res.detectedTexts![0].text}`,
          );
        } else {
          toast.info(
            `Khung hình tại ${formatSeconds(currentTime)} không phát hiện chữ trong vùng ROI.`,
          );
        }
      }
    } catch (err: any) {
      toast.error(err?.message || 'Kiểm tra nhận diện thất bại');
    } finally {
      setIsProbing(false);
    }
  }, [videoPath, currentTime, ymin, ymax, xmin, xmax]);

  // Preset ROI helpers
  const applyPreset = (preset: 'bottom_standard' | 'bottom_tight' | 'center' | 'top' | 'full') => {
    switch (preset) {
      case 'bottom_standard':
        setYmin(0.78);
        setYmax(0.98);
        setXmin(0.05);
        setXmax(0.95);
        break;
      case 'bottom_tight':
        setYmin(0.85);
        setYmax(0.99);
        setXmin(0.05);
        setXmax(0.95);
        break;
      case 'center':
        setYmin(0.38);
        setYmax(0.65);
        setXmin(0.05);
        setXmax(0.95);
        break;
      case 'top':
        setYmin(0.05);
        setYmax(0.25);
        setXmin(0.05);
        setXmax(0.95);
        break;
      case 'full':
        setYmin(0.0);
        setYmax(1.0);
        setXmin(0.0);
        setXmax(1.0);
        break;
    }
    setProbeResult(null);
  };

  // Start Extraction Queue
  const handleStartExtraction = (retryId?: string) => {
    setLiveText('');
    setLiveCuesCount(0);

    queue.run(
      {
        failureMessage: t('videoOcr.failed', 'Trích xuất phụ đề thất bại'),
        cancel: (jobId) => {
          if (videoPath) {
            return window.ipc.invoke('toolbox:videoOcrSubtitles:cancel', videoPath);
          }
          return Promise.resolve(false);
        },
        execute: async (input, jobId, signal) => {
          signal.throwIfAborted();
          const config: VideoOcrSubtitlesConfig = {
            videoPath: input.filePath,
            roi: { ymin, ymax, xmin, xmax },
            sampleFps: parseFloat(sampleFps) || 2.5,
            minScore,
            forceCpu,
          };

          return window.ipc.invoke('toolbox:videoOcrSubtitles:start', {
            jobId,
            config,
          });
        },
      },
      retryId,
    );
  };

  const activeProgress =
    items.find((item) => item.status === 'running')?.progress || 0;
  const isCurrentRunning = activeItem?.status === 'running';
  const isCurrentDone = activeItem?.status === 'done';

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex min-h-0 flex-1 overflow-hidden p-4 gap-4">
        {/* Cột trái: Trình phát Video, Tua thời gian & Căn chỉnh ROI */}
        <div
          className="flex min-w-0 flex-1 flex-col overflow-y-auto space-y-4 pr-1"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          {/* Header chọn video */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ScanText className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground text-sm">
                {t('videoOcr.title', 'Trích xuất phụ đề cứng (PP-OCRv6)')}
              </h3>
              <Badge variant="secondary" className="text-xs">
                PP-OCRv6 ONNX
              </Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={isExtracting}
              onClick={handleSelectVideo}
            >
              <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
              {t('common.selectFiles', 'Chọn video')}
            </Button>
          </div>

          {videoPath ? (
            <div className="flex flex-col space-y-3">
              {/* Trình phát Video & Lớp phủ dải ROI trực quan */}
              <div
                className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-black/95 shadow-sm flex items-center justify-center group cursor-pointer"
                onClick={() => setIsPlaying(!isPlaying)}
              >
                <ReactPlayer
                  key={videoPath}
                  ref={playerRef}
                  url={`media://${encodeURIComponent(videoPath)}`}
                  width="100%"
                  height="100%"
                  playing={isPlaying}
                  controls={false}
                  onDuration={(d) => setDuration(d)}
                  onProgress={(p) => {
                    if (!isSeeking) {
                      setCurrentTime(p.playedSeconds);
                    }
                  }}
                  onEnded={() => setIsPlaying(false)}
                />

                {/* Subtitle ROI Bounding Band Visual Overlay (Luôn hiển thị trên video) */}
                <div
                  className="pointer-events-none absolute border-2 border-dashed border-amber-400 bg-amber-400/20 rounded transition-all duration-100 shadow-[0_0_12px_rgba(251,191,36,0.35)]"
                  style={{
                    top: `${ymin * 100}%`,
                    bottom: `${(1 - ymax) * 100}%`,
                    left: `${xmin * 100}%`,
                    right: `${(1 - xmax) * 100}%`,
                  }}
                >
                  <span className="absolute bottom-1 left-2 rounded bg-black/85 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 shadow">
                    Vùng nhận diện phụ đề [Y: {Math.round(ymin * 100)}% - {Math.round(ymax * 100)}%]
                  </span>
                </div>

                {/* Nút Play to đè giữa màn hình khi tạm dừng */}
                {!isPlaying && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/25">
                    <div className="h-12 w-12 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center shadow-lg transition-transform group-hover:scale-105">
                      <Play className="h-6 w-6 ml-1 fill-current" />
                    </div>
                  </div>
                )}
              </div>

              {/* Thanh điều khiển phát & tua thời gian chuyên dụng */}
              <div className="rounded-lg border border-border/80 bg-muted/40 p-2.5 space-y-2.5">
                <div className="flex items-center gap-2">
                  {/* Nút Play / Pause */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 rounded-full shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsPlaying(!isPlaying);
                    }}
                    title={isPlaying ? 'Tạm dừng (Space)' : 'Phát video (Space)'}
                  >
                    {isPlaying ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4 ml-0.5 fill-current" />
                    )}
                  </Button>

                  {/* Nút tua -5s, -1s */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      seekDelta(-5);
                    }}
                    title="Lùi 5 giây"
                  >
                    <Rewind className="h-3.5 w-3.5 mr-0.5" /> -5s
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      seekDelta(-1);
                    }}
                    title="Lùi 1 giây"
                  >
                    -1s
                  </Button>

                  {/* Thanh trượt tua thời gian (Scrubber) */}
                  <div className="flex-1 px-2">
                    <Slider
                      value={[currentTime]}
                      min={0}
                      max={duration || 100}
                      step={0.1}
                      onValueChange={([val]) => {
                        setIsSeeking(true);
                        setCurrentTime(val);
                      }}
                      onValueCommit={([val]) => {
                        setIsSeeking(false);
                        seekTo(val);
                      }}
                    />
                  </div>

                  {/* Nút tua +1s, +5s */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      seekDelta(1);
                    }}
                    title="Tiến 1 giây"
                  >
                    +1s
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      seekDelta(5);
                    }}
                    title="Tiến 5 giây"
                  >
                    +5s <FastForward className="h-3.5 w-3.5 ml-0.5" />
                  </Button>

                  {/* Đồng hồ hiển thị thời gian */}
                  <div className="font-mono text-xs tabular-nums text-foreground shrink-0 pl-1">
                    {formatSeconds(currentTime)} / {formatSeconds(duration)}
                  </div>
                </div>

                {/* Hàng nút Test OCR trực tiếp tại thời điểm hiện tại */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/50">
                  <span className="text-[11px] text-muted-foreground">
                    Tua đến các đoạn có phụ đề để kiểm tra vùng nhận diện:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 text-xs gap-1 font-medium text-primary hover:text-primary-foreground hover:bg-primary"
                      onClick={handleTestOcrAtCurrentFrame}
                      disabled={isProbing}
                    >
                      <ScanText className="h-3.5 w-3.5" />
                      {isProbing ? 'Đang nhận diện...' : `Kiểm tra OCR tại ${formatSeconds(currentTime)}`}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Bảng kết quả kiểm tra nhận diện đơn khung hình (Live OCR Probe Result) */}
              {probeResult && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                      <Sparkles className="h-4 w-4" />
                      <span>Kết quả nhận diện tại giây {formatSeconds(probeResult.time)}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[11px] text-muted-foreground hover:text-foreground gap-1"
                      onClick={() => setShowProbeImage(!showProbeImage)}
                    >
                      <Eye className="h-3 w-3" />
                      {showProbeImage ? 'Ẩn ảnh chụp' : 'Xem ảnh chụp OCR'}
                      {showProbeImage ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </Button>
                  </div>

                  {probeResult.detectedTexts && probeResult.detectedTexts.length > 0 ? (
                    <div className="space-y-1.5">
                      <div className="p-2 rounded bg-background border border-border/80 text-xs text-foreground font-medium">
                        🎯 Phụ đề phát hiện:{' '}
                        <span className="text-primary font-bold">
                          "{probeResult.detectedTexts[0].text}"
                        </span>
                      </div>
                      {probeResult.detectedTexts.length > 1 && (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {probeResult.detectedTexts.slice(1).map((t, idx) => (
                            <Badge
                              key={idx}
                              variant="outline"
                              className="text-[11px] font-normal text-muted-foreground"
                            >
                              {t.text} ({Math.round(t.score * 100)}%)
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs text-amber-500 bg-amber-500/10 p-2 rounded">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>
                        Không phát hiện chữ trong khung hình này. Hãy thử tua video đến đoạn có lời thoại hoặc điều chỉnh lại dải ROI bên dưới.
                      </span>
                    </div>
                  )}

                  {/* Ảnh chụp khung hình (kèm dải ROI) khi mở xem */}
                  {showProbeImage && probeResult.dataUri && (
                    <div className="pt-2 border-t border-border/40">
                      <div className="aspect-video w-full rounded overflow-hidden border border-border bg-black">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={probeResult.dataUri}
                          alt="Captured OCR Frame"
                          className="h-full w-full object-contain"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Sliders căn chỉnh vùng nhận diện (ROI) */}
              <div className="rounded-lg border border-border/80 bg-muted/30 p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Sliders className="h-3.5 w-3.5 text-primary" />
                    <span>Căn chỉnh dải phụ đề (Subtitle ROI)</span>
                  </div>

                  {/* Bộ nút chọn vị trí nhanh (Presets) */}
                  <div className="flex flex-wrap items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2"
                      onClick={() => applyPreset('bottom_standard')}
                      title="Mặc định cho phụ đề ở chân video (78% - 98%)"
                    >
                      Chân video
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2"
                      onClick={() => applyPreset('bottom_tight')}
                      title="Sát đáy video (85% - 99%)"
                    >
                      Sát đáy
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2"
                      onClick={() => applyPreset('center')}
                      title="Giữa màn hình (38% - 65%)"
                    >
                      Giữa hình
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2"
                      onClick={() => applyPreset('top')}
                      title="Đầu video (5% - 25%)"
                    >
                      Đầu video
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2"
                      onClick={() => applyPreset('full')}
                      title="Toàn màn hình (0% - 100%)"
                    >
                      Toàn hình
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] px-1 text-muted-foreground"
                      onClick={() => applyPreset('bottom_standard')}
                      title="Khôi phục mặc định"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* Vị trí trên (Y-min) */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <Label className="text-xs text-muted-foreground">
                      Mép trên dải phụ đề:
                    </Label>
                    <span className="font-mono text-xs text-foreground">
                      {Math.round(ymin * 100)}%
                    </span>
                  </div>
                  <Slider
                    value={[ymin * 100]}
                    min={0}
                    max={95}
                    step={1}
                    onValueChange={([v]) => {
                      if (v < ymax * 100) setYmin(v / 100);
                    }}
                  />
                </div>

                {/* Vị trí dưới (Y-max) */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <Label className="text-xs text-muted-foreground">
                      Mép dưới dải phụ đề:
                    </Label>
                    <span className="font-mono text-xs text-foreground">
                      {Math.round(ymax * 100)}%
                    </span>
                  </div>
                  <Slider
                    value={[ymax * 100]}
                    min={5}
                    max={100}
                    step={1}
                    onValueChange={([v]) => {
                      if (v > ymin * 100) setYmax(v / 100);
                    }}
                  />
                </div>

                {/* Vị trí trái (X-min) & Phải (X-max) */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <Label className="text-[11px] text-muted-foreground">
                        Lề trái:
                      </Label>
                      <span className="font-mono text-xs text-foreground">
                        {Math.round(xmin * 100)}%
                      </span>
                    </div>
                    <Slider
                      value={[xmin * 100]}
                      min={0}
                      max={45}
                      step={1}
                      onValueChange={([v]) => setXmin(v / 100)}
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <Label className="text-[11px] text-muted-foreground">
                        Lề phải:
                      </Label>
                      <span className="font-mono text-xs text-foreground">
                        {Math.round(xmax * 100)}%
                      </span>
                    </div>
                    <Slider
                      value={[xmax * 100]}
                      min={55}
                      max={100}
                      step={1}
                      onValueChange={([v]) => setXmax(v / 100)}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Trạng thái chưa chọn video */
            <div
              className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border p-8 text-center cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={handleSelectVideo}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ScanText className="h-6 w-6" />
              </div>
              <h4 className="mt-3 text-sm font-semibold text-foreground">
                Kéo thả hoặc chọn video cần trích xuất phụ đề
              </h4>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                Hỗ trợ trích xuất phụ đề video hardsub (TikTok, Douyin, phim, clip tin tức) thành tệp .srt bằng mô hình PP-OCRv6.
              </p>
              <Button
                size="sm"
                className="mt-4"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleSelectVideo();
                }}
              >
                <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                Chọn video
              </Button>
            </div>
          )}
        </div>

        {/* Cột phải: Cấu hình trích xuất & Danh sách hàng đợi */}
        <div className="flex w-80 flex-col space-y-4 border-l border-border pl-4">
          <div className="space-y-1">
            <h4 className="font-semibold text-foreground text-sm">
              Cấu hình mô hình
            </h4>
            <p className="text-xs text-muted-foreground">
              Baidu PP-OCRv6 ONNX Runtime
            </p>
          </div>

          {/* Tần suất lấy mẫu (FPS) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Tốc độ quét mẫu (FPS)</Label>
            <Select
              value={sampleFps}
              onValueChange={setSampleFps}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1.0">1.0 FPS (Siêu nhanh / Video dài)</SelectItem>
                <SelectItem value="2.0">2.0 FPS (Nhanh)</SelectItem>
                <SelectItem value="2.5">
                  2.5 FPS (Khuyên dùng / Cân bằng nhất)
                </SelectItem>
                <SelectItem value="3.0">3.0 FPS (Chi tiết)</SelectItem>
                <SelectItem value="4.0">
                  4.0 FPS (Chính xác cao / Sub chạy nhanh)
                </SelectItem>
                <SelectItem value="5.0">5.0 FPS (Mật độ cao / Chậm)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Độ tự tin tối thiểu */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <Label className="text-xs font-medium">Độ tự tin nhận dạng</Label>
              <span className="text-muted-foreground font-mono">
                {Math.round(minScore * 100)}%
              </span>
            </div>
            <Slider
              value={[minScore * 100]}
              min={30}
              max={85}
              step={5}
              onValueChange={([val]) => setMinScore(val / 100)}
            />
          </div>

          {/* Bắt buộc dùng CPU */}
          <div className="flex items-center justify-between rounded-lg border border-border p-2.5">
            <div className="space-y-0.5">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Cpu className="h-3 w-3" />
                Chạy thuần CPU
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Tương thích tối đa với mọi máy tính
              </p>
            </div>
            <Switch checked={forceCpu} onCheckedChange={setForceCpu} />
          </div>

          {/* Nút bắt đầu trích xuất */}
          <Button
            className="w-full"
            disabled={isExtracting || items.length === 0}
            onClick={() => handleStartExtraction()}
          >
            <Play className="mr-2 h-4 w-4 fill-current" />
            {isExtracting
              ? t('common.processing', 'Đang trích xuất...')
              : t('videoOcr.start', 'Bắt đầu trích xuất phụ đề')}
          </Button>

          {/* Thanh tiến trình */}
          {isExtracting && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Tiến trình trích xuất</span>
                <span className="font-mono">{Math.round(activeProgress)}%</span>
              </div>
              <Progress value={activeProgress} className="h-2" />
              {liveText && (
                <div className="truncate rounded bg-muted/60 px-2 py-1 text-[11px] text-foreground">
                  Đang nhận diện: <span className="font-medium text-primary">"{liveText}"</span>
                </div>
              )}
            </div>
          )}

          {/* Thông báo kết quả thành công */}
          {isCurrentDone && activeItem?.result?.success && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                <span>Trích xuất phụ đề thành công!</span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">
                Tạo thành công {activeItem.result.subtitlesCount} câu phụ đề.
              </p>
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs flex-1"
                  onClick={async () => {
                    if (activeItem.result?.outputPath) {
                      try {
                        await window.ipc?.invoke(
                          'toolbox:openFolder',
                          activeItem.result.outputPath,
                        );
                      } catch {
                        await window.ipc?.invoke(
                          'shell:showItemInFolder',
                          activeItem.result.outputPath,
                        );
                      }
                    }
                  }}
                >
                  <FolderOpen className="mr-1 h-3 w-3" />
                  Mở thư mục
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs flex-1"
                  onClick={() => {
                    if (activeItem.result?.outputPath) {
                      void router.push({
                        pathname: `/${locale}/proofread`,
                        query: { file: [activeItem.result.outputPath] },
                      });
                    }
                  }}
                >
                  <FileText className="mr-1 h-3 w-3" />
                  Mở trình sửa
                </Button>
              </div>
            </div>
          )}

          {/* Danh sách hàng đợi */}
          <div className="flex-1 overflow-hidden flex flex-col pt-2 border-t border-border">
            <div className="flex items-center justify-between pb-2">
              <span className="text-xs font-medium text-muted-foreground">
                Danh sách video ({items.length})
              </span>
              {items.length > 0 && !isExtracting && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] text-muted-foreground"
                  onClick={() => queue.clear()}
                >
                  Xoá hết
                </Button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              <ToolboxQueueList
                {...queueState}
                selectedId={selectedId}
                onSelect={(id) => setSelectedId(id)}
                onRemove={(id) => queue.remove(id)}
                onRetry={(id) => handleStartExtraction(id)}
                onCancel={() => void queue.cancel()}
                onClear={() => queue.clear()}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
