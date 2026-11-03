import axios from 'axios';
import type { ShortDramaSeries, ShortDramaEpisode } from '../../../../types/shortDrama';
import type { ShortDramaProvider, ShortDramaPlayInfo } from './types';

const COMMON_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export class XiguaProvider implements ShortDramaProvider {
  public id = 'xigua';
  public name = 'Tây Qua / 西瓜视频';
  public badge = 'Xigua (西瓜)';

  public canHandle(input: string): boolean {
    const s = String(input || '').toLowerCase();
    return s.includes('xigua') || s.includes('ixigua') || s.includes('西瓜');
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
            'User-Agent': COMMON_UA,
          },
          timeout: 20000,
          maxRedirects: 10,
        });
        finalUrl = res.request?.res?.responseUrl || res.config?.url || targetUrl;
        htmlContent = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      } catch {
        // Fallback to parameter parsing
      }
    }

    // Extract drama / video ID
    let dramaId = '';
    const idMatch =
      finalUrl.match(/(?:item_id|video_id|id)[/=](\d+)/) ||
      finalUrl.match(/\/(\d{10,})/) ||
      trimmed.match(/(\d{8,})/);
    if (idMatch) {
      dramaId = idMatch[1];
    } else {
      dramaId = `xg_${Date.now()}`;
    }

    // Extract title from HTML or share text
    let title = '';
    const titleFromHtml = htmlContent.match(/<title>([^<]+)<\/title>/i);
    if (titleFromHtml) {
      title = titleFromHtml[1].replace(/[-_].*$/, '').trim();
    }
    if (!title) {
      const titleFromShare = trimmed.match(/《([^》]+)》/) || trimmed.match(/【([^】]+)】/);
      if (titleFromShare) {
        title = titleFromShare[1].trim();
      } else {
        title = `Tây Qua Phim - ${dramaId}`;
      }
    }

    // Default episodes
    const episodes: ShortDramaEpisode[] = [];
    const totalCount = 1;
    for (let i = 1; i <= totalCount; i++) {
      episodes.push({
        vid: `${dramaId}_${i}`,
        vid_index: i,
        title: title || `Tập ${i}`,
        series_id: dramaId,
        series_title: title,
      });
    }

    return {
      provider_id: this.id,
      series_id: dramaId,
      series_title: title,
      cover: '',
      total: episodes.length,
      episodes,
      source: 'web',
      tags: ['Tây Qua', 'ByteDance', 'Video'],
      intro: `Tây Qua Video (西瓜视频) - ${title}`,
    };
  }

  public async fetchPlayUrl(vid: string, extra?: any): Promise<ShortDramaPlayInfo | null> {
    if (vid && /^https?:\/\//i.test(vid)) {
      return {
        url: vid,
        quality: '1080p',
        is_encrypted: false,
      };
    }

    return {
      url: `https://www.ixigua.com/${vid}`,
      quality: '1080p',
      is_encrypted: false,
    };
  }
}
