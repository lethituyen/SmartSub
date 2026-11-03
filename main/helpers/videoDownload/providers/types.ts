import type {
  ShortDramaEpisode,
  ShortDramaSeries,
} from '../../../../types/shortDrama';

export interface ShortDramaPlayInfo {
  url: string;
  spadeA?: string | null;
  codec?: string;
  headers?: Record<string, string>;
  source?: string;
  quality?: string;
  is_encrypted?: boolean;
}

export interface ShortDramaProvider {
  id: string; // 'hongguo' | 'qimao' | 'kuaishou' | 'douyin' | 'generic'
  name: string;
  badge: string;
  icon?: string;
  canHandle(input: string): boolean;
  resolve(input: string): Promise<ShortDramaSeries>;
  fetchPlayUrl(vid: string, extra?: any): Promise<ShortDramaPlayInfo | null>;
}
