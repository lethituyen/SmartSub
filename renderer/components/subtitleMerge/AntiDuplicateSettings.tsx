import React from 'react';
import { useTranslation } from 'next-i18next';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { HelpHint } from '@/components/HelpHint';
import {
  Sparkles,
  Shield,
  Layers,
  ZoomIn,
  FlipHorizontal,
  Activity,
  Palette,
  Eye,
  Gauge,
  Music2,
  FileCheck2,
} from 'lucide-react';
import type {
  AntiDuplicateConfig,
  AntiDuplicatePreset,
} from '../../../types/subtitleMerge';

interface Props {
  antiDuplicate?: AntiDuplicateConfig;
  onUpdateAntiDuplicate?: (updates: Partial<AntiDuplicateConfig>) => void;
  disabled?: boolean;
}

export default function AntiDuplicateSettings({
  antiDuplicate,
  onUpdateAntiDuplicate,
  disabled = false,
}: Props) {
  const { t } = useTranslation('subtitleMerge');

  const isEnabled = antiDuplicate?.enabled ?? false;
  const currentPreset: AntiDuplicatePreset = antiDuplicate?.preset ?? 'balanced';

  const update = (updates: Partial<AntiDuplicateConfig>) => {
    if (disabled || !onUpdateAntiDuplicate) return;
    onUpdateAntiDuplicate(updates);
  };

  const setPreset = (preset: AntiDuplicatePreset) => {
    if (disabled || !onUpdateAntiDuplicate) return;
    if (preset === 'safe') {
      onUpdateAntiDuplicate({
        enabled: true,
        preset: 'safe',
        microZoomPercent: 2,
        mirrorFlip: false,
        microNoise: true,
        microNoiseStrength: 1,
        colorShift: false,
        vignette: false,
        speedMultiplier: 1.02,
        pitchShift: false,
        pitchSemitones: 0.2,
        randomGop: true,
        clearMetadata: true,
      });
    } else if (preset === 'aggressive') {
      onUpdateAntiDuplicate({
        enabled: true,
        preset: 'aggressive',
        microZoomPercent: 4,
        mirrorFlip: true,
        microNoise: true,
        microNoiseStrength: 3,
        colorShift: true,
        vignette: true,
        speedMultiplier: 1.05,
        pitchShift: true,
        pitchSemitones: 0.5,
        randomGop: true,
        clearMetadata: true,
      });
    } else if (preset === 'custom') {
      onUpdateAntiDuplicate({
        enabled: true,
        preset: 'custom',
        microZoomPercent: antiDuplicate?.microZoomPercent ?? 3,
        mirrorFlip: antiDuplicate?.mirrorFlip ?? false,
        microNoise: antiDuplicate?.microNoise ?? true,
        microNoiseStrength: antiDuplicate?.microNoiseStrength ?? 2,
        colorShift: antiDuplicate?.colorShift ?? true,
        vignette: antiDuplicate?.vignette ?? false,
        speedMultiplier: antiDuplicate?.speedMultiplier ?? 1.03,
        pitchShift: antiDuplicate?.pitchShift ?? true,
        pitchSemitones: antiDuplicate?.pitchSemitones ?? 0.3,
        randomGop: antiDuplicate?.randomGop ?? true,
        clearMetadata: antiDuplicate?.clearMetadata ?? true,
      });
    } else {
      // balanced
      onUpdateAntiDuplicate({
        enabled: true,
        preset: 'balanced',
        microZoomPercent: 3,
        mirrorFlip: false,
        microNoise: true,
        microNoiseStrength: 2,
        colorShift: true,
        vignette: false,
        speedMultiplier: 1.03,
        pitchShift: true,
        pitchSemitones: 0.3,
        randomGop: true,
        clearMetadata: true,
      });
    }
  };

  return (
    <div className="space-y-3 pt-1">
      {/* Tiêu đề & Công tắc bật/tắt */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-primary" />
          <Label htmlFor="antidup-switch" className="text-sm font-medium cursor-pointer">
            {t('antiDupTitle', 'Làm mới & Khử trùng lặp (Anti-Duplicate)')}
          </Label>
          <HelpHint
            text={t(
              'antiDupHint',
              'Tự động áp dụng thuật toán lách quét AI bản quyền (Micro-zoom, Phủ hạt động dynamic noise, Chỉnh màu histogram, Xáo trộn GOP keyframe, Spectrogram pitch-shift, Tẩy metadata) ngay trong lúc xuất video, không cần encode 2 lần.',
            )}
          />
        </div>
        <Switch
          id="antidup-switch"
          checked={isEnabled}
          onCheckedChange={(checked) => {
            if (checked && !antiDuplicate?.preset) {
              setPreset('balanced');
            } else {
              update({ enabled: checked });
            }
          }}
          disabled={disabled}
        />
      </div>

      {isEnabled && (
        <div className="p-3.5 bg-muted/40 rounded-lg space-y-3.5 border border-border/60">
          {/* Cấp độ cấu hình 1-click */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-primary" />
              {t('antiDupPresetTitle', 'Cấp độ làm mới & Khử trùng lặp')}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {/* Level 1: Safe */}
              <button
                type="button"
                onClick={() => setPreset('safe')}
                disabled={disabled}
                className={`p-2.5 rounded-lg border text-left transition-all flex flex-col justify-between ${
                  currentPreset === 'safe'
                    ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary/30'
                    : 'border-border/70 hover:border-border hover:bg-background/80'
                }`}
              >
                <div>
                  <div className="font-semibold text-xs text-foreground flex items-center justify-between">
                    <span>{t('presetSafe', 'Mức 1 - An toàn')}</span>
                    {currentPreset === 'safe' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                    {t('presetSafeDesc', 'Tự nhiên 100%, zoom 2%, phủ hạt mịn, xáo GOP, xóa metadata.')}
                  </div>
                </div>
              </button>

              {/* Level 2: Balanced */}
              <button
                type="button"
                onClick={() => setPreset('balanced')}
                disabled={disabled}
                className={`p-2.5 rounded-lg border text-left transition-all flex flex-col justify-between ${
                  currentPreset === 'balanced'
                    ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary/30'
                    : 'border-border/70 hover:border-border hover:bg-background/80'
                }`}
              >
                <div>
                  <div className="font-semibold text-xs text-foreground flex items-center justify-between">
                    <span>{t('presetBalanced', 'Mức 2 - Cân bằng')}</span>
                    {currentPreset === 'balanced' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                    {t('presetBalancedDesc', 'Khuyến nghị: Chỉnh màu histogram, lệch âm +0.3st, tối ưu Shorts/TikTok.')}
                  </div>
                </div>
              </button>

              {/* Level 3: Aggressive */}
              <button
                type="button"
                onClick={() => setPreset('aggressive')}
                disabled={disabled}
                className={`p-2.5 rounded-lg border text-left transition-all flex flex-col justify-between ${
                  currentPreset === 'aggressive'
                    ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary/30'
                    : 'border-border/70 hover:border-border hover:bg-background/80'
                }`}
              >
                <div>
                  <div className="font-semibold text-xs text-foreground flex items-center justify-between">
                    <span>{t('presetAggressive', 'Mức 3 - Chuyên sâu')}</span>
                    {currentPreset === 'aggressive' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                    {t('presetAggressiveDesc', 'Lật gương, zoom 4%, 1.05x speed, tối góc vignette, lệch +0.5st.')}
                  </div>
                </div>
              </button>

              {/* Level 4: Custom */}
              <button
                type="button"
                onClick={() => setPreset('custom')}
                disabled={disabled}
                className={`p-2.5 rounded-lg border text-left transition-all flex flex-col justify-between ${
                  currentPreset === 'custom'
                    ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary/30'
                    : 'border-border/70 hover:border-border hover:bg-background/80'
                }`}
              >
                <div>
                  <div className="font-semibold text-xs text-foreground flex items-center justify-between">
                    <span>{t('presetCustom', 'Mức 4 - Tùy biến')}</span>
                    {currentPreset === 'custom' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                    {t('presetCustomDesc', 'Tự do bật/tắt từng hiệu ứng và tinh chỉnh thông số theo ý muốn.')}
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Bảng chi tiết tùy biến (hiện khi chọn Mức 4 - Custom) */}
          {currentPreset === 'custom' && (
            <div className="space-y-3 pt-2 border-t border-border/50">
              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-primary" />
                {t('customParameters', 'Thông số chi tiết thuật toán')}
              </div>

              {/* Thu phóng vi mô */}
              <div className="space-y-1.5 p-2 rounded bg-background/60 border border-border/40">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-medium">
                    <ZoomIn className="h-3.5 w-3.5 text-muted-foreground" />
                    {t('microZoom', 'Thu phóng vi mô (Micro-Zoom)')}
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {antiDuplicate?.microZoomPercent ?? 3}%
                  </span>
                </div>
                <Slider
                  min={0}
                  max={8}
                  step={0.5}
                  value={[antiDuplicate?.microZoomPercent ?? 3]}
                  onValueChange={([val]) => update({ microZoomPercent: val })}
                  disabled={disabled}
                />
              </div>

              {/* Lật gương & Chỉnh màu */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="flex items-center justify-between p-2 rounded bg-background/60 border border-border/40 text-xs">
                  <div className="flex items-center gap-1.5">
                    <FlipHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{t('mirrorFlip', 'Lật gương (Mirror Flip)')}</span>
                  </div>
                  <Switch
                    checked={antiDuplicate?.mirrorFlip ?? false}
                    onCheckedChange={(checked) => update({ mirrorFlip: checked })}
                    disabled={disabled}
                  />
                </div>

                <div className="flex items-center justify-between p-2 rounded bg-background/60 border border-border/40 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Palette className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{t('colorShift', 'Vi chỉnh màu & Histogram')}</span>
                  </div>
                  <Switch
                    checked={antiDuplicate?.colorShift ?? true}
                    onCheckedChange={(checked) => update({ colorShift: checked })}
                    disabled={disabled}
                  />
                </div>
              </div>

              {/* Phủ hạt vi mô & Tối góc */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="flex items-center justify-between p-2 rounded bg-background/60 border border-border/40 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{t('microNoise', 'Hạt nhiễu động (Dynamic Noise)')}</span>
                  </div>
                  <Switch
                    checked={antiDuplicate?.microNoise ?? true}
                    onCheckedChange={(checked) => update({ microNoise: checked })}
                    disabled={disabled}
                  />
                </div>

                <div className="flex items-center justify-between p-2 rounded bg-background/60 border border-border/40 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{t('vignette', 'Tối góc điện ảnh (Vignette)')}</span>
                  </div>
                  <Switch
                    checked={antiDuplicate?.vignette ?? false}
                    onCheckedChange={(checked) => update({ vignette: checked })}
                    disabled={disabled}
                  />
                </div>
              </div>

              {/* Tốc độ vi mô */}
              <div className="space-y-1.5 p-2 rounded bg-background/60 border border-border/40">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
                    {t('speedMultiplier', 'Tốc độ vi mô (Timeline Speed)')}
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {(antiDuplicate?.speedMultiplier ?? 1.03).toFixed(2)}x
                  </span>
                </div>
                <Slider
                  min={0.96}
                  max={1.06}
                  step={0.01}
                  value={[antiDuplicate?.speedMultiplier ?? 1.03]}
                  onValueChange={([val]) => update({ speedMultiplier: val })}
                  disabled={disabled}
                />
              </div>

              {/* Dịch cao độ âm thanh */}
              <div className="space-y-1.5 p-2 rounded bg-background/60 border border-border/40">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-medium">
                    <Music2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{t('pitchShift', 'Dịch cao độ âm thanh (Pitch Shift)')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-muted-foreground">
                      {antiDuplicate?.pitchSemitones !== undefined && antiDuplicate.pitchSemitones > 0 ? '+' : ''}
                      {(antiDuplicate?.pitchSemitones ?? 0.3).toFixed(1)} st
                    </span>
                    <Switch
                      checked={antiDuplicate?.pitchShift ?? true}
                      onCheckedChange={(checked) => update({ pitchShift: checked })}
                      disabled={disabled}
                    />
                  </div>
                </div>
                {antiDuplicate?.pitchShift && (
                  <Slider
                    min={-1.5}
                    max={1.5}
                    step={0.1}
                    value={[antiDuplicate?.pitchSemitones ?? 0.3]}
                    onValueChange={([val]) => update({ pitchSemitones: val })}
                    disabled={disabled}
                  />
                )}
              </div>

              {/* GOP & Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="flex items-center justify-between p-2 rounded bg-background/60 border border-border/40 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{t('randomGop', 'Xáo trộn GOP / Keyframe')}</span>
                  </div>
                  <Switch
                    checked={antiDuplicate?.randomGop ?? true}
                    onCheckedChange={(checked) => update({ randomGop: checked })}
                    disabled={disabled}
                  />
                </div>

                <div className="flex items-center justify-between p-2 rounded bg-background/60 border border-border/40 text-xs">
                  <div className="flex items-center gap-1.5">
                    <FileCheck2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{t('clearMetadata', 'Xóa Metadata & EXIF')}</span>
                  </div>
                  <Switch
                    checked={antiDuplicate?.clearMetadata ?? true}
                    onCheckedChange={(checked) => update({ clearMetadata: checked })}
                    disabled={disabled}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
