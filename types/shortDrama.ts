/**
 * Short Drama & Video Downloader Type Definitions
 * Extensible for Hongguo, Kuaishou, Douyin, and other short drama platforms.
 */

export interface ShortDramaEpisode {
  vid: string;
  vid_index: number;
  title: string;
  title_vi?: string;
  cover?: string;
  series_id: string;
  series_title: string;
  series_title_vi?: string;
  duration?: number;
}

export interface ShortDramaSeries {
  provider_id: string; // 'hongguo' | 'kuaishou' | 'douyin' etc.
  series_id: string;
  series_title: string;
  series_title_vi?: string;
  cover: string;
  total: number;
  episodes: ShortDramaEpisode[];
  source?: 'api' | 'web';
  tags?: string[];
  intro?: string;
  intro_vi?: string;
}

export type ShortDramaTaskStatus =
  | 'pending'
  | 'downloading'
  | 'decrypting'
  | 'completed'
  | 'failed'
  | 'stopped';

export interface ShortDramaDownloadTask {
  id: string; // `${series_id}_${vid_index}`
  provider_id: string;
  series_id: string;
  series_title: string;
  series_title_vi?: string;
  vid: string;
  vid_index: number;
  ep_title?: string;
  cover?: string;
  filename: string;
  savePath?: string;
  status: ShortDramaTaskStatus;
  progress: number; // 0 - 100
  receivedBytes: number;
  totalBytes: number;
  speed?: number; // bytes/sec
  error?: string;
  startTime?: number;
  endTime?: number;
}

export interface ShortDramaSettings {
  root: string; // Download root directory
  name_format: string; // Naming template e.g. '{series_title} E{vid_index}'
  max_concurrent: number; // 1 - 10
  auto_merge: boolean; // Auto merge after all episodes complete
}

export interface ShortDramaCategory {
  slug: string;
  label: string;
}

export interface ShortDramaSearchResultItem {
  series_id: string;
  series_title: string;
  cover: string;
  episode_count: number;
  tags?: string[];
  url?: string;
}

export interface ShortDramaTrendingItem {
  id: string;
  provider_id: string; // 'hongguo' | 'qimao' | 'kuaishou' | 'douyin'
  title: string;
  title_vi?: string;
  cover: string;
  episodes_count?: number;
  heat?: string; // '🔥 98.6w'
  category?: string;
  tags?: string[];
  link: string; // URL or ID to resolve
  description?: string;
  description_vi?: string;
}

