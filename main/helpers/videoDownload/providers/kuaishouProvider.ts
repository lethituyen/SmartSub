import axios from 'axios';
import type { ShortDramaSeries, ShortDramaEpisode } from '../../../../types/shortDrama';
import type { ShortDramaProvider, ShortDramaPlayInfo } from './types';

const KUAISHOU_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export class KuaishouProvider implements ShortDramaProvider {
  public id = 'kuaishou';
  public name = 'Kuaishou / 快手短剧';
  public badge = 'Kuaishou (快手)';

  public canHandle(input: string): boolean {
    const s = String(input || '').toLowerCase();
    return s.includes('kuaishou.com') || s.includes('kwai.com') || s.includes('快手');
  }

  public async resolve(input: string): Promise<ShortDramaSeries> {
    const trimmed = String(input || '').trim();

    // 1. Extract URL
    const urlMatch = trimmed.match(/https?:\/\/[^\s]+/);
    const targetUrl = urlMatch ? urlMatch[0] : trimmed;

    // Follow redirect if short URL
    let finalUrl = targetUrl;
    let html = '';

    try {
      const res = await axios.get(targetUrl, {
        headers: {
          'User-Agent': KUAISHOU_UA,
          Referer: 'https://www.kuaishou.com/',
        },
        timeout: 20000,
        maxRedirects: 10,
      });
      finalUrl = res.request?.res?.responseUrl || res.config?.url || targetUrl;
      html = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    } catch (err: any) {
      console.warn('[KuaishouProvider] HTTP fetch failed:', err.message);
    }

    // Try to extract series/collection ID and title
    let seriesId = '';
    const idMatch =
      finalUrl.match(/short-video\/([a-zA-Z0-9_-]+)/) ||
      finalUrl.match(/photoId=([a-zA-Z0-9_-]+)/) ||
      trimmed.match(/([0-9]{8,})/);
    if (idMatch) {
      seriesId = idMatch[1];
    } else {
      seriesId = `ks_${Date.now()}`;
    }

    // Extract title
    let title = '';
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) {
      title = titleMatch[1].replace(/[-_].*$/, '').trim();
    }
    if (!title) {
      const shareTitleMatch = trimmed.match(/【([^】]+)】/) || trimmed.match(/《([^》]+)》/);
      if (shareTitleMatch) title = shareTitleMatch[1];
    }
    if (!title) title = `快手短剧_${seriesId}`;

    // Extract cover
    let cover = '';
    const coverMatch =
      html.match(/"poster"\s*:\s*"([^"]+)"/) ||
      html.match(/"coverUrl"\s*:\s*"([^"]+)"/) ||
      html.match(/<meta property="og:image" content="([^"]+)"/i);
    if (coverMatch) {
      cover = coverMatch[1].replace(/\\u002F/g, '/');
    }

    // Extract video episodes
    const episodes: ShortDramaEpisode[] = [];

    // Look for video stream URLs in page model/SSR JSON
    const playUrls = Array.from(
      html.matchAll(/"(?:playUrl|srcNoMark|url)"\s*:\s*"(https?:\/\/[^"]+\.mp4[^"]*)"/gi)
    );

    if (playUrls.length > 0) {
      // De-duplicate URLs
      const seen = new Set<string>();
      let epIdx = 1;
      for (const m of playUrls) {
        const u = m[1].replace(/\\u002F/g, '/');
        if (!seen.has(u)) {
          seen.add(u);
          episodes.push({
            vid: u,
            vid_index: epIdx,
            title: `Tập ${epIdx}`,
            series_id: seriesId,
            series_title: title,
            cover,
          });
          epIdx++;
        }
      }
    }

    // Fallback: If single video page, generate episode 1
    if (episodes.length === 0) {
      episodes.push({
        vid: finalUrl,
        vid_index: 1,
        title: title,
        series_id: seriesId,
        series_title: title,
        cover,
      });
    }

    return {
      provider_id: this.id,
      series_id: seriesId,
      series_title: title,
      cover,
      total: episodes.length,
      episodes,
      source: 'web',
      tags: ['快手', '短剧', 'Kuaishou'],
      intro: `Phim ngắn từ nền tảng Kuaishou (快手小剧场).`,
    };
  }

  public async fetchPlayUrl(vid: string): Promise<ShortDramaPlayInfo | null> {
    if (/^https?:\/\//i.test(vid)) {
      return {
        url: vid,
        spadeA: null,
        headers: {
          'User-Agent': KUAISHOU_UA,
          Referer: 'https://www.kuaishou.com/',
        },
      };
    }
    return null;
  }
}
