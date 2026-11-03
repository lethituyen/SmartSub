import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import {
  Download,
  Search,
  FolderOpen,
  Film,
  Layers,
  Settings as SettingsIcon,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  ChevronRight,
  Sliders,
  ExternalLink,
  ListOrdered,
  FileCheck,
  Video,
  Subtitles,
  Eye,
  Flame,
  X,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type {
  ShortDramaSeries,
  ShortDramaDownloadTask,
  ShortDramaSettings,
  ShortDramaEpisode,
  ShortDramaTrendingItem,
} from '../../../../types/shortDrama';

type ActiveTab = 'search' | 'tasks' | 'library' | 'settings';

export default function ShortDramaDownloaderPanel() {
  const { t } = useTranslation('toolbox');
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<ActiveTab>('search');
  const [inputUrl, setInputUrl] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [seriesData, setSeriesData] = useState<ShortDramaSeries | null>(null);

  // Real-time Trending Sidebar state
  const [showTrendingSidebar, setShowTrendingSidebar] = useState(true);
  const [trendingCategory, setTrendingCategory] = useState('all');
  const [trendingSearch, setTrendingSearch] = useState('');
  const [trendingItems, setTrendingItems] = useState<ShortDramaTrendingItem[]>([]);
  const [loadingTrending, setLoadingTrending] = useState(false);
  const [trendingLastUpdated, setTrendingLastUpdated] = useState<string>('');

  // Provider selection
  const [selectedProvider, setSelectedProvider] = useState<string>('auto');
  const [detectedBadge, setDetectedBadge] = useState<string | null>(null);
  const [providers, setProviders] = useState<Array<{ id: string; name: string; badge: string }>>([
    { id: 'auto', name: '✨ Tự động nhận diện', badge: 'Auto' },
    { id: 'all', name: '🚀 Siêu Tổng Hợp (Tất Cả Kho Phim)', badge: 'Aggregator' },
    { id: 'hongguo', name: '🔴 Hồng Quả (红果)', badge: 'Hongguo' },
    { id: 'duanju84', name: '🚌 Đoản Kịch Ba Sĩ (duanju84)', badge: 'Ba Sĩ' },
    { id: 'duanjudaquan', name: '📚 Đoản Kịch Đại Toàn (lssy)', badge: 'Đại Toàn' },
    { id: 'dushe', name: '🐍 Độc Thiệt Đoản Kịch (dushe)', badge: 'Độc Thiệt' },
    { id: 'niuniu28', name: '🐂 28 Đoản Kịch (28dj)', badge: '28 Đoản Kịch' },
    { id: 'hema', name: '🦛 Hà Mã (河马)', badge: 'Hema' },
    { id: 'xingya', name: '🌱 Tinh Nha (星芽)', badge: 'Xingya' },
    { id: 'kuaishou', name: '⚡ Kuaishou (快手)', badge: 'Kuaishou' },
    { id: 'xigua', name: '🍉 Tây Qua (西瓜)', badge: 'Xigua' },
    { id: 'douyin', name: '🎵 Douyin (抖音)', badge: 'Douyin' },
    { id: 'qimao', name: '🐱 Thất Miêu (七猫)', badge: 'Qimao' },
    { id: 'generic', name: '🌐 Web / M3U8 / MP4', badge: 'Universal' },
  ]);

  // Episode selection
  const [selectedVids, setSelectedVids] = useState<Set<string>>(new Set());
  const [customRangeText, setCustomRangeText] = useState('');

  // Tasks & Settings
  const [tasks, setTasks] = useState<ShortDramaDownloadTask[]>([]);
  const [settings, setSettings] = useState<ShortDramaSettings>({
    root: '',
    name_format: '{series_title} - E{vid_index}',
    max_concurrent: 3,
    auto_merge: false,
  });

  // Merging state
  const [mergingSeriesId, setMergingSeriesId] = useState<string | null>(null);
  const [mergeMessage, setMergeMessage] = useState<string | null>(null);

  // Load initial settings and tasks
  useEffect(() => {
    if (typeof window === 'undefined' || !window.ipc) return;

    window.ipc.invoke('short-drama:get-settings').then((res: ShortDramaSettings) => {
      if (res) {
        setSettings(res);
        // Also check if SmartSub has a global videoDownloadSavePath
        window.ipc.invoke('getSettings').then((globalSettings: any) => {
          if (globalSettings?.videoDownloadSavePath) {
            if (!res.root || res.root.includes('SmartSub_ShortDrama')) {
              const synced = { ...res, root: globalSettings.videoDownloadSavePath };
              setSettings(synced);
              window.ipc.invoke('short-drama:save-settings', synced);
            }
          }
        });
      }
    });

    window.ipc.invoke('short-drama:get-tasks').then((res: ShortDramaDownloadTask[]) => {
      if (Array.isArray(res)) setTasks(res);
    });

    window.ipc.invoke('short-drama:list-providers').then((list: any[]) => {
      if (Array.isArray(list) && list.length > 0) {
        setProviders([{ id: 'auto', name: '✨ Tự động nhận diện', badge: 'Auto' }, ...list]);
      }
    });

    // Fetch initial real-time trending
    window.ipc
      .invoke('short-drama:get-trending', { category: 'all' })
      .then((res: any) => {
        if (res?.success && Array.isArray(res.items)) {
          setTrendingItems(res.items);
          setTrendingLastUpdated(new Date().toLocaleTimeString());
        }
      })
      .catch(() => { });

    const handleTaskUpdated = (_event: any, updatedTask: ShortDramaDownloadTask) => {
      setTasks((prev) => {
        const index = prev.findIndex((t) => t.id === updatedTask.id);
        if (index >= 0) {
          const next = [...prev];
          next[index] = updatedTask;
          return next;
        }
        return [updatedTask, ...prev];
      });
    };

    const handleTaskDeleted = (_event: any, taskId: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    };

    const unsubUpdated = window.ipc.on('short-drama:task-updated', handleTaskUpdated);
    const unsubDeleted = window.ipc.on('short-drama:task-deleted', handleTaskDeleted);

    return () => {
      unsubUpdated?.();
      unsubDeleted?.();
    };
  }, []);

  // Fetch real-time trending list
  const fetchTrending = async (
    category = trendingCategory,
    query = trendingSearch,
    force = false
  ) => {
    if (typeof window === 'undefined' || !window.ipc) return;
    setLoadingTrending(true);
    try {
      const res = await window.ipc.invoke('short-drama:get-trending', {
        category,
        query,
        refresh: force,
      });
      if (res?.success && Array.isArray(res.items)) {
        setTrendingItems(res.items);
        setTrendingLastUpdated(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.warn('Failed to load real-time trending:', err);
    } finally {
      setLoadingTrending(false);
    }
  };

  // 1-Click action when user selects an item from the trending sidebar
  const handleSelectTrendingItem = (item: ShortDramaTrendingItem) => {
    setInputUrl(item.link || item.title);
    setSelectedProvider(item.provider_id || 'auto');
    setActiveTab('search');
    setResolving(true);
    setResolveError(null);
    setSeriesData(null);
    setSelectedVids(new Set());

    window.ipc
      .invoke('short-drama:resolve', {
        input: item.link || item.title,
        providerId: item.provider_id || 'auto',
      })
      .then((res: any) => {
        if (res?.success && res.series) {
          setSeriesData(res.series);
          if (res.provider?.name) setDetectedBadge(res.provider.name);
          const allVids = new Set<string>(
            res.series.episodes.map((e: ShortDramaEpisode) => e.vid)
          );
          setSelectedVids(allVids);
        } else {
          setResolveError(res?.error || 'Không tìm thấy thông tin phim');
        }
      })
      .catch((err: any) => {
        setResolveError(err?.message || 'Lỗi kết nối');
      })
      .finally(() => {
        setResolving(false);
      });
  };

  // Format speed bytes/s
  const formatSpeed = (bytesPerSec?: number) => {
    if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s';
    if (bytesPerSec < 1024 * 1024) {
      return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    }
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  };

  // Format size bytes
  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '0 MB';
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Resolve series from link/text
  const handleResolve = async () => {
    if (!inputUrl.trim()) return;
    setResolving(true);
    setResolveError(null);
    setSeriesData(null);
    setSelectedVids(new Set());

    try {
      const res = await window.ipc.invoke('short-drama:resolve', {
        input: inputUrl.trim(),
        providerId: selectedProvider,
      });

      if (res.success && res.series) {
        setSeriesData(res.series);
        if (res.provider?.name) {
          setDetectedBadge(res.provider.name);
        }
        // Default select all episodes
        const allVids = new Set<string>(res.series.episodes.map((e: ShortDramaEpisode) => e.vid));
        setSelectedVids(allVids);
      } else {
        setResolveError(res.error || 'Không tìm thấy thông tin phim');
      }
    } catch (err: any) {
      setResolveError(err.message || 'Lỗi kết nối');
    } finally {
      setResolving(false);
    }
  };

  // Batch selection helpers
  const handleSelectAll = () => {
    if (!seriesData) return;
    setSelectedVids(new Set(seriesData.episodes.map((e) => e.vid)));
  };

  const handleDeselectAll = () => {
    setSelectedVids(new Set());
  };

  const handleInvertSelect = () => {
    if (!seriesData) return;
    const next = new Set<string>();
    seriesData.episodes.forEach((e) => {
      if (!selectedVids.has(e.vid)) next.add(e.vid);
    });
    setSelectedVids(next);
  };

  const handleSelectRange = (start: number, end: number) => {
    if (!seriesData) return;
    const next = new Set(selectedVids);
    seriesData.episodes.forEach((e) => {
      if (e.vid_index >= start && e.vid_index <= end) {
        next.add(e.vid);
      }
    });
    setSelectedVids(next);
  };

  const handleApplyCustomRange = () => {
    if (!seriesData || !customRangeText.trim()) return;
    const next = new Set<string>();
    const parts = customRangeText.split(/[,，\s]+/);

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      if (trimmed.includes('-')) {
        const [sStr, eStr] = trimmed.split('-');
        const s = parseInt(sStr, 10);
        const e = parseInt(eStr, 10);
        if (!isNaN(s) && !isNaN(e)) {
          seriesData.episodes.forEach((ep) => {
            if (ep.vid_index >= s && ep.vid_index <= e) next.add(ep.vid);
          });
        }
      } else {
        const idx = parseInt(trimmed, 10);
        if (!isNaN(idx)) {
          const ep = seriesData.episodes.find((e) => e.vid_index === idx);
          if (ep) next.add(ep.vid);
        }
      }
    }

    if (next.size > 0) {
      setSelectedVids(next);
      setCustomRangeText('');
    }
  };

  // Start Download for selected
  const handleStartDownload = async () => {
    if (!seriesData || selectedVids.size === 0) return;

    const selectedEpisodes = seriesData.episodes.filter((e) => selectedVids.has(e.vid));
    const items = selectedEpisodes.map((e) => ({
      provider_id: seriesData.provider_id || 'hongguo',
      series_id: seriesData.series_id,
      series_title: seriesData.series_title,
      series_title_vi: seriesData.series_title_vi,
      vid: e.vid,
      vid_index: e.vid_index,
      ep_title: e.title_vi || e.title,
      cover: e.cover || seriesData.cover,
    }));

    await window.ipc.invoke('short-drama:add-tasks', items);
    setActiveTab('tasks');
  };

  // Task controls
  const handlePauseTask = (id: string) => window.ipc.invoke('short-drama:pause-task', id);
  const handleResumeTask = (id: string) => window.ipc.invoke('short-drama:resume-task', id);
  const handleRetryTask = (id: string) => window.ipc.invoke('short-drama:retry-task', id);
  const handleDeleteTask = (id: string, deleteFile = false) =>
    window.ipc.invoke('short-drama:delete-task', { taskId: id, deleteFile });
  const handlePauseAll = () => window.ipc.invoke('short-drama:pause-all');
  const handleResumeAll = () => window.ipc.invoke('short-drama:resume-all');

  // Open directory
  const handleOpenFolder = (seriesId?: string) =>
    window.ipc.invoke('short-drama:open-folder', seriesId);

  // Merge series
  const handleMergeSeries = async (seriesId: string) => {
    setMergingSeriesId(seriesId);
    setMergeMessage(null);
    try {
      const res = await window.ipc.invoke('short-drama:merge-series', { seriesId });
      if (res.success) {
        setMergeMessage(`Đã ghép video thành công: ${res.outPath}`);
      } else {
        setMergeMessage(`Lỗi ghép video: ${res.error}`);
      }
    } catch (err: any) {
      setMergeMessage(`Lỗi: ${err.message}`);
    } finally {
      setMergingSeriesId(null);
    }
  };

  // Direct handoff to SmartSub Subtitling/Dubbing flow
  const handleSendToSubtitler = (filePath: string) => {
    if (!filePath) return;
    // Route to home with media file selected or storage prep
    router.push({
      pathname: '/[locale]/home',
      query: { locale: router.query.locale, importMedia: encodeURIComponent(filePath) },
    });
  };

  // Save Settings & Sync with SmartSub global download configuration
  const handleSelectRoot = async () => {
    try {
      // 1. Try standard SmartSub selectDirectory
      const res = await window.ipc.invoke('selectDirectory', {
        title: 'Chọn thư mục lưu phim ngắn & video',
      });
      const selectedDir = res?.directoryPath;
      if (selectedDir) {
        const next = { ...settings, root: selectedDir };
        setSettings(next);
        await window.ipc.invoke('short-drama:save-settings', next);
        await window.ipc.invoke('setSettings', { videoDownloadSavePath: selectedDir });
        return;
      }
    } catch {
      // Fallback to short-drama:select-dir
      const res = await window.ipc.invoke('short-drama:select-dir');
      if (res?.success && res.path) {
        const next = { ...settings, root: res.path };
        setSettings(next);
        await window.ipc.invoke('short-drama:save-settings', next);
        await window.ipc.invoke('setSettings', { videoDownloadSavePath: res.path });
      }
    }
  };

  const handleUpdateSettings = (patch: Partial<ShortDramaSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    window.ipc.invoke('short-drama:save-settings', next);
    if (patch.root) {
      window.ipc.invoke('setSettings', { videoDownloadSavePath: patch.root });
    }
  };

  // Aggregated library grouped by series
  const librarySeries = useMemo(() => {
    const map = new Map<
      string,
      {
        seriesId: string;
        seriesTitle: string;
        cover?: string;
        completedTasks: ShortDramaDownloadTask[];
        totalTasks: number;
      }
    >();

    tasks.forEach((t) => {
      if (!map.has(t.series_id)) {
        map.set(t.series_id, {
          seriesId: t.series_id,
          seriesTitle: t.series_title,
          cover: t.cover,
          completedTasks: [],
          totalTasks: 0,
        });
      }
      const entry = map.get(t.series_id)!;
      entry.totalTasks++;
      if (t.status === 'completed' && t.savePath) {
        entry.completedTasks.push(t);
      }
    });

    return Array.from(map.values()).sort((a, b) => b.completedTasks.length - a.completedTasks.length);
  }, [tasks]);

  const activeDownloadingCount = tasks.filter(
    (t) => t.status === 'downloading' || t.status === 'decrypting'
  ).length;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      {/* Subheader Toolbar */}
      <div className="flex items-center justify-between border-b px-6 py-3 bg-card/60 backdrop-blur-sm">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <Film className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-semibold leading-tight tracking-tight">
                Tải Phim Ngắn & Video (Hongguo / Douyin / Web)
              </h2>
              <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-xs">
                Mã hoá CENC Tự Động Giải Mã
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Tải hàng loạt full bộ, ghép nối 1-click & chuyển sang làm phụ đề/lồng tiếng siêu tốc
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ActiveTab)} className="w-auto">
            <TabsList className="grid grid-cols-4 h-9">
              <TabsTrigger value="search" className="text-xs flex items-center space-x-1.5 px-3">
                <Search className="h-3.5 w-3.5" />
                <span>Tìm & Dán Link</span>
              </TabsTrigger>
              <TabsTrigger value="tasks" className="text-xs flex items-center space-x-1.5 px-3 relative">
                <Download className="h-3.5 w-3.5" />
                <span>Tiến độ</span>
                {activeDownloadingCount > 0 && (
                  <span className="ml-1 flex h-2 w-2 rounded-full bg-primary animate-pulse" />
                )}
              </TabsTrigger>
              <TabsTrigger value="library" className="text-xs flex items-center space-x-1.5 px-3">
                <Layers className="h-3.5 w-3.5" />
                <span>Thư viện & Ghép</span>
              </TabsTrigger>
              <TabsTrigger value="settings" className="text-xs flex items-center space-x-1.5 px-3">
                <SettingsIcon className="h-3.5 w-3.5" />
                <span>Cài đặt</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Button
            variant={showTrendingSidebar ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowTrendingSidebar((prev) => !prev)}
            className="h-9 text-xs flex items-center space-x-1.5 px-3 shadow-xs"
            title={showTrendingSidebar ? 'Ẩn BXH thịnh hành' : 'Hiện BXH thịnh hành thời gian thực'}
          >
            <Flame className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
            <span className="hidden sm:inline font-medium">BXH Thịnh Hành</span>
            <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
          </Button>
        </div>
      </div>

      {/* Split View: Left Main Tabs & Right Trending Sidebar */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0">
          {/* TAB 1: SEARCH & RESOLVE */}
          {activeTab === 'search' && (
            <div className="max-w-5xl mx-auto space-y-6">
              {/* Input Card */}
              <Card className="border shadow-sm">
                <CardContent className="p-5 space-y-3">
                  {/* Platform Selector Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 pb-1">
                    <span className="text-xs font-medium text-muted-foreground mr-1">Nền tảng:</span>
                    {providers.map((p) => {
                      const isActive = selectedProvider === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedProvider(p.id)}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-all ${isActive
                            ? 'bg-primary text-primary-foreground border-primary font-medium shadow-sm'
                            : 'bg-muted/50 text-muted-foreground hover:bg-muted border-border/50'
                            }`}
                        >
                          {p.name}
                        </button>
                      );
                    })}
                  </div>

                  <label className="text-sm font-medium flex items-center space-x-1.5 pt-1">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span>Dán đường dẫn phim hoặc văn bản chia sẻ từ Hồng Quả, Thất Miêu, Kuaishou, Douyin hoặc Web:</span>
                  </label>
                  <div className="flex items-center space-x-2">
                    <Input
                      placeholder="Dán link Hồng Quả (fanqienovel.com), Thất Miêu (qimao.com), Kuaishou, Douyin hoặc URL video..."
                      value={inputUrl}
                      onChange={(e) => setInputUrl(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleResolve()}
                      className="flex-1 font-mono text-xs"
                    />
                    <Button
                      onClick={handleResolve}
                      disabled={resolving || !inputUrl.trim()}
                      className="min-w-[120px]"
                    >
                      {resolving ? (
                        <>
                          <div className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                          Đang đọc...
                        </>
                      ) : (
                        <>
                          <Search className="h-4 w-4 mr-2" />
                          Phân tích
                        </>
                      )}
                    </Button>
                  </div>
                  {resolveError && (
                    <div className="flex items-center space-x-2 text-xs text-destructive bg-destructive/10 p-2.5 rounded-lg border border-destructive/20">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{resolveError}</span>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground pt-1">
                    <span>Hỗ trợ:</span>
                    <span className="bg-muted px-2 py-0.5 rounded font-medium">🔴 Hồng Quả (fanqienovel)</span>
                    <span className="bg-muted px-2 py-0.5 rounded font-medium">🦛 Hà Mã (hema)</span>
                    <span className="bg-muted px-2 py-0.5 rounded font-medium">🌱 Tinh Nha (xingya)</span>
                    <span className="bg-muted px-2 py-0.5 rounded font-medium">⚡ Kuaishou (快手)</span>
                    <span className="bg-muted px-2 py-0.5 rounded font-medium">🍉 Tây Qua (xigua)</span>
                    <span className="bg-muted px-2 py-0.5 rounded font-medium">🎵 Douyin (抖音)</span>
                    <span className="bg-muted px-2 py-0.5 rounded font-medium">🌐 Web / M3U8 / MP4</span>
                  </div>
                </CardContent>
              </Card>

              {/* Resolved Series Details */}
              {seriesData && (
                <div className="space-y-5 animate-in fade-in-50 duration-200">
                  {/* Series Banner */}
                  <Card className="border overflow-hidden bg-card/60 backdrop-blur-sm">
                    <div className="flex flex-col md:flex-row p-5 gap-5">
                      {seriesData.cover && (
                        <div className="w-28 h-40 shrink-0 rounded-lg overflow-hidden border shadow-sm bg-muted relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={seriesData.cover}
                            alt={seriesData.series_title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div className="flex-1 flex flex-col justify-between">
                        <div className="space-y-1.5">
                          <div className="flex items-center space-x-2">
                            <h3 className="text-xl font-bold tracking-tight">
                              {seriesData.series_title_vi || seriesData.series_title}
                            </h3>
                            <Badge variant="secondary" className="text-xs">
                              {seriesData.total} Tập
                            </Badge>
                            {(detectedBadge || seriesData.provider_id) && (
                              <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                                {detectedBadge || seriesData.provider_id.toUpperCase()}
                              </Badge>
                            )}
                            {seriesData.source && (
                              <Badge variant="outline" className="text-[10px] uppercase">
                                {seriesData.source}
                              </Badge>
                            )}
                          </div>
                          {seriesData.series_title_vi && seriesData.series_title_vi !== seriesData.series_title && (
                            <p className="text-xs font-mono text-muted-foreground/80">
                              Tên gốc: {seriesData.series_title}
                            </p>
                          )}
                          {(seriesData.intro_vi || seriesData.intro) && (
                            <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                              {seriesData.intro_vi || seriesData.intro}
                            </p>
                          )}
                          {seriesData.tags && seriesData.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {seriesData.tags.map((tag, idx) => (
                                <span
                                  key={idx}
                                  className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t">
                          <div className="text-xs text-muted-foreground">
                            Đã chọn{' '}
                            <span className="font-semibold text-foreground">{selectedVids.size}</span> /{' '}
                            {seriesData.episodes.length} tập
                          </div>
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="default"
                              onClick={handleStartDownload}
                              disabled={selectedVids.size === 0}
                              className="h-9 px-4 font-medium"
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Tải {selectedVids.size} tập đã chọn
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>

                  {/* Batch Selector Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border bg-card/40">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium mr-1 text-muted-foreground">Chọn nhanh:</span>
                      <Button variant="outline" size="sm" onClick={handleSelectAll} className="h-7 text-xs">
                        Tất cả
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleDeselectAll} className="h-7 text-xs">
                        Bỏ chọn
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleInvertSelect} className="h-7 text-xs">
                        Đảo chọn
                      </Button>
                      {seriesData.episodes.length > 30 && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSelectRange(1, 30)}
                            className="h-7 text-xs"
                          >
                            Tập 1 - 30
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSelectRange(31, 60)}
                            className="h-7 text-xs"
                          >
                            Tập 31 - 60
                          </Button>
                        </>
                      )}
                      {seriesData.episodes.length > 60 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSelectRange(61, 90)}
                          className="h-7 text-xs"
                        >
                          Tập 61 - 90
                        </Button>
                      )}
                    </div>

                    {/* Custom Range input */}
                    <div className="flex items-center space-x-1.5">
                      <Input
                        placeholder="Khoảng vd: 1-20, 25"
                        value={customRangeText}
                        onChange={(e) => setCustomRangeText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleApplyCustomRange()}
                        className="h-7 text-xs w-36 font-mono"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleApplyCustomRange}
                        className="h-7 text-xs px-2"
                      >
                        Áp dụng
                      </Button>
                    </div>
                  </div>

                  {/* Episode Grid */}
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                    {seriesData.episodes.map((ep) => {
                      const isSelected = selectedVids.has(ep.vid);
                      return (
                        <button
                          key={ep.vid}
                          type="button"
                          onClick={() => {
                            const next = new Set(selectedVids);
                            if (next.has(ep.vid)) next.delete(ep.vid);
                            else next.add(ep.vid);
                            setSelectedVids(next);
                          }}
                          className={`flex flex-col items-center justify-center p-2.5 rounded-lg border text-center transition-all ${isSelected
                            ? 'bg-primary text-primary-foreground border-primary shadow-sm font-semibold'
                            : 'bg-card/50 hover:bg-accent border-border/60 text-muted-foreground'
                            }`}
                        >
                          <span className="text-xs leading-none">Tập</span>
                          <span className="text-sm font-bold mt-1 leading-none">{ep.vid_index}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: TASKS & REAL-TIME PROGRESS */}
          {activeTab === 'tasks' && (
            <div className="max-w-5xl mx-auto space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-medium">Hàng đợi tải xuống ({tasks.length})</h3>
                  {activeDownloadingCount > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      Đang tải {activeDownloadingCount} luồng
                    </Badge>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <Button variant="outline" size="sm" onClick={handleResumeAll} className="h-8 text-xs">
                    <Play className="h-3.5 w-3.5 mr-1" />
                    Tiếp tục tất cả
                  </Button>
                  <Button variant="outline" size="sm" onClick={handlePauseAll} className="h-8 text-xs">
                    <Pause className="h-3.5 w-3.5 mr-1" />
                    Tạm dừng tất cả
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenFolder()}
                    className="h-8 text-xs"
                  >
                    <FolderOpen className="h-3.5 w-3.5 mr-1" />
                    Mở thư mục
                  </Button>
                </div>
              </div>

              {tasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                  <Download className="h-10 w-10 stroke-[1.5] mb-2 opacity-40" />
                  <p className="text-sm font-medium">Chưa có tác vụ tải nào</p>
                  <p className="text-xs mt-1">Dán liên kết phim ở tab &quot;Tìm &amp; Dán Link&quot; để bắt đầu</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {tasks.map((task) => (
                    <Card key={task.id} className="p-3 border shadow-none bg-card/60 backdrop-blur-sm">
                      <div className="flex items-center justify-between gap-4">
                        {/* Left: Info */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-semibold truncate max-w-md">
                              {task.filename}
                            </span>
                            {task.status === 'completed' && (
                              <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Hoàn thành
                              </Badge>
                            )}
                            {task.status === 'downloading' && (
                              <Badge variant="outline" className="text-[10px] bg-sky-500/10 text-sky-500 border-sky-500/20">
                                Đang tải {formatSpeed(task.speed)}
                              </Badge>
                            )}
                            {task.status === 'decrypting' && (
                              <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse">
                                Đang giải mã AES-CTR
                              </Badge>
                            )}
                            {task.status === 'stopped' && (
                              <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">
                                Đã dừng
                              </Badge>
                            )}
                            {task.status === 'failed' && (
                              <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20">
                                Thất bại
                              </Badge>
                            )}
                          </div>

                          {/* Progress bar */}
                          <div className="flex items-center space-x-2">
                            <Progress value={task.progress} className="h-1.5 flex-1" />
                            <span className="text-[11px] font-mono text-muted-foreground w-10 text-right">
                              {task.progress}%
                            </span>
                          </div>

                          {/* Metadata row */}
                          <div className="flex items-center space-x-4 text-[11px] text-muted-foreground">
                            <span>
                              {formatBytes(task.receivedBytes)} / {formatBytes(task.totalBytes)}
                            </span>
                            {task.error && (
                              <span className="text-destructive truncate max-w-sm">
                                Lỗi: {task.error}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Right: Actions */}
                        <div className="flex items-center space-x-1 shrink-0">
                          {task.status === 'completed' && task.savePath && (
                            <>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleSendToSubtitler(task.savePath!)}
                                      className="h-8 text-xs text-primary hover:bg-primary/10"
                                    >
                                      <Subtitles className="h-3.5 w-3.5 mr-1" />
                                      Làm Sub & Dịch
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Mở trong SmartSub để nhận dạng & dịch</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenFolder(task.series_id)}
                                className="h-8 w-8 p-0"
                              >
                                <FolderOpen className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}

                          {task.status === 'downloading' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePauseTask(task.id)}
                              className="h-8 w-8 p-0"
                            >
                              <Pause className="h-3.5 w-3.5" />
                            </Button>
                          )}

                          {(task.status === 'stopped' || task.status === 'failed') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleResumeTask(task.id)}
                              className="h-8 w-8 p-0"
                            >
                              <Play className="h-3.5 w-3.5" />
                            </Button>
                          )}

                          {task.status === 'failed' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRetryTask(task.id)}
                              className="h-8 w-8 p-0"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteTask(task.id, false)}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: LIBRARY & FFmpeg MERGING */}
          {activeTab === 'library' && (
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <h3 className="text-sm font-semibold tracking-tight">Thư viện Phim đã tải</h3>
                  <p className="text-xs text-muted-foreground">
                    Quản lý phim theo bộ, ghép nối tất cả tập thành 1 file MP4 duy nhất không mất chất lượng
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenFolder()}
                  className="h-8 text-xs"
                >
                  <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
                  Mở thư mục gốc
                </Button>
              </div>

              {mergeMessage && (
                <div className="flex items-center space-x-2 text-xs p-3 rounded-lg border bg-accent">
                  <Sparkles className="h-4 w-4 text-primary shrink-0" />
                  <span className="flex-1">{mergeMessage}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setMergeMessage(null)}
                    className="h-6 text-xs px-2"
                  >
                    Đóng
                  </Button>
                </div>
              )}

              {librarySeries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                  <Layers className="h-10 w-10 stroke-[1.5] mb-2 opacity-40" />
                  <p className="text-sm font-medium">Chưa có bộ phim nào hoàn thành</p>
                  <p className="text-xs mt-1">Các tập tải xong sẽ xuất hiện tại đây</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {librarySeries.map((s) => (
                    <Card key={s.seriesId} className="border shadow-sm p-4 bg-card/60 backdrop-blur-sm">
                      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                        <div className="flex items-center space-x-3 min-w-0">
                          {s.cover ? (
                            <div className="w-12 h-16 rounded overflow-hidden border shrink-0 bg-muted">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={s.cover} alt={s.seriesTitle} className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div className="w-12 h-16 rounded border shrink-0 bg-muted flex items-center justify-center">
                              <Film className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <h4 className="text-sm font-semibold truncate max-w-md">{s.seriesTitle}</h4>
                            <div className="flex items-center space-x-2 text-xs text-muted-foreground mt-0.5">
                              <span>
                                Đã tải hoàn thành:{' '}
                                <strong className="text-foreground">{s.completedTasks.length}</strong> / {s.totalTasks} tập
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenFolder(s.seriesId)}
                            className="h-8 text-xs"
                          >
                            <FolderOpen className="h-3.5 w-3.5 mr-1" />
                            Mở thư mục
                          </Button>

                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={mergingSeriesId === s.seriesId || s.completedTasks.length < 2}
                            onClick={() => handleMergeSeries(s.seriesId)}
                            className="h-8 text-xs"
                          >
                            {mergingSeriesId === s.seriesId ? (
                              <>
                                <div className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-1.5" />
                                Đang ghép video...
                              </>
                            ) : (
                              <>
                                <Film className="h-3.5 w-3.5 mr-1" />
                                Ghép Full Bộ ({s.completedTasks.length} tập)
                              </>
                            )}
                          </Button>

                          {s.completedTasks[0]?.savePath && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleSendToSubtitler(s.completedTasks[0].savePath!)}
                              className="h-8 text-xs"
                            >
                              <Subtitles className="h-3.5 w-3.5 mr-1" />
                              Làm Sub Tập 1
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: SETTINGS */}
          {activeTab === 'settings' && (
            <div className="max-w-3xl mx-auto space-y-6">
              <Card className="border shadow-sm p-6 space-y-6">
                <div>
                  <h3 className="text-base font-semibold leading-none tracking-tight">Cài đặt Tải Video & Phim Ngắn</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Định cấu hình thư mục lưu, quy tắc đặt tên và số luồng tải đồng thời
                  </p>
                </div>

                {/* Download Root */}
                <div className="space-y-2">
                  <label className="text-xs font-medium">Thư mục tải về:</label>
                  <div className="flex items-center space-x-2">
                    <Input
                      value={settings.root}
                      readOnly
                      className="flex-1 font-mono text-xs bg-muted"
                    />
                    <Button variant="outline" size="sm" onClick={handleSelectRoot}>
                      <FolderOpen className="h-4 w-4 mr-1.5" /> Thay đổi
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground flex items-center space-x-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />
                    <span>Đồng bộ 2 chiều với thư mục tải video mặc định của SmartSub (Cài đặt &amp; Trang Tải về)</span>
                  </p>
                </div>

                {/* Naming Template */}
                <div className="space-y-2">
                  <label className="text-xs font-medium">Quy tắc đặt tên tập tin:</label>
                  <Input
                    value={settings.name_format}
                    onChange={(e) => handleUpdateSettings({ name_format: e.target.value })}
                    placeholder="{series_title} - E{vid_index}"
                    className="font-mono text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Tham số hỗ trợ: <code>{'{series_title}'}</code> (Tên phim), <code>{'{vid_index}'}</code> (Số tập), <code>{'{ep_title}'}</code> (Tên tập)
                  </p>
                </div>

                {/* Max Concurrent Threads */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium">Số luồng tải đồng thời:</label>
                    <span className="text-xs font-bold text-primary">{settings.max_concurrent} luồng</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {[1, 2, 3, 5, 8, 10].map((num) => (
                      <Button
                        key={num}
                        variant={settings.max_concurrent === num ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handleUpdateSettings({ max_concurrent: num })}
                        className="h-8 text-xs flex-1"
                      >
                        {num}
                      </Button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Khuyến nghị: 3 - 5 luồng để đạt tốc độ tối đa mà không bị giới hạn IP
                  </p>
                </div>

                {/* Auto Merge Toggle */}
                <div className="flex items-center justify-between pt-4 border-t">
                  <div>
                    <div className="text-xs font-medium">Tự động ghép full bộ sau khi tải xong</div>
                    <div className="text-[11px] text-muted-foreground">
                      Khi toàn bộ các tập của một bộ phim tải xong, tự động gọi FFmpeg nối thành 1 file MP4
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.auto_merge}
                    onChange={(e) => handleUpdateSettings({ auto_merge: e.target.checked })}
                    className="h-4 w-4 rounded accent-primary cursor-pointer"
                  />
                </div>
              </Card>
            </div>
          )}
        </div>

        {/* Real-time Trending Sidebar */}
        {showTrendingSidebar && (
          <aside className="w-80 lg:w-96 border-l bg-card/50 backdrop-blur-sm flex flex-col shrink-0 overflow-hidden shadow-sm">
            {/* Sidebar Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
              <div className="flex items-center space-x-2">
                <div className="p-1 rounded-md bg-amber-500/10 text-amber-500">
                  <Flame className="h-4 w-4 fill-amber-500" />
                </div>
                <div>
                  <div className="flex items-center space-x-1.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider">BXH Thịnh Hành</h3>
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1 py-0 bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-mono"
                    >
                      LIVE
                    </Badge>
                  </div>
                  {trendingLastUpdated && (
                    <p className="text-[10px] text-muted-foreground">
                      Cập nhật: {trendingLastUpdated}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => fetchTrending(trendingCategory, trendingSearch, true)}
                  disabled={loadingTrending}
                  title="Làm mới bảng xếp hạng thời gian thực"
                >
                  <RotateCw
                    className={`h-3.5 w-3.5 ${loadingTrending ? 'animate-spin text-primary' : ''}`}
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowTrendingSidebar(false)}
                  title="Đóng sidebar"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Category Filter Chips */}
            <div className="px-3 py-2 border-b bg-muted/20 flex items-center space-x-1 overflow-x-auto no-scrollbar">
              {[
                { id: 'all', label: '🔥 Toàn mạng' },
                { id: 'hongguo', label: '🔴 Hồng Quả' },
                { id: 'hema', label: '🦛 Hà Mã' },
                { id: 'xingya', label: '🌱 Tinh Nha' },
                { id: 'kuaishou', label: '⚡ Kuaishou' },
                { id: 'xigua', label: '🍉 Tây Qua' },
                { id: 'douyin', label: '🎵 Douyin' },
              ].map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setTrendingCategory(c.id);
                    fetchTrending(c.id, trendingSearch, false);
                  }}
                  className={`text-[11px] px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${trendingCategory === c.id
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                    }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Quick Filter Input */}
            <div className="p-3 border-b">
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input
                  value={trendingSearch}
                  onChange={(e) => {
                    setTrendingSearch(e.target.value);
                    fetchTrending(trendingCategory, e.target.value, false);
                  }}
                  placeholder="Tìm trong bảng xếp hạng..."
                  className="h-8 pl-8 text-xs bg-muted/30"
                />
              </div>
            </div>

            {/* Scrollable Items List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {loadingTrending && trendingItems.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-2 text-muted-foreground">
                  <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs">Đang tải BXH thời gian thực...</p>
                </div>
              ) : trendingItems.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  Không tìm thấy phim phù hợp
                </div>
              ) : (
                trendingItems.map((item, index) => {
                  const rank = index + 1;
                  const rankBadgeClass =
                    rank === 1
                      ? 'bg-amber-500 text-white shadow-xs'
                      : rank === 2
                        ? 'bg-slate-400 text-white shadow-xs'
                        : rank === 3
                          ? 'bg-amber-700 text-white shadow-xs'
                          : 'bg-muted text-muted-foreground';

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectTrendingItem(item)}
                      className="group relative flex items-start space-x-2.5 p-2 rounded-xl border bg-card hover:border-primary/50 hover:shadow-sm cursor-pointer transition-all duration-150"
                    >
                      {/* Rank Number */}
                      <span
                        className={`shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold ${rankBadgeClass}`}
                      >
                        {rank}
                      </span>

                      {/* Thumbnail */}
                      <div className="relative w-12 h-16 shrink-0 rounded-md overflow-hidden bg-muted border">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.cover}
                          alt={item.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <h4
                          className="text-xs font-semibold leading-tight line-clamp-1 group-hover:text-primary transition-colors"
                          title={item.title_vi ? `${item.title_vi} (${item.title})` : item.title}
                        >
                          {item.title_vi || item.title}
                        </h4>
                        {item.title_vi && item.title !== item.title_vi && (
                          <p className="text-[10px] text-muted-foreground/80 line-clamp-1 italic font-mono">
                            {item.title}
                          </p>
                        )}

                        <div className="flex items-center space-x-2 text-[10px] text-muted-foreground">
                          {item.episodes_count ? (
                            <span>{item.episodes_count} Tập</span>
                          ) : null}
                          {item.heat && (
                            <span className="text-amber-500 font-medium">
                              {item.heat}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {item.tags?.slice(0, 2).map((tg, i) => (
                            <span
                              key={i}
                              className="text-[9px] px-1.5 py-0.2 rounded bg-muted/80 text-muted-foreground"
                            >
                              {tg}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Quick Load Action Button */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity self-center">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-6 px-2 text-[10px] font-medium"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectTrendingItem(item);
                          }}
                        >
                          Tải ngay
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Sidebar Footer Hint */}
            <div className="p-2.5 border-t bg-muted/10 text-[10px] text-muted-foreground text-center">
              Nhấp vào bất kỳ phim nào để nạp và phân tích tức thì
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
