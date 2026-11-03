/**
 * Đoản Kịch Ba Sĩ (短剧巴士 - duanju84.com) Provider
 *
 * One of the most popular short drama aggregation platforms in TVBox:
 * - High-speed Cloudflare Global CDN (accessible smoothly from Vietnam)
 * - Clean direct M3U8/MP4 streams from major clusters (Bfzy, Liangzi, Feifan, Tiantian, etc.)
 * - Full 80-100+ episodes without payment or ads
 */

import axios from 'axios';
import type { ShortDramaSeries, ShortDramaEpisode } from '../../../../types/shortDrama';
import type { ShortDramaProvider } from './types';

const COMMON_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export class Duanju84Provider implements ShortDramaProvider {
  public readonly id = 'duanju84';
  public readonly name = 'Đoản Kịch Ba Sĩ (短剧巴士)';
  public readonly badge = 'Ba Sĩ (巴士)';
  public readonly siteUrl = 'https://www.duanju84.com';

  public canHandle(input: string): boolean {
    return this.matches(input);
  }

  public matches(input: string): boolean {
    const s = (input || '').toLowerCase();
    return (
      s.includes('duanju84.com') ||
      s.includes('duanju84') ||
      s.includes('短剧巴士') ||
      s.includes('dj84')
    );
  }

  public async resolve(input: string): Promise<ShortDramaSeries> {
    const trimmed = (input || '').trim();

    // 1. Extract vid
    let vid = '';
    const vidMatch =
      trimmed.match(/\/duanju\/(\d+)\.html/) ||
      trimmed.match(/\/djplay\/(\d+)-/) ||
      trimmed.match(/^\d+$/);

    if (vidMatch) {
      vid = vidMatch[1] || vidMatch[0];
    }

    // 2. If not a direct URL/ID, search by title
    if (!vid) {
      const searchTitle = trimmed.replace(/《([^》]+)》/, '$1').trim();
      const searchedVid = await this.searchDrama(searchTitle);
      if (searchedVid) {
        vid = searchedVid;
      }
    }

    if (!vid) {
      throw new Error(`Không tìm thấy phim trên Đoản Kịch Ba Sĩ: ${trimmed}`);
    }

    return this.fetchDetail(vid);
  }

  /**
   * Search for drama and return the first matching vid
   */
  public async searchDrama(keyword: string): Promise<string | null> {
    try {
      const encoded = encodeURIComponent(keyword.trim());
      // MacCMS search route: /search/{wd}----------1---.html
      const searchUrl = `${this.siteUrl}/search/${encoded}----------1---.html`;
      const res = await axios.get(searchUrl, {
        headers: { 'User-Agent': COMMON_UA, Referer: this.siteUrl },
        timeout: 8000,
      });

      const match = res.data.match(/<a\s+href="\/duanju\/(\d+)\.html"/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  /**
   * Fetch full detail and episode playlist
   */
  public async fetchDetail(vid: string): Promise<ShortDramaSeries> {
    const detailUrl = `${this.siteUrl}/duanju/${vid}.html`;
    const res = await axios.get(detailUrl, {
      headers: { 'User-Agent': COMMON_UA, Referer: this.siteUrl },
      timeout: 10000,
    });

    const html: string = res.data;

    // Title
    let title = '';
    const titleMatch =
      html.match(/<div class="detail-title[^"]*"[^>]*>\s*<h1[^>]*>(.*?)<\/h1>/i) ||
      html.match(/<title>(.*?)<\/title>/i);
    if (titleMatch) {
      title = titleMatch[1].replace(/<[^>]+>/g, '').split('-')[0].trim();
    }
    if (!title) title = `Đoản Kịch - ${vid}`;

    // Cover
    let cover = '';
    const coverMatch =
      html.match(/data-original="([^"]+)"/i) ||
      html.match(/src="([^"]+\.jpg)"/i);
    if (coverMatch) {
      cover = coverMatch[1];
      if (cover.startsWith('//')) cover = 'https:' + cover;
    }

    // Intro
    let intro = '';
    const introMatch = html.match(/<div class="content-info[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (introMatch) {
      intro = introMatch[1].replace(/<[^>]+>/g, '').trim();
    }

    // Episodes
    // Pull /djplay/{vid}-1-1.html to get all lines and episodes
    const playPageUrl = `${this.siteUrl}/djplay/${vid}-1-1.html`;
    let episodes: ShortDramaEpisode[] = [];

    try {
      const playRes = await axios.get(playPageUrl, {
        headers: { 'User-Agent': COMMON_UA, Referer: detailUrl },
        timeout: 10000,
      });
      const phtml: string = playRes.data;

      // Extract all djplay links
      const epLinks = [...phtml.matchAll(/<a\s+href="(\/djplay\/[^"]+)"[^>]*>([^<]+)<\/a>/g)];
      const seen = new Set<string>();

      let epIndex = 1;
      for (const m of epLinks) {
        const epHref = m[1];
        const epName = m[2].trim();

        if (seen.has(epHref)) continue;
        seen.add(epHref);

        episodes.push({
          vid: `${this.siteUrl}${epHref}`,
          vid_index: epIndex,
          title: epName || `Tập ${epIndex}`,
          cover,
          series_id: vid,
          series_title: title,
        });
        epIndex++;
      }
    } catch (err: any) {
      console.warn(`[Duanju84Provider] Failed to fetch play page: ${err.message}`);
    }

    // Fallback: If no episodes from play page, create at least episode 1
    if (episodes.length === 0) {
      episodes.push({
        vid: `${this.siteUrl}/djplay/${vid}-1-1.html`,
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

  /**
   * Fetch direct stream URL for an episode
   */
  public async fetchPlayUrl(vidUrl: string): Promise<{ url: string; spadeA?: string | null } | null> {
    const targetUrl = vidUrl.startsWith('http') ? vidUrl : `${this.siteUrl}${vidUrl}`;
    const res = await axios.get(targetUrl, {
      headers: { 'User-Agent': COMMON_UA, Referer: this.siteUrl },
      timeout: 10000,
    });

    const html: string = res.data;

    // 1. Check player_aaaa JSON
    const playerMatch = html.match(/var\s+player_aaaa\s*=\s*({[^;]+});?/i);
    if (playerMatch) {
      try {
        const config = JSON.parse(playerMatch[1]);
        if (config.url && typeof config.url === 'string') {
          let real = config.url.replace(/\\\//g, '/').trim();
          if (real.startsWith('//')) real = 'https:' + real;
          if (real.startsWith('http')) {
            return { url: real };
          }
        }
      } catch {}
    }

    // 2. Direct regex for .m3u8 or .mp4
    const m3u8Match = html.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
    if (m3u8Match) {
      return { url: m3u8Match[1].replace(/\\\//g, '/') };
    }

    const mp4Match = html.match(/(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/i);
    if (mp4Match) {
      return { url: mp4Match[1].replace(/\\\//g, '/') };
    }

    throw new Error(`Không tìm thấy link video trên Đoản Kịch Ba Sĩ: ${targetUrl}`);
  }
}
