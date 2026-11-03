import React, { useState, useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Sparkles, ArrowRight, X, Clock, Layers, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Subtitle } from '../../hooks/useSubtitles';
import {
  computeAutoMerge,
  AutoMergeOptions,
  secondsToTime,
} from '../../lib/autoMergeShortCues';

interface AutoMergeShortDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subtitles: Subtitle[];
  onApplyMerge: (mergedSubtitles: Subtitle[]) => void;
}

export default function AutoMergeShortDialog({
  open,
  onOpenChange,
  subtitles,
  onApplyMerge,
}: AutoMergeShortDialogProps) {
  const { t } = useTranslation('home');

  // Filter options with optimal defaults
  const [maxShortDuration, setMaxShortDuration] = useState<number>(1.2);
  const [maxSilenceGap, setMaxSilenceGap] = useState<number>(0.5);
  const [maxMergedDuration, setMaxMergedDuration] = useState<number>(6.0);
  const [sameSpeakerOnly, setSameSpeakerOnly] = useState<boolean>(true);

  // Compute live merge preview
  const options = useMemo<AutoMergeOptions>(
    () => ({
      maxShortDuration,
      maxSilenceGap,
      maxMergedDuration,
      sameSpeakerOnly,
    }),
    [maxShortDuration, maxSilenceGap, maxMergedDuration, sameSpeakerOnly],
  );

  const result = useMemo(
    () => computeAutoMerge(subtitles, options),
    [subtitles, options],
  );

  const handleConfirm = () => {
    if (result.mergedCount === 0) {
      toast.info(
        t('noShortCuesFound') ||
          'Không tìm thấy câu ngắn nào thỏa mãn điều kiện.',
      );
      return;
    }

    onApplyMerge(result.mergedSubtitles);
    toast.success(
      t('autoMergeSuccess') ||
        `Đã gộp thành công ${result.mergedCount} câu ngắn!`,
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="shrink-0 space-y-1.5 pb-2 border-b">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
              <Sparkles className="h-5 w-5" />
            </div>
            <DialogTitle className="text-lg font-bold">
              {t('autoMergeShortTitle') || 'Tự động gộp câu ngắn (Dubbing / Subtitle)'}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            {t('autoMergeShortDesc') ||
              'Sáp nhập các mảnh câu thoại ngắn và liền kề để lời thoại mượt mà, AI dịch chuẩn nghĩa và âm thanh lồng tiếng không bị vụn vặt.'}
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-5 pr-1 text-sm">
          {/* Controls section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-muted/40 border border-border/50">
            {/* Max short duration */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <Label className="flex items-center gap-1.5 text-xs font-medium">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  {t('maxShortDuration') || 'Thời lượng câu ngắn tối đa'}
                </Label>
                <span className="font-semibold text-primary tabular-nums">
                  {maxShortDuration.toFixed(1)}s
                </span>
              </div>
              <Slider
                min={0.5}
                max={2.5}
                step={0.1}
                value={[maxShortDuration]}
                onValueChange={([val]) => setMaxShortDuration(val)}
                className="w-full cursor-pointer"
              />
              <p className="text-[11px] text-muted-foreground leading-tight">
                {t('maxShortDurationHint') || 'Các câu ≤ mốc này sẽ được xem xét để gộp.'}
              </p>
            </div>

            {/* Max silence gap */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <Label className="flex items-center gap-1.5 text-xs font-medium">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  {t('maxSilenceGap') || 'Khoảng lặng tối đa (Gap)'}
                </Label>
                <span className="font-semibold text-primary tabular-nums">
                  {maxSilenceGap.toFixed(2)}s
                </span>
              </div>
              <Slider
                min={0.1}
                max={1.5}
                step={0.05}
                value={[maxSilenceGap]}
                onValueChange={([val]) => setMaxSilenceGap(val)}
                className="w-full cursor-pointer"
              />
              <p className="text-[11px] text-muted-foreground leading-tight">
                {t('maxSilenceGapHint') || 'Chỉ gộp nếu khoảng nghỉ giữa 2 câu ≤ mốc này.'}
              </p>
            </div>

            {/* Max merged duration */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <Label className="flex items-center gap-1.5 text-xs font-medium">
                  <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                  {t('maxMergedDuration') || 'Thời lượng tối đa sau gộp'}
                </Label>
                <span className="font-semibold text-primary tabular-nums">
                  {maxMergedDuration.toFixed(1)}s
                </span>
              </div>
              <Slider
                min={3.0}
                max={10.0}
                step={0.5}
                value={[maxMergedDuration]}
                onValueChange={([val]) => setMaxMergedDuration(val)}
                className="w-full cursor-pointer"
              />
              <p className="text-[11px] text-muted-foreground leading-tight">
                {t('maxMergedDurationHint') || 'Ngăn câu sau khi gộp bị quá dài.'}
              </p>
            </div>

            {/* Same speaker only */}
            <div className="flex flex-col justify-center space-y-1.5 pt-1">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sameSpeakerOnly"
                  checked={sameSpeakerOnly}
                  onCheckedChange={(checked) => setSameSpeakerOnly(!!checked)}
                />
                <Label
                  htmlFor="sameSpeakerOnly"
                  className="text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
                  {t('sameSpeakerOnly') || 'Chỉ gộp cùng người nói (Speaker)'}
                </Label>
              </div>
              <p className="text-[11px] text-muted-foreground pl-6 leading-tight">
                {t('sameSpeakerOnlyHint') || 'Không gộp nếu 2 câu thuộc 2 nhân vật khác nhau.'}
              </p>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-background border text-xs">
            <span className="text-muted-foreground">
              {t('mergeImpactSummary') || 'Tổng quan tác động:'}
            </span>
            <div className="flex items-center gap-2">
              {result.mergedCount > 0 ? (
                <>
                  <Badge variant="secondary" className="font-mono text-xs">
                    {subtitles.length} → {result.mergedSubtitles.length} câu
                  </Badge>
                  <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-xs">
                    - {result.mergedCount} câu ngắn ({result.mergeGroupsCount} vị trí gộp)
                  </Badge>
                </>
              ) : (
                <Badge variant="outline" className="text-muted-foreground text-xs">
                  {t('noCuesMatched') || '0 câu cần gộp'}
                </Badge>
              )}
            </div>
          </div>

          {/* Preview list */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('previewMergedSamples') || 'Xem trước các đoạn sẽ gộp (Preview):'}
            </Label>
            {result.previewPairs.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground border border-dashed rounded-lg">
                {t('noMergePreview') ||
                  'Không có câu nào thoả mãn tiêu chí gộp với thiết lập hiện tại.'}
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                {result.previewPairs.map((pair, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg border bg-card/60 hover:bg-muted/40 transition-colors text-xs space-y-2"
                  >
                    <div className="flex items-start gap-2">
                      {/* Before boxes */}
                      <div className="flex-1 space-y-1">
                        <div className="text-[10px] text-muted-foreground font-semibold">
                          TRƯỚC KHI GỘP ({pair.before.length} câu):
                        </div>
                        <div className="space-y-1">
                          {pair.before.map((b) => (
                            <div
                              key={b.id}
                              className="px-2 py-1 rounded bg-muted/60 text-foreground flex items-center justify-between text-[11px]"
                            >
                              <span className="truncate pr-2">
                                #{b.id}: {b.sourceContent || b.content?.join(' ')}
                              </span>
                              <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                                {(
                                  (b.endTimeInSeconds || 0) -
                                  (b.startTimeInSeconds || 0)
                                ).toFixed(1)}
                                s
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="pt-5 text-muted-foreground shrink-0">
                        <ArrowRight className="h-4 w-4" />
                      </div>

                      {/* After box */}
                      <div className="flex-1 space-y-1">
                        <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                          SAU KHI GỘP (1 câu liền mạch):
                        </div>
                        <div className="px-2 py-1.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-950 dark:text-emerald-200 text-[11px]">
                          <div className="font-medium">
                            {pair.after.sourceContent}
                          </div>
                          <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-1 flex justify-between tabular-nums">
                            <span>{pair.after.startEndTime}</span>
                            <span>
                              {(
                                (pair.after.endTimeInSeconds || 0) -
                                (pair.after.startTimeInSeconds || 0)
                              ).toFixed(1)}
                              s
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="shrink-0 pt-3 border-t gap-2 sm:gap-0">
          <Button
            variant="outline"
            className="gap-1.5 text-xs h-9"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
            {t('cancel') || 'Hủy bỏ'}
          </Button>
          <Button
            className="gap-1.5 text-xs h-9 bg-primary hover:bg-primary/90"
            disabled={result.mergedCount === 0}
            onClick={handleConfirm}
          >
            <Sparkles className="h-4 w-4 text-amber-300" />
            {t('applyAutoMerge') ||
              `Áp dụng gộp (${result.mergedCount} câu)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
