import React from 'react';
import { useTranslation } from 'next-i18next';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { HelpHint } from '@/components/HelpHint';
import { Image, Upload, X, Move } from 'lucide-react';
import type { WatermarkConfig } from '../../../types/subtitleMerge';

interface Props {
  watermark?: WatermarkConfig;
  onUpdateWatermark?: (updates: Partial<WatermarkConfig>) => void;
  disabled?: boolean;
}

export default function WatermarkSettings({
  watermark,
  onUpdateWatermark,
  disabled = false,
}: Props) {
  const { t } = useTranslation('subtitleMerge');

  const isEnabled = watermark?.enabled ?? false;
  const currentPath = watermark?.imagePath;
  const currentPreset = watermark?.positionPreset ?? 'top-right';
  const scalePercent = watermark?.scalePercent ?? 15;
  const opacity = watermark?.opacity ?? 90;

  const handleSelectCustomImage = async () => {
    if (disabled || !onUpdateWatermark) return;
    try {
      const result = await window.ipc.invoke('selectFile', { type: 'image' });
      if (result && !result.canceled && result.filePath) {
        onUpdateWatermark({
          enabled: true,
          imagePath: result.filePath,
        });
      }
    } catch (err) {
      console.error('Failed to select watermark image:', err);
    }
  };

  const handleRemoveImage = () => {
    if (disabled || !onUpdateWatermark) return;
    onUpdateWatermark({ imagePath: undefined });
  };

  const fileName = currentPath ? currentPath.split(/[/\\]/).pop() : '';
  const previewUrl = currentPath
    ? currentPath.startsWith('http') || currentPath.startsWith('data:')
      ? currentPath
      : `media://${encodeURIComponent(currentPath)}`
    : null;

  return (
    <div className="space-y-3 pt-1">
      {/* 头部开关行 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Image className="h-4 w-4 text-primary" />
          <Label htmlFor="watermark-switch" className="text-sm font-medium cursor-pointer">
            {t('watermarkTitle', 'Chèn Logo / Watermark')}
          </Label>
          <HelpHint text={t('watermarkHint', 'Chèn logo kênh hoặc hình mờ lên video. Bạn có thể kéo thả trực tiếp trên màn hình xem trước để chỉnh vị trí chính xác.')} />
        </div>
        <Switch
          id="watermark-switch"
          checked={isEnabled}
          onCheckedChange={(checked) => onUpdateWatermark?.({ enabled: checked })}
          disabled={disabled}
        />
      </div>

      {isEnabled && (
        <div className="p-3 bg-muted/40 rounded-lg space-y-3.5 border border-border/60">
          {/* Chọn ảnh / file logo */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-foreground">
              {t('watermarkImage', 'Hình ảnh Logo')}
            </div>

            {currentPath && previewUrl ? (
              <div className="flex items-center justify-between p-2 rounded-md bg-background/80 border border-border/60 gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded bg-black/40 border border-border/60 flex items-center justify-center p-0.5 shrink-0 overflow-hidden">
                    <img
                      src={previewUrl}
                      alt="Logo preview"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate text-foreground" title={currentPath}>
                      {fileName}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate" title={currentPath}>
                      {currentPath}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={handleSelectCustomImage}
                    disabled={disabled}
                  >
                    {t('change', 'Đổi')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={handleRemoveImage}
                    disabled={disabled}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSelectCustomImage}
                disabled={disabled}
                className="w-full text-xs gap-1.5 h-9 justify-center border-dashed"
              >
                <Upload className="h-3.5 w-3.5" />
                {t('selectCustomImage', 'Chọn tệp hình ảnh...')}
              </Button>
            )}
          </div>

          {/* Vị trí */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">{t('watermarkPosition', 'Vị trí hiển thị')}</span>
              {currentPreset === 'custom' && (
                <span className="inline-flex items-center gap-1 text-[11px] text-amber-500 font-medium">
                  <Move className="h-3 w-3" />
                  {t('dragOnPreviewHint', 'Đã kéo tùy chỉnh')}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5 bg-background/60 p-1.5 rounded border border-border/40">
              <button
                type="button"
                onClick={() => onUpdateWatermark?.({ positionPreset: 'top-left' })}
                disabled={disabled}
                className={`px-2 py-1.5 rounded text-xs font-medium transition-colors flex items-center justify-center ${
                  currentPreset === 'top-left'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'hover:bg-muted text-muted-foreground'
                }`}
              >
                {t('posTopLeft', 'Góc trên - Trái')}
              </button>
              <button
                type="button"
                onClick={() => onUpdateWatermark?.({ positionPreset: 'top-right' })}
                disabled={disabled}
                className={`px-2 py-1.5 rounded text-xs font-medium transition-colors flex items-center justify-center ${
                  currentPreset === 'top-right'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'hover:bg-muted text-muted-foreground'
                }`}
              >
                {t('posTopRight', 'Góc trên - Phải')}
              </button>
              <button
                type="button"
                onClick={() => onUpdateWatermark?.({ positionPreset: 'bottom-left' })}
                disabled={disabled}
                className={`px-2 py-1.5 rounded text-xs font-medium transition-colors flex items-center justify-center ${
                  currentPreset === 'bottom-left'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'hover:bg-muted text-muted-foreground'
                }`}
              >
                {t('posBottomLeft', 'Góc dưới - Trái')}
              </button>
              <button
                type="button"
                onClick={() => onUpdateWatermark?.({ positionPreset: 'bottom-right' })}
                disabled={disabled}
                className={`px-2 py-1.5 rounded text-xs font-medium transition-colors flex items-center justify-center ${
                  currentPreset === 'bottom-right'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'hover:bg-muted text-muted-foreground'
                }`}
              >
                {t('posBottomRight', 'Góc dưới - Phải')}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground leading-normal">
              {t('dragDirectlyHint', 'Mẹo: Bạn có thể click & kéo trực tiếp logo trên màn hình xem trước để đặt vào bất kỳ vị trí mong muốn.')}
            </p>
          </div>

          {/* Kích thước */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">{t('watermarkScale', 'Kích thước Logo')}</Label>
              <span className="text-xs text-muted-foreground">{scalePercent}%</span>
            </div>
            <Slider
              value={[scalePercent]}
              min={6}
              max={40}
              step={1}
              onValueChange={([v]) => onUpdateWatermark?.({ scalePercent: v })}
              disabled={disabled}
            />
          </div>

          {/* Độ mờ đục */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">{t('watermarkOpacity', 'Độ mờ đục (Opacity)')}</Label>
              <span className="text-xs text-muted-foreground">{opacity}%</span>
            </div>
            <Slider
              value={[opacity]}
              min={10}
              max={100}
              step={5}
              onValueChange={([v]) => onUpdateWatermark?.({ opacity: v })}
              disabled={disabled}
            />
          </div>

          {/* Làm mờ nền che logo cũ */}
          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <div className="space-y-0.5 pr-2">
              <Label htmlFor="watermark-blur-bg" className="text-xs font-medium cursor-pointer">
                {t('watermarkBlurBackground', 'Làm mờ nền che logo cũ')}
              </Label>
              <div className="text-[11px] text-muted-foreground leading-tight">
                {t('watermarkBlurBackgroundDesc', 'Tự động tạo khung mờ đi liền theo logo để che logo gốc của video.')}
              </div>
            </div>
            <Switch
              id="watermark-blur-bg"
              checked={watermark?.blurBackground ?? false}
              onCheckedChange={(checked) => onUpdateWatermark?.({ blurBackground: checked })}
              disabled={disabled}
            />
          </div>
        </div>
      )}
    </div>
  );
}
