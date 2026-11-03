import React, { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { UploadCloud, Music, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import ToolboxFinishBar from '../common/ToolboxFinishBar';
import ToolboxQueueList from '../common/ToolboxQueueList';
import {
  droppedToolboxPaths,
  useToolboxQueue,
} from '../../../hooks/useToolboxQueue';
import type {
  AudioExtractFormat,
  AudioExtractResult,
} from '../../../../types/toolbox';

export default function AudioExtractorPanel() {
  const { t } = useTranslation('toolbox');

  const queueState = useToolboxQueue<{ filePath: string }, AudioExtractResult>(
    'toolbox:audioProgress',
  );
  const { queue, items: files, running: isProcessing } = queueState;
  const [format, setFormat] = useState<AudioExtractFormat>('mp3');
  const [bitrate, setBitrate] = useState<'128k' | '192k' | '256k' | '320k'>(
    '320k',
  );
  const [wavPreset, setWavPreset] = useState<'standard' | 'asr_16k_mono'>(
    'standard',
  );
  const [outputDir, setOutputDir] = useState<string>('');
  const addFiles = (paths: string[]) => {
    queue.add(paths.map((filePath) => ({ filePath })));
  };

  const handleSelectFiles = async () => {
    const selected = await window.ipc.invoke('toolbox:selectFile', {
      type: 'video',
      multiSelections: true,
    });
    if (Array.isArray(selected) && selected.length > 0) {
      addFiles(selected);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    addFiles(droppedToolboxPaths(e));
  };

  const handleStartExtract = (retryId?: string) =>
    queue.run(
      {
        failureMessage: t('queue.failed'),
        cancel: (jobId) =>
          window.ipc.invoke('toolbox:cancelExtractAudio', jobId),
        execute: ({ filePath }, jobId) =>
          window.ipc.invoke('toolbox:extractAudio', {
            jobId,
            config: {
              videoPath: filePath,
              format,
              bitrate,
              wavPreset: format === 'wav' ? wavPreset : undefined,
              outputPath: outputDir
                ? `${outputDir}/${filePath
                    .split(/[/\\]/)
                    .pop()!
                    .replace(/\.[^.]+$/, '')}.${format}`
                : undefined,
            },
          }),
      },
      retryId,
    );

  const handleSelectOutputDir = async () => {
    const picked = await window.ipc.invoke('toolbox:selectFolder');
    if (picked) setOutputDir(picked);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex min-h-0 flex-1 overflow-hidden p-4 gap-4">
        {/* 左侧：文件列表 */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-muted/20">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={handleSelectFiles}
            className="flex flex-col items-center justify-center border-b border-dashed border-border p-6 transition-colors hover:bg-muted/50 cursor-pointer"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UploadCloud className="h-6 w-6" />
            </div>
            <p className="mt-2.5 text-xs font-medium text-foreground">
              {t('audioExtractor.dropAudio')}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t('audioExtractor.dropAudioDesc')}
            </p>
          </div>

          <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2.5">
            <span className="text-xs font-medium text-foreground">
              {t('audioExtractor.pendingVideos', { count: files.length })}
            </span>
            {files.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => queue.clear()}
                disabled={isProcessing}
                className="h-7 text-xs text-muted-foreground hover:text-destructive"
              >
                {t('audioExtractor.clearList')}
              </Button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-border/60">
            {files.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center text-center text-xs text-muted-foreground">
                <Music className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <span>{t('audioExtractor.noPendingVideos')}</span>
              </div>
            ) : (
              <ToolboxQueueList
                {...queueState}
                onRetry={handleStartExtract}
                onRemove={(id) => queue.remove(id)}
                onCancel={() => void queue.cancel()}
                onClear={() => queue.clear()}
              />
            )}
          </div>
        </div>

        {/* 右侧：提取设置 */}
        <div className="flex min-h-0 w-72 shrink-0 flex-col gap-4 overflow-y-auto bg-muted/30 p-4">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" />
              {t('audioExtractor.optionsTitle')}
            </h3>

            {/* 格式选择 */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('audioExtractor.format')}</Label>
              <Select
                value={format}
                onValueChange={(v: any) => setFormat(v)}
                disabled={isProcessing}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mp3">{t('audioExtractor.formatMp3')}</SelectItem>
                  <SelectItem value="wav">{t('audioExtractor.formatWav')}</SelectItem>
                  <SelectItem value="aac">{t('audioExtractor.formatAac')}</SelectItem>
                  <SelectItem value="m4a">{t('audioExtractor.formatM4a')}</SelectItem>
                  <SelectItem value="flac">{t('audioExtractor.formatFlac')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* MP3/AAC 码率 */}
            {['mp3', 'aac', 'm4a'].includes(format) && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t('audioExtractor.bitrate')}
                </Label>
                <Select
                  value={bitrate}
                  onValueChange={(v: any) => setBitrate(v)}
                  disabled={isProcessing}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="320k">{t('audioExtractor.bitrate320')}</SelectItem>
                    <SelectItem value="256k">{t('audioExtractor.bitrate256')}</SelectItem>
                    <SelectItem value="192k">{t('audioExtractor.bitrate192')}</SelectItem>
                    <SelectItem value="128k">{t('audioExtractor.bitrate128')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* WAV 预设 */}
            {format === 'wav' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t('audioExtractor.wavSpec')}
                </Label>
                <Select
                  value={wavPreset}
                  onValueChange={(v: any) => setWavPreset(v)}
                  disabled={isProcessing}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">{t('audioExtractor.presetStandard')}</SelectItem>
                    <SelectItem value="asr_16k_mono">
                      {t('audioExtractor.presetAsr')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* 输出目录 */}
            <div className="space-y-1.5 pt-2 border-t border-border">
              <Label className="text-xs text-muted-foreground">
                {t('outputFolder')}
              </Label>
              <div className="flex items-center gap-2">
                <div
                  className="flex-1 truncate rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-[11px] text-muted-foreground"
                  title={outputDir || t('defaultOutputFolder')}
                >
                  {outputDir || t('defaultOutputFolder')}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectOutputDir}
                  disabled={isProcessing}
                  className="h-8 shrink-0 text-xs px-2.5"
                >
                  {t('changeFolder')}
                </Button>
              </div>
            </div>
            {/* 批量提取完成行动条 */}
            {files.some((f) => f.status === 'done' && f.result?.outputPath) &&
              !isProcessing && (
                <ToolboxFinishBar
                  outputType="audio"
                  outputPaths={files
                    .filter((f) => f.status === 'done' && f.result?.outputPath)
                    .map((f) => f.result!.outputPath)}
                  summary={t('finishBar.title')}
                  onReset={() => queue.clear()}
                />
              )}
          </div>

          <div className="pt-4 border-t border-border">
            <Button
              className="w-full text-xs font-medium h-9"
              onClick={() => void handleStartExtract()}
              disabled={
                !files.some(
                  (f) => f.status === 'pending' || f.status === 'cancelled',
                ) || isProcessing
              }
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('audioExtractor.extracting')}
                </>
              ) : (
                t('audioExtractor.startExtract')
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
