/**
 * 28 Đoản Kịch / Ngưu Ngưu (28短剧 / 牛牛短剧 - 28dj01.com) Provider
 */

import axios from 'axios';
import type { ShortDramaSeries, ShortDramaEpisode } from '../../../../types/shortDrama';
import type { ShortDramaProvider } from './types';

const COMMON_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export class Niuniu28Provider implements ShortDramaProvider {
  public readonly id = 'niuniu28';
  public readonly name = '28 Đoản Kịch (28短剧)';
  public readonly badge = '28 Đoản Kịch';
  public readonly siteUrl = 'https://28dj01.com';

  public canHandle(input: string): boolean {
    return this.matches(input);
  }

  public matches(input: string): boolean {
    const s = (input || '').toLowerCase();
    return s.includes('28dj01.com') || s.includes('28短剧') || s.includes('牛牛短剧');
  }

  public async resolve(input: string): Promise<ShortDramaSeries> {
    const trimmed = (input || '').trim();

    let vid = '';
    const vidMatch =
      trimmed.match(/\/voddetail\/(\d+)\.html/) ||
      trimmed.match(/\/vodplay\/(\d+)-/) ||
      trimmed.match(/^\d+$/);

    if (vidMatch) {
      vid = vidMatch[1] || vidMatch[0];
    }

    if (!vid) {
      const keyword = trimmed.replace(/《([^》]+)》/, '$1').trim();
      const searchedVid = await this.searchDrama(keyword);
      if (searchedVid) vid = searchedVid;
    }

    if (!vid) {
      throw new Error(`Không tìm thấy phim trên 28 Đoản Kịch: ${trimmed}`);
    }

    return this.fetchDetail(vid);
  }

  public async searchDrama(keyword: string): Promise<string | null> {
    try {
      const encoded = encodeURIComponent(keyword.trim());
      const searchUrl = `${this.siteUrl}/vodsearch/${encoded}-------------.html`;
      const res = await axios.get(searchUrl, {
        headers: { 'User-Agent': COMMON_UA, Referer: this.siteUrl },
        timeout: 8000,
      });

      const match = res.data.match(/<a\s+href="\/voddetail\/(\d+)\.html"/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  public async fetchDetail(vid: string): Promise<ShortDramaSeries> {
    const detailUrl = `${this.siteUrl}/voddetail/${vid}.html`;
    const res = await axios.get(detailUrl, {
      headers: { 'User-Agent': COMMON_UA, Referer: this.siteUrl },
      timeout: 10000,
    });

    const html: string = res.data;

    let title = '';
    const titleMatch =
      html.match(/<h1[^>]*>(.*?)<\/h1>/i) ||
      html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) {
      title = titleMatch[1].replace(/<[^>]+>/g, '').split('-')[0].trim();
    }
    if (!title) title = `28 Đoản Kịch - ${vid}`;

    let cover = '';
    const coverMatch = html.match(/data-original="([^"]+)"/i) || html.match(/src="([^"]+\.jpg)"/i);
    if (coverMatch) {
      cover = coverMatch[1];
      if (cover.startsWith('//')) cover = 'https:' + cover;
    }

    const epLinks = [...html.matchAll(/<a\s+href="(\/vodplay\/[^"]+)"[^>]*>([^<]+)<\/a>/g)];
    const episodes: ShortDramaEpisode[] = [];
    const seen = new Set<string>();

    let epIndex = 1;
    for (const m of epLinks) {
      const href = m[1];
      const epName = m[2].trim();

      if (seen.has(href)) continue;
      seen.add(href);

      episodes.push({
        vid: `${this.siteUrl}${href}`,
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
        vid: `${this.siteUrl}/vodplay/${vid}-1-1.html`,
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
    };
  }

  public async fetchPlayUrl(vidUrl: string): Promise<{ url: string; spadeA?: string | null } | null> {
    const targetUrl = vidUrl.startsWith('http') ? vidUrl : `${this.siteUrl}${vidUrl}`;
    const res = await axios.get(targetUrl, {
      headers: { 'User-Agent': COMMON_UA, Referer: this.siteUrl },
      timeout: 10000,
    });

    const html: string = res.data;

    const playerMatch = html.match(/var\s+player_aaaa\s*=\s*({[^;]+});?/i);
    if (playerMatch) {
      try {
        const config = JSON.parse(playerMatch[1]);
        if (config.url && typeof config.url === 'string') {
          let real = config.url.replace(/\\\//g, '/').trim();
          if (real.startsWith('//')) real = 'https:' + real;
          if (real.startsWith('http')) return { url: real };
        }
      } catch {}
    }

    const m3u8Match = html.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
    if (m3u8Match) {
      return { url: m3u8Match[1].replace(/\\\//g, '/') };
    }

    const mp4Match = html.match(/(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/i);
    if (mp4Match) {
      return { url: mp4Match[1].replace(/\\\//g, '/') };
    }

    throw new Error(`Không tìm thấy link phát trên 28 Đoản Kịch: ${targetUrl}`);
  }
}
