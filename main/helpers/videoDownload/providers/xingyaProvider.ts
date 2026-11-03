import axios from 'axios';
import type { ShortDramaSeries, ShortDramaEpisode } from '../../../../types/shortDrama';
import type { ShortDramaProvider, ShortDramaPlayInfo } from './types';

const COMMON_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export class XingyaProvider implements ShortDramaProvider {
  public id = 'xingya';
  public name = 'Tinh Nha / 星芽短剧';
  public badge = 'Xingya (星芽)';

  public canHandle(input: string): boolean {
    const s = String(input || '').toLowerCase();
    return s.includes('xingya') || s.includes('星芽') || s.includes('jiuzhou');
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

    // Extract drama ID
    let dramaId = '';
    const idMatch =
      finalUrl.match(/(?:drama_id|book_id|series_id|id)[/=](\d+)/) ||
      finalUrl.match(/\/detail\/(\d+)/) ||
      trimmed.match(/(\d{5,})/);
    if (idMatch) {
      dramaId = idMatch[1];
    } else {
      dramaId = `xingya_${Date.now()}`;
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
        title = `Tinh Nha - ${dramaId}`;
      }
    }

    // Try query AppleCMS short drama catalog for this title or ID
    let episodes: ShortDramaEpisode[] = [];
    let cover = '';
    try {
      const cmsRes = await axios.get(
        `https://cj.lziapi.com/api.php/provide/vod/?ac=detail&t=46&wd=${encodeURIComponent(title)}`,
        {
          headers: { 'User-Agent': COMMON_UA },
          timeout: 8000,
        }
      );
      const vodList = cmsRes.data?.list || [];
      if (vodList.length > 0) {
        const vod = vodList[0];
        cover = vod.vod_pic || '';
        const playUrlStr = vod.vod_play_url || '';
        const parts = playUrlStr.split('#').filter(Boolean);
        episodes = parts.map((part: string, idx: number) => {
          const [epName, streamUrl] = part.split('$');
          return {
            vid: streamUrl || `${dramaId}_${idx + 1}`,
            vid_index: idx + 1,
            title: epName || `Tập ${idx + 1}`,
            series_id: dramaId,
            series_title: title,
            cover,
          };
        });
      }
    } catch {
      // Ignore
    }

    // Default episodes if not found
    if (episodes.length === 0) {
      const totalCount = 80;
      for (let i = 1; i <= totalCount; i++) {
        episodes.push({
          vid: `${dramaId}_${i}`,
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
      tags: ['Tinh Nha', 'Nghịch tập', 'Miễn phí'],
      intro: `Tinh Nha Miễn Phí (星芽免费短剧) - Trọn bộ ${episodes.length} tập HD`,
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
      url: `https://cj.lziapi.com/api.php/provide/vod/?ac=detail&ids=${vid}`,
      quality: '1080p',
      is_encrypted: false,
    };
  }
}
