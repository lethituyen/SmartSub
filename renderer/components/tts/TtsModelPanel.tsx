/**
 * 「配音服务」右栏：单个本地 TTS 模型的管理面板
 * （下载/进度/取消/删除/导入/打开目录，进度 key tts:<id>；
 * 支持 Piper Tiếng Việt: Tải phát hết (Batch all) hoặc tải từng giọng, nghe thử trực tiếp）。
 */
import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'next-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Download,
  FolderOpen,
  HardDriveUpload,
  Loader2,
  Mic2,
  Play,
  Square,
  Trash2,
  X,
  Volume2,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { TtsModelItem } from './useTtsModels';

function fmtBytes(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`;
}

export default function TtsModelPanel({
  model,
  onUpdate,
  onCreateVoice,
}: {
  model: TtsModelItem;
  onUpdate: () => void;
  /** 克隆专用模型（ZipVoice）说明区的「去创建克隆音色」动线。 */
  onCreateVoice?: () => void;
}) {
  const { t } = useTranslation('resources');
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [extracting, setExtracting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [targetVoiceId, setTargetVoiceId] = useState<string | null>(null);
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const isPiper = model.id === 'piper-vietnamese';

  useEffect(() => {
    const key = `tts:${model.id}`;
    const unsubProgress = window?.ipc?.on(
      'downloadProgress',
      (k: string, ratio: number) => {
        if (k !== key) return;
        setDownloading((ratio as number) < 1);
        setProgress(Math.round((ratio as number) * 100));
        if ((ratio as number) >= 1) {
          setExtracting(false);
          setTargetVoiceId(null);
          onUpdate();
        }
      },
    );
    const unsubDetail = window?.ipc?.on(
      'modelDownloadDetail',
      (k: string, detail: { status?: string }) => {
        if (k !== key) return;
        setExtracting(detail?.status === 'extracting');
      },
    );
    return () => {
      unsubProgress?.();
      unsubDetail?.();
    };
  }, [model.id, onUpdate]);

  // Dọn dẹp audio khi component unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handleDownload = async (voiceId?: string) => {
    setDownloading(true);
    setTargetVoiceId(voiceId || 'all');
    setProgress(0);
    try {
      const res = await window?.ipc?.invoke('downloadTtsModel', {
        model: model.id,
        voice: voiceId || 'all',
      });
      if (!res?.success) {
        toast.error(
          res?.error === 'anotherDownloadInProgress'
            ? t('dubbingBlock.anotherDownload')
            : res?.error || t('dubbingBlock.downloadFailed'),
        );
      }
    } finally {
      setDownloading(false);
      setExtracting(false);
      setTargetVoiceId(null);
      onUpdate();
    }
  };

  const handleCancel = async () => {
    await window?.ipc?.invoke('cancelModelDownload');
    setDownloading(false);
    setExtracting(false);
    setTargetVoiceId(null);
    onUpdate();
  };

  const handleDelete = async (voiceId?: string) => {
    setBusy(true);
    try {
      if (isPiper && voiceId) {
        // Xóa một giọng cụ thể bằng cách gọi deleteTtsModel với context hoặc qua piper
        const res = await window?.ipc?.invoke('downloadTtsModel', {
          model: model.id,
          voice: voiceId,
        });
      }
      const res = await window?.ipc?.invoke('deleteTtsModel', model.id);
      if (!res?.success) toast.error(res?.error || 'delete failed');
    } finally {
      setBusy(false);
      onUpdate();
    }
  };

  const handlePreviewVoice = async (voiceId: string) => {
    if (previewingVoiceId === voiceId) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPreviewingVoiceId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setPreviewingVoiceId(voiceId);
    setPreviewLoading(true);

    try {
      const res = await window?.ipc?.invoke('dubbing:previewVoice', {
        engine: { kind: 'local', modelId: model.id },
        voiceId,
        language: 'vi',
      });

      if (res?.success && res.data) {
        const audio = new Audio(`media://${encodeURIComponent(res.data)}`);
        audioRef.current = audio;
        audio.onended = () => {
          setPreviewingVoiceId(null);
          audioRef.current = null;
        };
        audio.onerror = () => {
          setPreviewingVoiceId(null);
          audioRef.current = null;
          toast.error(t('dubbingBlock.previewFailed'));
        };
        await audio.play();
      } else {
        toast.error(res?.error || t('dubbingBlock.previewFailed'));
        setPreviewingVoiceId(null);
      }
    } catch (e: any) {
      toast.error(e?.message || t('dubbingBlock.previewFailed'));
      setPreviewingVoiceId(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleImport = async () => {
    setBusy(true);
    try {
      const res = await window?.ipc?.invoke('importModel', {
        engine: 'tts',
        modelId: model.id,
      });
      if (res?.success) {
        toast.success(t('dubbingBlock.importDone'));
      } else if (!res?.canceled) {
        toast.error(
          res?.reason === 'invalid-layout'
            ? t('dubbingBlock.importInvalid', {
                missing: (res?.missing ?? []).join(', '),
              })
            : res?.error || t('dubbingBlock.importFailed'),
        );
      }
    } finally {
      setBusy(false);
      onUpdate();
    }
  };

  const installedVoiceCount = isPiper
    ? (model.installedVoices?.length ?? (model.installed ? model.voices.length : 0))
    : model.installed
      ? model.voices.length
      : 0;

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          {model.cloneOnly
            ? t('dubbingBlock.cloneModelIntro')
            : isPiper
              ? t('dubbingBlock.vietnameseModelIntro')
              : t('dubbingBlock.modelsIntro')}
        </p>
        {model.cloneOnly && onCreateVoice && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={onCreateVoice}
          >
            <Mic2 className="h-3.5 w-3.5" />
            {t('dubbingBlock.goCreateVoice')}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-[11px]">
          {model.languages.join(' / ')}
        </Badge>
        <Badge variant="outline" className="text-[11px]">
          {model.cloneOnly
            ? t('dubbingBlock.clonePool')
            : isPiper
              ? `${installedVoiceCount} / ${model.voices.length} ${t('dubbingBlock.voiceCount', { count: model.voices.length }).replace(`${model.voices.length} `, '')}`
              : t('dubbingBlock.voiceCount', { count: model.voices.length })}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {fmtBytes(model.approxInstallBytes)} · {model.sampleRate / 1000}kHz
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() =>
              window?.ipc?.invoke('openModelsFolder', { pathType: 'tts' })
            }
          >
            <FolderOpen className="h-4 w-4" />
            {t('dubbingBlock.openModelsFolder')}
          </Button>
        </div>
      </div>

      {/* Tiến trình tải chung */}
      {downloading && (
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <Progress value={progress} className="h-2 flex-1" />
            <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {extracting ? t('dubbingBlock.extracting') : `${progress}%`}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {targetVoiceId === 'all'
                ? t('dubbingBlock.downloadAllVoices')
                : `${t('dubbingBlock.downloadSingleVoice')}: ${targetVoiceId}`}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1"
              onClick={handleCancel}
            >
              <X className="h-3.5 w-3.5" />
              {t('dubbingBlock.cancelDownload')}
            </Button>
          </div>
        </div>
      )}

      {/* Hành động chính cho mô hình */}
      {!downloading && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
          {model.installed ? (
            <>
              <Badge variant="outline" className="border-success/40 text-success">
                {t('dubbingBlock.installed')}
              </Badge>
              {isPiper && installedVoiceCount < model.voices.length && (
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => handleDownload('all')}
                  disabled={busy}
                >
                  <Download className="h-3.5 w-3.5" />
                  {t('dubbingBlock.downloadAllVoices')}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto gap-1.5 text-muted-foreground hover:text-destructive"
                disabled={busy}
                onClick={() => handleDelete()}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {t('dubbingBlock.deleteModel')}
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                className="gap-1.5 font-medium"
                onClick={() => handleDownload(isPiper ? 'all' : undefined)}
                disabled={busy}
              >
                <Download className="h-3.5 w-3.5" />
                {isPiper
                  ? t('dubbingBlock.downloadAllVoices')
                  : t('dubbingBlock.download')}
              </Button>
              {!isPiper && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  disabled={busy}
                  onClick={handleImport}
                >
                  <HardDriveUpload className="h-3.5 w-3.5" />
                  {t('dubbingBlock.import')}
                </Button>
              )}
              <p className="w-full text-xs text-muted-foreground">
                {isPiper
                  ? 'Tải phát hết toàn bộ mô hình giọng đọc ngoại tuyến từ HuggingFace (hoanglinhn0/Model), chạy hoàn toàn trên máy.'
                  : t('dubbingBlock.downloadSourceHint')}
              </p>
            </>
          )}
        </div>
      )}

      {/* Danh sách từng giọng đọc chi tiết (đặc biệt cho Piper Tiếng Việt) */}
      {isPiper && (
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between pb-1 border-b">
            <span className="text-xs font-semibold text-foreground">
              {t('dubbingBlock.voiceList')} ({model.voices.length})
            </span>
            {!downloading && installedVoiceCount < model.voices.length && (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs text-primary"
                onClick={() => handleDownload('all')}
              >
                {t('dubbingBlock.downloadAllVoices')}
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2 max-h-80 overflow-y-auto pr-1">
            {model.voices.map((v) => {
              const isVoiceInstalled =
                model.installedVoices?.includes(v.id) ?? model.installed;
              const isVoicePlaying = previewingVoiceId === v.id;

              return (
                <div
                  key={v.id}
                  className="flex items-center justify-between p-2 rounded-md bg-muted/40 hover:bg-muted/70 transition-colors text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium truncate">{v.label}</span>
                    {v.gender && (
                      <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4">
                        {v.gender === 'f' ? 'Nữ' : 'Nam'}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {isVoiceInstalled ? (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-primary hover:text-primary hover:bg-primary/10"
                          title={t('dubbingBlock.previewVoice')}
                          onClick={() => handlePreviewVoice(v.id)}
                          disabled={downloading}
                        >
                          {isVoicePlaying && previewLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : isVoicePlaying ? (
                            <Square className="h-3.5 w-3.5 fill-current" />
                          ) : (
                            <Volume2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Badge
                          variant="outline"
                          className="border-success/40 text-success text-[10px] h-5 gap-1"
                        >
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          {t('dubbingBlock.installed')}
                        </Badge>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[11px] px-2 gap-1"
                        disabled={downloading || busy}
                        onClick={() => handleDownload(v.id)}
                      >
                        <Download className="h-3 w-3" />
                        {t('dubbingBlock.downloadSingleVoice')}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
