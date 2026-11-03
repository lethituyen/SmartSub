import React, { useState } from 'react';
import { useTranslation } from 'next-i18next';
import {
  UploadCloud,
  Sparkles,
  ShieldCheck,
  Zap,
  Sliders,
  FolderOpen,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import ToolboxFinishBar from '../common/ToolboxFinishBar';
import ToolboxQueueList from '../common/ToolboxQueueList';
import {
  droppedToolboxPaths,
  useToolboxQueue,
} from '../../../hooks/useToolboxQueue';
import type {
  VideoRemakePreset,
  VideoRemakeConfig,
  VideoRemakeResult,
} from '../../../../types/toolbox';

export default function VideoRemakerPanel() {
  const { t } = useTranslation('toolbox');

  const queueState = useToolboxQueue<{ filePath: string }, VideoRemakeResult>(
    'toolbox:remakeProgress',
  );
  const { queue, items: files, running: isProcessing } = queueState;

  // Preset mode
  const [preset, setPreset] = useState<VideoRemakePreset>('balanced');

  // Custom granular settings
  const [microZoomPercent, setMicroZoomPercent] = useState<number>(3);
  const [mirrorFlip, setMirrorFlip] = useState<boolean>(false);
  const [microNoise, setMicroNoise] = useState<boolean>(true);
  const [microNoiseStrength, setMicroNoiseStrength] = useState<number>(2);
  const [colorShift, setColorShift] = useState<boolean>(true);
  const [vignette, setVignette] = useState<boolean>(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1.03);
  const [pitchShift, setPitchShift] = useState<boolean>(true);
  const [pitchSemitones, setPitchSemitones] = useState<number>(0.3);
  const [randomGop, setRandomGop] = useState<boolean>(true);
  const [clearMetadata, setClearMetadata] = useState<boolean>(true);
  const [outputDir, setOutputDir] = useState<string>('');

  const addFilesToQueue = (filePaths: string[]) => {
    queue.add(filePaths.map((filePath) => ({ filePath })));
  };

  const handleSelectVideo = async () => {
    const selected = await window.ipc.invoke('toolbox:selectFile', {
      type: 'video',
      multiSelections: true,
    });
    if (Array.isArray(selected) && selected.length > 0) {
      addFilesToQueue(selected);
    }
  };

  const handleSelectOutputDir = async () => {
    const dir = await window.ipc.invoke('toolbox:selectFolder');
    if (dir) {
      setOutputDir(dir);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    addFilesToQueue(droppedToolboxPaths(e));
  };

  const buildConfig = (filePath: string): VideoRemakeConfig => {
    const baseConfig: VideoRemakeConfig = {
      videoPath: filePath,
      preset,
      outputDir: outputDir || undefined,
    };

    if (preset === 'custom') {
      return {
        ...baseConfig,
        microZoomPercent,
        mirrorFlip,
        microNoise,
        microNoiseStrength,
        colorShift,
        vignette,
        speedMultiplier,
        pitchShift,
        pitchSemitones,
        randomGop,
        clearMetadata,
      };
    }

    return baseConfig;
  };

  const handleStartRemake = (retryId?: string) =>
    queue.run(
      {
        failureMessage: t('queue.failed'),
        cancel: (jobId) =>
          window.ipc.invoke('toolbox:cancelRemakeVideo', jobId),
        execute: ({ filePath }, jobId) =>
          window.ipc.invoke('toolbox:remakeVideo', {
            jobId,
            config: buildConfig(filePath),
          }),
      },
      retryId,
    );

  const doneItems = files.filter(
    (f) => f.status === 'done' && f.result?.success,
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex min-h-0 flex-1 overflow-hidden p-4 gap-4">
        {/* Cột trái: Tải tệp & Tùy chỉnh chế độ */}
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-background p-4 gap-4">
          {/* Vùng kéo thả tệp */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={handleSelectVideo}
            className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-6 transition-colors hover:bg-muted/40 cursor-pointer shrink-0"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UploadCloud className="h-5 w-5" />
            </div>
            <p className="mt-2 text-sm font-medium text-foreground">
              {t('videoRemaker.dropVideosHere', 'Thả video cần làm mới vào đây')}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('videoRemaker.dropVideosDesc', 'Hỗ trợ MP4, MOV, MKV, AVI... Xử lý hàng loạt cùng lúc')}
            </p>
          </div>

          {/* Chọn cấp độ làm mới (Presets) */}
          <div className="rounded-lg border border-border/80 bg-card p-4 space-y-3.5">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" />
              <Label className="text-sm font-semibold text-foreground">
                {t('videoRemaker.levelTitle', 'Cấp độ làm mới & Khử trùng lặp (Anti-Duplicate)')}
              </Label>
            </div>

            <RadioGroup
              value={preset}
              onValueChange={(v) => setPreset(v as VideoRemakePreset)}
              className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
            >
              {/* Preset 1: An toàn (Safe) */}
              <label
                htmlFor="preset-safe"
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  preset === 'safe'
                    ? 'border-emerald-500/80 bg-emerald-500/5 ring-1 ring-emerald-500/30'
                    : 'border-border/60 hover:bg-muted/40'
                }`}
              >
                <RadioGroupItem value="safe" id="preset-safe" className="mt-0.5 text-emerald-500" />
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                    <span>{t('videoRemaker.presetSafe', 'Mức 1 - An toàn (Tự nhiên 100%)')}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    {t(
                      'videoRemaker.presetSafeDesc',
                      'Zoom vi mô 2%, phủ hạt mịn, tăng tốc 1.02x, xáo trộn GOP và xóa sạch metadata. Mắt thường hoàn toàn không nhận ra thay đổi.',
                    )}
                  </p>
                </div>
              </label>

              {/* Preset 2: Cân bằng (Balanced) */}
              <label
                htmlFor="preset-balanced"
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  preset === 'balanced'
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    : 'border-border/60 hover:bg-muted/40'
                }`}
              >
                <RadioGroupItem value="balanced" id="preset-balanced" className="mt-0.5 text-primary" />
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <span>{t('videoRemaker.presetBalanced', 'Mức 2 - Cân bằng (Khuyến nghị)')}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    {t(
                      'videoRemaker.presetBalancedDesc',
                      'Zoom 3%, phủ hạt vi mô, tăng tốc 1.03x, vi chỉnh màu, dịch nhẹ âm cao 0.3st, xáo trộn GOP. Tối ưu cho TikTok, Reels, Shorts.',
                    )}
                  </p>
                </div>
              </label>

              {/* Preset 3: Chuyên sâu (Aggressive) */}
              <label
                htmlFor="preset-aggressive"
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  preset === 'aggressive'
                    ? 'border-amber-500/80 bg-amber-500/5 ring-1 ring-amber-500/30'
                    : 'border-border/60 hover:bg-muted/40'
                }`}
              >
                <RadioGroupItem value="aggressive" id="preset-aggressive" className="mt-0.5 text-amber-500" />
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Zap className="h-3.5 w-3.5 text-amber-500" />
                    <span>{t('videoRemaker.presetAggressive', 'Mức 3 - Chuyên sâu (Độ lách cao)')}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    {t(
                      'videoRemaker.presetAggressiveDesc',
                      'Zoom 4%, lật gương, tăng tốc 1.05x, đổi màu & viền tối, dịch cao độ 0.5st, xáo GOP. Dành cho video có bản quyền gắt.',
                    )}
                  </p>
                </div>
              </label>

              {/* Preset 4: Tùy chỉnh (Custom) */}
              <label
                htmlFor="preset-custom"
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  preset === 'custom'
                    ? 'border-purple-500/80 bg-purple-500/5 ring-1 ring-purple-500/30'
                    : 'border-border/60 hover:bg-muted/40'
                }`}
              >
                <RadioGroupItem value="custom" id="preset-custom" className="mt-0.5 text-purple-500" />
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Sliders className="h-3.5 w-3.5 text-purple-500" />
                    <span>{t('videoRemaker.presetCustom', 'Mức 4 - Tùy chỉnh chi tiết')}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    {t(
                      'videoRemaker.presetCustomDesc',
                      'Tự do bật/tắt từng hiệu ứng và kéo chỉnh thông số theo công thức riêng của bạn.',
                    )}
                  </p>
                </div>
              </label>
            </RadioGroup>
          </div>

          {/* Bảng tinh chỉnh chi tiết (Khi chọn chế độ Tùy chỉnh) */}
          {preset === 'custom' && (
            <div className="rounded-lg border border-border/80 bg-muted/30 p-4 space-y-4">
              <div className="text-xs font-semibold text-foreground border-b border-border/50 pb-2 flex items-center justify-between">
                <span>{t('videoRemaker.customControlsTitle', 'Bảng thông số chi tiết')}</span>
                <span className="text-[11px] text-purple-500 font-normal">
                  {t('videoRemaker.customActive', 'Đang áp dụng công thức riêng')}
                </span>
              </div>

              {/* 1. Không gian & Khung hình */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <Label>{t('videoRemaker.microZoom', 'Thu phóng vi mô (Micro-Zoom)')}</Label>
                  <span className="font-mono text-muted-foreground">{microZoomPercent}%</span>
                </div>
                <Slider
                  value={[microZoomPercent]}
                  min={0}
                  max={8}
                  step={0.5}
                  onValueChange={([v]) => setMicroZoomPercent(v)}
                />

                <div className="flex items-center justify-between pt-1">
                  <div>
                    <Label htmlFor="remake-mirror" className="text-xs cursor-pointer">
                      {t('videoRemaker.mirrorFlip', 'Lật gương (Mirror Flip)')}
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      {t('videoRemaker.mirrorFlipDesc', 'Đảo chiều khung hình trái sang phải')}
                    </p>
                  </div>
                  <Switch
                    id="remake-mirror"
                    checked={mirrorFlip}
                    onCheckedChange={setMirrorFlip}
                  />
                </div>
              </div>

              {/* 2. Màu sắc & Hạt vi mô */}
              <div className="space-y-3 pt-2 border-t border-border/40">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="remake-noise" className="text-xs cursor-pointer">
                      {t('videoRemaker.microNoise', 'Lớp hạt nhiễu động vi mô (Dynamic Noise)')}
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      {t('videoRemaker.microNoiseDesc', 'Phủ hạt mịn biến thiên theo thời gian làm sai lệch mã băm pHash')}
                    </p>
                  </div>
                  <Switch
                    id="remake-noise"
                    checked={microNoise}
                    onCheckedChange={setMicroNoise}
                  />
                </div>

                {microNoise && (
                  <div className="space-y-1 pl-3 border-l-2 border-primary/40">
                    <div className="flex items-center justify-between text-xs">
                      <Label className="text-[11px]">{t('videoRemaker.noiseStrength', 'Độ mịn hạt')}</Label>
                      <span className="font-mono text-xs text-muted-foreground">Mức {microNoiseStrength}</span>
                    </div>
                    <Slider
                      value={[microNoiseStrength]}
                      min={1}
                      max={5}
                      step={1}
                      onValueChange={([v]) => setMicroNoiseStrength(v)}
                    />
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="remake-color" className="text-xs cursor-pointer">
                      {t('videoRemaker.colorShift', 'Vi chỉnh màu sắc & biểu đồ Histogram')}
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      {t('videoRemaker.colorShiftDesc', 'Độ tương phản +2%, Gamma +0.01 làm lệch biểu đồ màu AI')}
                    </p>
                  </div>
                  <Switch
                    id="remake-color"
                    checked={colorShift}
                    onCheckedChange={setColorShift}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="remake-vignette" className="text-xs cursor-pointer">
                      {t('videoRemaker.vignette', 'Hiệu ứng tối viền điện ảnh (Vignette)')}
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      {t('videoRemaker.vignetteDesc', 'Bo tối 4 góc video nhẹ nhàng')}
                    </p>
                  </div>
                  <Switch
                    id="remake-vignette"
                    checked={vignette}
                    onCheckedChange={setVignette}
                  />
                </div>
              </div>

              {/* 3. Thời gian & Âm thanh */}
              <div className="space-y-3 pt-2 border-t border-border/40">
                <div className="flex items-center justify-between text-xs">
                  <div>
                    <Label>{t('videoRemaker.speed', 'Tốc độ vi mô (Timeline Speed)')}</Label>
                    <p className="text-[11px] text-muted-foreground">
                      {t('videoRemaker.speedDesc', 'Lệch trục thời gian phân cảnh so với bản gốc')}
                    </p>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{speedMultiplier.toFixed(2)}x</span>
                </div>
                <Slider
                  value={[speedMultiplier]}
                  min={0.96}
                  max={1.06}
                  step={0.01}
                  onValueChange={([v]) => setSpeedMultiplier(Number(v.toFixed(2)))}
                />

                <div className="flex items-center justify-between pt-1">
                  <div>
                    <Label htmlFor="remake-pitch" className="text-xs cursor-pointer">
                      {t('videoRemaker.pitchShift', 'Dịch cao độ âm thanh (Pitch Shift)')}
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      {t('videoRemaker.pitchShiftDesc', 'Thay đổi phổ tần số spectrogram để lách Audio Content ID')}
                    </p>
                  </div>
                  <Switch
                    id="remake-pitch"
                    checked={pitchShift}
                    onCheckedChange={setPitchShift}
                  />
                </div>

                {pitchShift && (
                  <div className="space-y-1 pl-3 border-l-2 border-primary/40">
                    <div className="flex items-center justify-between text-xs">
                      <Label className="text-[11px]">{t('videoRemaker.pitchAmount', 'Độ lệch tông')}</Label>
                      <span className="font-mono text-xs text-muted-foreground">
                        {pitchSemitones > 0 ? `+${pitchSemitones}` : pitchSemitones} semitones
                      </span>
                    </div>
                    <Slider
                      value={[pitchSemitones]}
                      min={-1}
                      max={1}
                      step={0.1}
                      onValueChange={([v]) => setPitchSemitones(Number(v.toFixed(1)))}
                    />
                  </div>
                )}
              </div>

              {/* 4. Cấu trúc & Nén */}
              <div className="space-y-3 pt-2 border-t border-border/40">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="remake-gop" className="text-xs cursor-pointer">
                      {t('videoRemaker.randomGop', 'Xáo trộn GOP / Khung hình khóa (Keyframe)')}
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      {t('videoRemaker.randomGopDesc', 'Đổi chu kỳ I-frame làm lệch thuật toán trích xuất nhanh')}
                    </p>
                  </div>
                  <Switch
                    id="remake-gop"
                    checked={randomGop}
                    onCheckedChange={setRandomGop}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="remake-meta" className="text-xs cursor-pointer">
                      {t('videoRemaker.clearMetadata', 'Xóa toàn bộ Metadata & Exif')}
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      {t('videoRemaker.clearMetadataDesc', 'Làm sạch thông tin thiết bị, tag phần mềm cũ')}
                    </p>
                  </div>
                  <Switch
                    id="remake-meta"
                    checked={clearMetadata}
                    onCheckedChange={setClearMetadata}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Thư mục xuất ra (Tùy chọn) */}
          <div className="rounded-lg border border-border/80 bg-card p-3 space-y-2">
            <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>{t('videoRemaker.outputDirTitle', 'Thư mục xuất file')}</span>
              <span className="text-[11px] font-normal text-muted-foreground">
                {outputDir ? t('common.custom', 'Tùy chọn') : t('videoRemaker.sameAsInput', 'Cùng thư mục file gốc')}
              </span>
            </Label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                placeholder={t('videoRemaker.sameAsInput', 'Cùng thư mục file gốc')}
                value={outputDir}
                className="flex-1 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs text-foreground font-mono truncate"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSelectOutputDir}
                className="h-8 gap-1.5 text-xs"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                <span>{t('common.browse', 'Chọn')}</span>
              </Button>
            </div>
          </div>

          {/* Nút thực hiện */}
          <Button
            size="lg"
            disabled={files.length === 0 || isProcessing}
            onClick={() => handleStartRemake()}
            className="w-full gap-2 text-sm font-semibold h-11 shadow-sm"
          >
            <Wand2 className="h-4 w-4" />
            <span>
              {isProcessing
                ? t('videoRemaker.processing', 'Đang xử lý làm mới video...')
                : files.length > 0
                  ? t('videoRemaker.startProcessCount', { count: files.length, defaultValue: `Bắt đầu làm mới ${files.length} video` })
                  : t('videoRemaker.startProcess', 'Bắt đầu làm mới video')}
            </span>
          </Button>
        </div>

        {/* Cột phải: Danh sách hàng đợi & Kết quả */}
        <div className="flex w-96 flex-col overflow-hidden rounded-lg border border-border bg-card shrink-0 p-3">
          <ToolboxQueueList
            {...queueState}
            onRetry={handleStartRemake}
            onRemove={(id) => queue.remove(id)}
            onCancel={() => void queue.cancel()}
            onClear={() => queue.clear()}
          />
        </div>
      </div>

      {/* Thanh tổng kết sau khi hoàn thành */}
      {doneItems.length > 0 && !isProcessing && (
        <ToolboxFinishBar
          outputType="video"
          outputPaths={
            doneItems
              .map((d) => d.result?.outputPath)
              .filter(Boolean) as string[]
          }
          onReset={() => queue.clear()}
        />
      )}
    </div>
  );
}
