import axios from 'axios';
import type { ShortDramaSeries, ShortDramaEpisode } from '../../../../types/shortDrama';
import type { ShortDramaProvider, ShortDramaPlayInfo } from './types';

const GENERIC_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export class GenericWebProvider implements ShortDramaProvider {
  public id = 'generic';
  public name = 'Trang Web / M3U8 / MP4 Trực tiếp';
  public badge = 'Universal Web';

  public canHandle(input: string): boolean {
    return /^https?:\/\//i.test(String(input || '').trim());
  }

  public async resolve(input: string): Promise<ShortDramaSeries> {
    const trimmed = String(input || '').trim();
    const urlMatch = trimmed.match(/https?:\/\/[^\s]+/);
    const targetUrl = urlMatch ? urlMatch[0] : trimmed;

    // Support AppleCMS V10 / Lziapi detail URLs directly
    if (targetUrl.includes('api.php/provide/vod') || targetUrl.includes('ids=')) {
      try {
        const res = await axios.get(targetUrl, {
          headers: { 'User-Agent': GENERIC_UA },
          timeout: 10000,
        });
        const vod = res.data?.list?.[0];
        if (vod && vod.vod_play_url) {
          const segments = vod.vod_play_url.split('#');
          const episodes: ShortDramaEpisode[] = [];
          for (let i = 0; i < segments.length; i++) {
            const seg = segments[i].trim();
            if (!seg) continue;
            const parts = seg.split('$');
            const epTitle = parts.length > 1 ? parts[0] : `Tập ${i + 1}`;
            const epUrl = parts.length > 1 ? parts[1] : parts[0];
            episodes.push({
              vid: epUrl,
              vid_index: i + 1,
              title: epTitle,
              series_id: String(vod.vod_id),
              series_title: vod.vod_name,
            });
          }
          return {
            provider_id: this.id,
            series_id: String(vod.vod_id),
            series_title: vod.vod_name,
            cover: vod.vod_pic || '',
            total: episodes.length,
            episodes,
            source: 'api',
            intro: `${vod.vod_remarks || ''} ${vod.vod_actor ? `| Diễn viên: ${vod.vod_actor}` : ''}`,
            tags: [vod.type_name, 'Phim ngắn'].filter(Boolean),
          };
        }
      } catch (err: any) {
        console.warn('[GenericWebProvider] AppleCMS resolution failed:', err.message);
      }
    }

    // Check if direct MP4 or M3U8 link
    if (/\.(mp4|mkv|mov|webm|m4v)(\?.*)?$/i.test(targetUrl)) {
      const filename = targetUrl.split('/').pop()?.split('?')[0] || 'video.mp4';
      const title = decodeURIComponent(filename).replace(/\.[^.]+$/, '');
      const ep: ShortDramaEpisode = {
        vid: targetUrl,
        vid_index: 1,
        title,
        series_id: `web_${Date.now()}`,
        series_title: title,
      };
      return {
        provider_id: this.id,
        series_id: ep.series_id,
        series_title: title,
        cover: '',
        total: 1,
        episodes: [ep],
        source: 'web',
      };
    }

    // Try fetching HTML to parse page title and video elements
    let html = '';
    let finalUrl = targetUrl;
    try {
      const res = await axios.get(targetUrl, {
        headers: {
          'User-Agent': GENERIC_UA,
          Referer: targetUrl,
        },
        timeout: 20000,
        maxRedirects: 10,
      });
      finalUrl = res.request?.res?.responseUrl || res.config?.url || targetUrl;
      html = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    } catch (err: any) {
      console.warn('[GenericWebProvider] Fetch failed:', err.message);
    }

    // Extract title
    let title = '';
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) {
      title = titleMatch[1].replace(/[-_|].*$/, '').trim();
    }
    if (!title) {
      title = `Web_Video_${new URL(finalUrl).hostname}`;
    }

    // Extract cover
    let cover = '';
    const ogImg = html.match(/<meta property="og:image" content="([^"]+)"/i);
    if (ogImg) cover = ogImg[1];

    // Search for video links in page
    const episodes: ShortDramaEpisode[] = [];
    const videoMatches = Array.from(
      html.matchAll(/(?:href|src|source|data-url)="([^"]+\.(?:mp4|m3u8)[^"]*)"/gi)
    );

    const seen = new Set<string>();
    let idx = 1;
    for (const m of videoMatches) {
      let u = m[1].replace(/\\u002F/g, '/');
      if (u.startsWith('//')) u = 'https:' + u;
      else if (u.startsWith('/')) {
        const origin = new URL(finalUrl).origin;
        u = origin + u;
      }
      if (!seen.has(u)) {
        seen.add(u);
        episodes.push({
          vid: u,
          vid_index: idx,
          title: `Tập ${idx}`,
          series_id: `web_${idx}`,
          series_title: title,
          cover,
        });
        idx++;
      }
    }

    // Fallback: Single episode pointing to finalUrl
    if (episodes.length === 0) {
      episodes.push({
        vid: finalUrl,
        vid_index: 1,
        title,
        series_id: `web_1`,
        series_title: title,
        cover,
      });
    }

    return {
      provider_id: this.id,
      series_id: `web_${Date.now()}`,
      series_title: title,
      cover,
      total: episodes.length,
      episodes,
      source: 'web',
      tags: ['Web', 'Video'],
      intro: `Video trích xuất từ trang web ${finalUrl}`,
    };
  }

  public async fetchPlayUrl(vid: string): Promise<ShortDramaPlayInfo | null> {
    if (/^https?:\/\//i.test(vid)) {
      let targetUrl = vid;

      // Extract direct m3u8 from share pages (e.g. /share/... or player HTML)
      if (vid.includes('/share/')) {
        try {
          const res = await axios.get(vid, {
            headers: { 'User-Agent': GENERIC_UA },
            timeout: 10000,
          });
          const match = res.data.match(/var\s+main\s*=\s*["']([^"']+)["']/);
          if (match && match[1]) {
            const parsed = new URL(vid);
            const m3u8Path = match[1].startsWith('/') ? match[1] : `/${match[1]}`;
            targetUrl = `${parsed.origin}${m3u8Path}`;
          }
        } catch (err: any) {
          console.warn('[GenericWebProvider] Share extract failed, using fallback:', err.message);
        }
      }

      return {
        url: targetUrl,
        spadeA: null,
        headers: {
          'User-Agent': GENERIC_UA,
        },
      };
    }
    return null;
  }
}
