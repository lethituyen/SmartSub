/**
 * Đoản Kịch Đại Toàn (短剧大全 - lssy.net) Provider
 *
 * Fast Cloudflare-backed short drama collection:
 * - Direct M3U8/MP4 streams
 * - Full rebirth, counterattack, urban, CEO short dramas
 */

import axios from 'axios';
import type { ShortDramaSeries, ShortDramaEpisode } from '../../../../types/shortDrama';
import type { ShortDramaProvider } from './types';

const COMMON_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export class DuanjuDaquanProvider implements ShortDramaProvider {
  public readonly id = 'duanjudaquan';
  public readonly name = 'Đoản Kịch Đại Toàn (短剧大全)';
  public readonly badge = 'Đại Toàn (大全)';
  public readonly siteUrl = 'https://lssy.net';

  public canHandle(input: string): boolean {
    return this.matches(input);
  }

  public matches(input: string): boolean {
    const s = (input || '').toLowerCase();
    return s.includes('lssy.net') || s.includes('duanjudaquan') || s.includes('短剧大全');
  }

  public async resolve(input: string): Promise<ShortDramaSeries> {
    const trimmed = (input || '').trim();

    // 1. Extract vid
    let vid = '';
    const vidMatch =
      trimmed.match(/vid=(\d+)/) ||
      trimmed.match(/\/detail\.php\?vid=(\d+)/) ||
      trimmed.match(/^\d+$/);

    if (vidMatch) {
      vid = vidMatch[1] || vidMatch[0];
    }

    // 2. If not a direct ID, search keyword
    if (!vid) {
      const keyword = trimmed.replace(/《([^》]+)》/, '$1').trim();
      const searchedVid = await this.searchDrama(keyword);
      if (searchedVid) {
        vid = searchedVid;
      }
    }

    if (!vid) {
      throw new Error(`Không tìm thấy phim trên Đoản Kịch Đại Toàn: ${trimmed}`);
    }

    return this.fetchDetail(vid);
  }

  public async searchDrama(keyword: string): Promise<string | null> {
    try {
      const url = `${this.siteUrl}/?keyword=${encodeURIComponent(keyword)}&p=1`;
      const res = await axios.get(url, {
        headers: { 'User-Agent': COMMON_UA, Referer: this.siteUrl },
        timeout: 8000,
      });

      const match = res.data.match(/detail\.php\?vid=(\d+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  public async fetchDetail(vid: string): Promise<ShortDramaSeries> {
    const detailUrl = `${this.siteUrl}/detail.php?vid=${vid}`;
    const res = await axios.get(detailUrl, {
      headers: { 'User-Agent': COMMON_UA, Referer: this.siteUrl },
      timeout: 10000,
    });

    const html: string = res.data;

    // Title
    let title = '';
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) {
      title = titleMatch[1].replace(/[-_].*$/, '').trim();
    }
    if (!title) title = `Đoản Kịch Đại Toàn - ${vid}`;

    // Cover
    let cover = '';
    const coverMatch = html.match(/src="([^"]+\.(?:jpg|png|jpeg|webp))"/i);
    if (coverMatch) {
      cover = coverMatch[1];
      if (cover.startsWith('//')) cover = 'https:' + cover;
    }

    // Intro
    let intro = '';
    const introMatch = html.match(/<div class="[^"]*desc[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (introMatch) {
      intro = introMatch[1].replace(/<[^>]+>/g, '').trim();
    }

    // Parse episode links
    const epLinks = [...html.matchAll(/href="([^"]*play\.php[^"]*)"[^>]*>([^<]+)<\/a>/g)];
    const episodes: ShortDramaEpisode[] = [];
    const seen = new Set<string>();

    let epIndex = 1;
    for (const m of epLinks) {
      const epHref = m[1];
      const epName = m[2].trim();

      if (seen.has(epHref)) continue;
      seen.add(epHref);

      const fullUrl = epHref.startsWith('http') ? epHref : `${this.siteUrl}/${epHref.replace(/^\//, '')}`;

      episodes.push({
        vid: fullUrl,
        vid_index: epIndex,
        title: epName || `Tập ${epIndex}`,
        cover,
        series_id: vid,
        series_title: title,
      });
      epIndex++;
    }

    if (episodes.length === 0) {
      episodes.push({
        vid: `${this.siteUrl}/play.php?vid=${vid}&ep=1`,
        vid_index: 1,
        title: 'Tập 1',
        cover,
        series_id: vid,
        series_title: title,
      });
    }

    return {
      provider_id: this.id,
      series_id: vid,
      series_title: title,
      cover,
      total: episodes.length,
      episodes,
      source: 'web',
      intro,
    };
  }

  public async fetchPlayUrl(vidUrl: string): Promise<{ url: string; spadeA?: string | null } | null> {
    const targetUrl = vidUrl.startsWith('http') ? vidUrl : `${this.siteUrl}/${vidUrl.replace(/^\//, '')}`;
    const res = await axios.get(targetUrl, {
      headers: { 'User-Agent': COMMON_UA, Referer: this.siteUrl },
      timeout: 10000,
    });

    const html: string = res.data;

    // Check player config or direct m3u8
    const m3u8Match = html.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
    if (m3u8Match) {
      return { url: m3u8Match[1].replace(/\\\//g, '/') };
    }

    const mp4Match = html.match(/(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/i);
    if (mp4Match) {
      return { url: mp4Match[1].replace(/\\\//g, '/') };
    }

    throw new Error(`Không tìm thấy link phát trên Đoản Kịch Đại Toàn: ${targetUrl}`);
  }
}
