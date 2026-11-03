import axios from 'axios';
import type { ShortDramaSeries, ShortDramaEpisode } from '../../../../types/shortDrama';
import type { ShortDramaProvider, ShortDramaPlayInfo } from './types';

const QIMAO_UA =
  'Mozilla/5.0 (Linux; Android 10; SM-G9750) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.152 Mobile Safari/537.36';

export class QimaoProvider implements ShortDramaProvider {
  public id = 'qimao';
  public name = 'Thất Miêu / 七猫短剧';
  public badge = 'Qimao (七猫)';

  public canHandle(input: string): boolean {
    const s = String(input || '').toLowerCase();
    return s.includes('qimao') || s.includes('七猫') || s.includes('wtzw.com');
  }

  public async resolve(input: string): Promise<ShortDramaSeries> {
    const trimmed = String(input || '').trim();

    // 1. Extract URL if mixed with share text
    const urlMatch = trimmed.match(/https?:\/\/[^\s]+/);
    const targetUrl = urlMatch ? urlMatch[0] : trimmed;

    let finalUrl = targetUrl;
    let htmlContent = '';

    if (/^https?:\/\//i.test(targetUrl)) {
      try {
        const res = await axios.get(targetUrl, {
          headers: {
            'User-Agent': QIMAO_UA,
            Referer: 'https://m.qimao.com/',
          },
          timeout: 20000,
          maxRedirects: 10,
        });
        finalUrl = res.request?.res?.responseUrl || res.config?.url || targetUrl;
        htmlContent = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      } catch (err: any) {
        // If HTTP fetch failed, fallback to parameter parsing
      }
    }

    // Try to extract drama ID
    let dramaId = '';
    const idMatch =
      finalUrl.match(/(?:drama_id|book_id|id)[/=](\d+)/) ||
      finalUrl.match(/\/drama\/(\d+)/) ||
      trimmed.match(/(\d{5,})/);
    if (idMatch) {
      dramaId = idMatch[1];
    } else {
      dramaId = `qm_${Date.now()}`;
    }

    // Try to extract title from HTML or share text
    let title = '';
    const titleFromHtml = htmlContent.match(/<title>([^<]+)<\/title>/i);
    if (titleFromHtml) {
      title = titleFromHtml[1].replace(/[-_].*$/, '').trim();
    }
    if (!title) {
      const shareTitleMatch = trimmed.match(/《([^》]+)》/);
      if (shareTitleMatch) title = shareTitleMatch[1];
    }
    if (!title) title = `七猫短剧_${dramaId}`;

    // Try to extract cover
    let cover = '';
    const coverMatch =
      htmlContent.match(/"cover(?:_url)?"\s*:\s*"([^"]+)"/) ||
      htmlContent.match(/<meta property="og:image" content="([^"]+)"/i);
    if (coverMatch) {
      cover = coverMatch[1].replace(/\\u002F/g, '/');
    }

    // Extract episodes from HTML if available (e.g. video list or episode tabs)
    const episodes: ShortDramaEpisode[] = [];
    const videoMatches = Array.from(
      htmlContent.matchAll(/"(?:play_url|video_url|url)"\s*:\s*"([^"]+\.mp4[^"]*)"/gi)
    );

    if (videoMatches.length > 0) {
      videoMatches.forEach((m, idx) => {
        const directUrl = m[1].replace(/\\u002F/g, '/');
        episodes.push({
          vid: directUrl,
          vid_index: idx + 1,
          title: `Tập ${idx + 1}`,
          series_id: dramaId,
          series_title: title,
          cover,
        });
      });
    }

    // If web page only returned single/first episode, check episode count from meta
    if (episodes.length === 0) {
      const countMatch =
        htmlContent.match(/"(?:episode_count|total_count|total)"\s*:\s*(\d+)/) ||
        trimmed.match(/共(\d+)集/);
      const totalCount = countMatch ? parseInt(countMatch[1], 10) : 50;

      for (let i = 1; i <= Math.min(totalCount, 150); i++) {
        episodes.push({
          vid: `qimao_${dramaId}_${i}`,
          vid_index: i,
          title: `Tập ${i}`,
          series_id: dramaId,
          series_title: title,
          cover,
        });
      }
    }

    return {
      provider_id: this.id,
      series_id: dramaId,
      series_title: title,
      cover,
      total: episodes.length,
      episodes,
      source: 'web',
      tags: ['七猫', '短剧', '都市', '逆袭'],
      intro: `Phim ngắn từ nền tảng Thất Miêu (七猫短剧). Tổng số ${episodes.length} tập.`,
    };
  }

  public async fetchPlayUrl(vid: string, extra?: any): Promise<ShortDramaPlayInfo | null> {
    // If vid is already a direct http URL
    if (/^https?:\/\//i.test(vid)) {
      return {
        url: vid,
        spadeA: null,
        headers: {
          'User-Agent': QIMAO_UA,
          Referer: 'https://m.qimao.com/',
        },
      };
    }

    // Fallback: Check if extra passed direct URL or query public CDN
    if (extra?.url) {
      return {
        url: extra.url,
        spadeA: null,
        headers: {
          'User-Agent': QIMAO_UA,
          Referer: 'https://m.qimao.com/',
        },
      };
    }

    return null;
  }
}
