import axios from 'axios';
import type { ShortDramaSeries, ShortDramaEpisode } from '../../../../types/shortDrama';
import type { ShortDramaProvider, ShortDramaPlayInfo } from './types';

const DOUYIN_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export class DouyinProvider implements ShortDramaProvider {
  public id = 'douyin';
  public name = 'Douyin / 抖音短剧';
  public badge = 'Douyin (抖音)';

  public canHandle(input: string): boolean {
    const s = String(input || '').toLowerCase();
    return s.includes('douyin.com') || s.includes('iesdouyin.com') || s.includes('抖音');
  }

  public async resolve(input: string): Promise<ShortDramaSeries> {
    const trimmed = String(input || '').trim();

    // 1. Extract URL
    const urlMatch = trimmed.match(/https?:\/\/[^\s]+/);
    const targetUrl = urlMatch ? urlMatch[0] : trimmed;

    let finalUrl = targetUrl;
    let html = '';

    try {
      const res = await axios.get(targetUrl, {
        headers: {
          'User-Agent': DOUYIN_UA,
          Referer: 'https://www.douyin.com/',
        },
        timeout: 20000,
        maxRedirects: 10,
      });
      finalUrl = res.request?.res?.responseUrl || res.config?.url || targetUrl;
      html = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    } catch (err: any) {
      console.warn('[DouyinProvider] HTTP fetch failed:', err.message);
    }

    // Try to extract series or collection or video ID
    let seriesId = '';
    const colMatch =
      finalUrl.match(/collection\/([0-9]+)/) ||
      finalUrl.match(/video\/([0-9]+)/) ||
      finalUrl.match(/modal_id=([0-9]+)/) ||
      trimmed.match(/([0-9]{15,})/);
    if (colMatch) {
      seriesId = colMatch[1];
    } else {
      seriesId = `dy_${Date.now()}`;
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
    if (!title) title = `抖音短剧_${seriesId}`;

    // Extract cover
    let cover = '';
    const coverMatch =
      html.match(/"cover(?:_url)?"\s*:\s*"([^"]+)"/) ||
      html.match(/<meta property="og:image" content="([^"]+)"/i);
    if (coverMatch) {
      cover = coverMatch[1].replace(/\\u002F/g, '/');
    }

    // Extract episodes from playUrls / SSR JSON
    const episodes: ShortDramaEpisode[] = [];
    const playUrls = Array.from(
      html.matchAll(/"(?:play_addr|video_url|playApi|url)"\s*:\s*"(https?:\/\/[^"]+\.mp4[^"]*)"/gi)
    );

    if (playUrls.length > 0) {
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

    // If single video
    if (episodes.length === 0) {
      episodes.push({
        vid: finalUrl,
        vid_index: 1,
        title,
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
      tags: ['抖音', '短剧', 'Douyin'],
      intro: `Phim ngắn / video từ nền tảng Douyin (抖音).`,
    };
  }

  public async fetchPlayUrl(vid: string): Promise<ShortDramaPlayInfo | null> {
    if (/^https?:\/\//i.test(vid)) {
      return {
        url: vid,
        spadeA: null,
        headers: {
          'User-Agent': DOUYIN_UA,
          Referer: 'https://www.douyin.com/',
        },
      };
    }
    return null;
  }
}
