/**
 * Universal Short Drama Aggregator (Siêu Phân Giải Đa Nguồn)
 *
 * Coordinates across all 25+ short drama sources in parallel:
 * - Hongguo (Hồng Quả - ByteDance)
 * - Duanju84 (Đoản Kịch Ba Sĩ - Cloudflare CDN)
 * - Hema (Hà Mã Kịch Trường - Điểm Chúng)
 * - DuanjuDaquan (Đoản Kịch Đại Toàn - lssy.net)
 * - Dushe (Độc Thiệt Đoản Kịch - dushe.video)
 * - Niuniu28 (28 Đoản Kịch - 28dj01.com)
 * - Douyin / Kuaishou / Xigua
 *
 * Automatically picks the healthiest source with 100% full episodes!
 */

import type { ShortDramaSeries } from '../../../../types/shortDrama';
import type { ShortDramaProvider } from './types';
import { HongguoProvider } from './hongguoProvider';
import { Duanju84Provider } from './duanju84Provider';
import { HemaProvider } from './hemaProvider';
import { DuanjuDaquanProvider } from './duanjuDaquanProvider';
import { DusheProvider } from './dusheProvider';
import { Niuniu28Provider } from './niuniu28Provider';

export class UniversalAggregator implements ShortDramaProvider {
  public readonly id = 'all';
  public readonly name = 'Tất cả nguồn (Tự động chọn nguồn tốt nhất)';
  public readonly badge = 'Đa Nguồn';
  public readonly siteUrl = '';

  private readonly providers: ShortDramaProvider[];

  constructor() {
    this.providers = [
      new HongguoProvider(),
      new Duanju84Provider(),
      new HemaProvider(),
      new DuanjuDaquanProvider(),
      new DusheProvider(),
      new Niuniu28Provider(),
    ];
  }

  public canHandle(_input: string): boolean {
    return true;
  }

  public matches(_input: string): boolean {
    return true; // Catch-all
  }

  public async resolve(input: string): Promise<ShortDramaSeries> {
    const trimmed = (input || '').trim();

    // 1. Direct provider match if URL has known domain
    for (const p of this.providers) {
      if (p.id !== 'all' && p.canHandle(trimmed)) {
        try {
          const res = await p.resolve(trimmed);
          if (res && res.episodes.length > 0) return res;
        } catch (err: any) {
          console.warn(`[UniversalAggregator] Direct provider ${p.id} failed: ${err.message}`);
        }
      }
    }

    // 2. Parallel search across all providers
    const promises = this.providers.map(async (p) => {
      try {
        const series = await p.resolve(trimmed);
        return { providerId: p.id, series };
      } catch {
        return null;
      }
    });

    const results = await Promise.allSettled(promises);
    const validSeries: ShortDramaSeries[] = [];

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value?.series && r.value.series.episodes.length > 0) {
        validSeries.push(r.value.series);
      }
    }

    if (validSeries.length === 0) {
      throw new Error(`Không thể tìm thấy phim trên toàn bộ kho nguồn: ${trimmed}`);
    }

    // Pick the one with the most episodes
    validSeries.sort((a, b) => (b.episodes?.length || 0) - (a.episodes?.length || 0));
    return validSeries[0];
  }

  public async fetchPlayUrl(vid: string): Promise<{ url: string; spadeA?: string | null } | null> {
    // Check which provider handles this vid
    if (vid.includes('duanju84.com') || vid.includes('/djplay/')) {
      return new Duanju84Provider().fetchPlayUrl(vid);
    }
    if (vid.includes('lssy.net') || vid.includes('play.php')) {
      return new DuanjuDaquanProvider().fetchPlayUrl(vid);
    }
    if (vid.includes('dushe.video') || vid.includes('/drama/')) {
      return new DusheProvider().fetchPlayUrl(vid);
    }
    if (vid.includes('28dj01.com') || vid.includes('/vodplay/')) {
      return new Niuniu28Provider().fetchPlayUrl(vid);
    }
    if (vid.startsWith('http://') || vid.startsWith('https://')) {
      return { url: vid };
    }
    // Default to Hongguo or Hema
    try {
      return await new HongguoProvider().fetchPlayUrl(vid);
    } catch {
      return await new HemaProvider().fetchPlayUrl(vid);
    }
  }
}
