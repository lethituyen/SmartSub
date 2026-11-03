/**
 * Hà Mã Kịch Trường (河马剧场 / 点众科技 Dianzhong) Provider
 *
 * Implements:
 * 1. Official Next.js SSR Scraper from kuaikaw.cn (__NEXT_DATA__ bookInfoVo + chapterList)
 *    Referenced from TVBox spider: [短]河马剧场.py
 * 2. Automatic extraction of chapterVideoVo: mp4 / mp4720p / vodMp4Url
 * 3. Fallback to open short drama resolver if kuaikaw.cn is blocked by Yundun WAF outside China
 */

import axios from 'axios';
import type { ShortDramaSeries, ShortDramaEpisode } from '../../../../types/shortDrama';
import type { ShortDramaProvider } from './types';

const COMMON_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export class HemaProvider implements ShortDramaProvider {
  public readonly id = 'hema';
  public readonly name = 'Hà Mã Kịch Trường (河马剧场)';
  public readonly badge = 'Hà Mã (河马)';
  public readonly siteUrl = 'https://www.kuaikaw.cn';

  public canHandle(input: string): boolean {
    return this.matches(input);
  }

  public matches(input: string): boolean {
    const s = (input || '').toLowerCase();
    return (
      s.includes('kuaikaw.cn') ||
      s.includes('hemajuchang') ||
      s.includes('hema') ||
      s.includes('河马') ||
      s.includes('dianzhong') ||
      s.includes('点众')
    );
  }

  /**
   * Resolve drama series from kuaikaw.cn or share text
   */
  public async resolve(input: string): Promise<ShortDramaSeries> {
    const trimmed = (input || '').trim();

    // 1. Extract dramaId / bookId
    let dramaId = '';
    const idMatch =
      trimmed.match(/(?:drama|bookId|id)=(\d+)/) ||
      trimmed.match(/\/drama\/(\d+)/) ||
      trimmed.match(/^\d+$/);

    if (idMatch) {
      dramaId = idMatch[1] || idMatch[0];
    }

    // 2. Extract title if user pasted share text or search keywords
    let title = '';
    const titleMatch = trimmed.match(/《([^》]+)》/) || trimmed.match(/【([^】]+)】/);
    if (titleMatch) {
      title = titleMatch[1].trim();
    } else if (!dramaId && !trimmed.startsWith('http')) {
      title = trimmed;
    }

    // 3. Try official kuaikaw.cn Next.js SSR first
    if (dramaId) {
      try {
        const kuaikawSeries = await this.fetchKuaikawDetail(dramaId);
        if (kuaikawSeries && kuaikawSeries.episodes.length > 0) {
          return kuaikawSeries;
        }
      } catch (err: any) {
        console.warn(`[HemaProvider] kuaikaw.cn fetch failed (${err.message}), trying fallback...`);
      }
    }

    // 4. If dramaId failed or only title is available, try fallback resolver
    const searchTarget = title || dramaId || '河马短剧';
    const fallbackSeries = await this.fetchFallbackSeries(searchTarget, dramaId);
    if (fallbackSeries && fallbackSeries.episodes.length > 0) {
      return fallbackSeries;
    }

    throw new Error(`Không thể tìm thấy phim Hà Mã: ${searchTarget}`);
  }

  /**
   * Fetch detail directly from official kuaikaw.cn Next.js SSR
   */
  private async fetchKuaikawDetail(dramaId: string): Promise<ShortDramaSeries | null> {
    const detailUrl = `${this.siteUrl}/drama/${dramaId}`;
    const res = await axios.get(detailUrl, {
      headers: {
        'User-Agent': COMMON_UA,
        Referer: this.siteUrl,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 6000,
    });

    const html = res.data;
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!nextDataMatch) return null;

    const json = JSON.parse(nextDataMatch[1]);
    const pageProps = json.props?.pageProps || {};
    const bookInfo = pageProps.bookInfoVo || {};
    const chapters = pageProps.chapterList || [];

    const seriesTitle = bookInfo.title || bookInfo.bookName || `Hà Mã Kịch - ${dramaId}`;
    const cover = bookInfo.coverWap || bookInfo.cover || '';
    const intro = bookInfo.introduction || bookInfo.summary || '';
    const total = bookInfo.totalChapterNum || chapters.length;

    const episodes: ShortDramaEpisode[] = chapters.map((ch: any, idx: number) => {
      const vidIndex = idx + 1;
      const chapterId = ch.chapterId || String(vidIndex);
      const epTitle = ch.chapterName || `Tập ${vidIndex}`;

      // Check if video link is already in chapterVideoVo
      let directUrl = '';
      if (ch.chapterVideoVo) {
        directUrl =
          ch.chapterVideoVo.mp4 ||
          ch.chapterVideoVo.mp4720p ||
          ch.chapterVideoVo.vodMp4Url ||
          '';
      }

      // If no direct URL, store composite vid for fetchPlayUrl: `${dramaId}$${chapterId}`
      const vid = directUrl ? directUrl : `${dramaId}$${chapterId}`;

      return {
        vid,
        vid_index: vidIndex,
        title: epTitle,
        cover,
        series_id: dramaId,
        series_title: seriesTitle,
      };
    });

    return {
      provider_id: this.id,
      series_id: dramaId,
      series_title: seriesTitle,
      cover,
      total: total || episodes.length,
      episodes,
      source: 'api',
      intro,
      tags: bookInfo.categoryList?.map((c: any) => c.name).filter(Boolean),
    };
  }

  /**
   * High-speed fallback resolver when kuaikaw.cn is unreachable or user only has title
   */
  private async fetchFallbackSeries(titleOrKeyword: string, preferredId?: string): Promise<ShortDramaSeries | null> {
    try {
      const cmsRes = await axios.get(
        `https://cj.lziapi.com/api.php/provide/vod/?ac=detail&t=46&wd=${encodeURIComponent(titleOrKeyword)}`,
        {
          headers: { 'User-Agent': COMMON_UA },
          timeout: 8000,
        }
      );

      const vodList = cmsRes.data?.list;
      if (!Array.isArray(vodList) || vodList.length === 0) {
        return null;
      }

      const item = vodList[0];
      const episodes: ShortDramaEpisode[] = [];
      const playUrlRaw: string = item.vod_play_url || '';
      const lines = playUrlRaw.split('$$$')[0] || playUrlRaw;
      const parts = lines.split('#');

      let epIdx = 1;
      for (const p of parts) {
        const [epTitle, streamUrl] = p.split('$');
        if (streamUrl && (streamUrl.startsWith('http://') || streamUrl.startsWith('https://'))) {
          episodes.push({
            vid: streamUrl.trim(),
            vid_index: epIdx,
            title: epTitle?.trim() || `Tập ${epIdx}`,
            cover: item.vod_pic || '',
            series_id: String(item.vod_id || preferredId || 'hema_fallback'),
            series_title: item.vod_name || titleOrKeyword,
          });
          epIdx++;
        }
      }

      if (episodes.length === 0) return null;

      return {
        provider_id: this.id,
        series_id: String(item.vod_id || preferredId || 'hema_fallback'),
        series_title: item.vod_name || titleOrKeyword,
        cover: item.vod_pic || '',
        total: episodes.length,
        episodes,
        source: 'web',
        intro: item.vod_content ? item.vod_content.replace(/<[^>]+>/g, '').trim() : undefined,
      };
    } catch {
      return null;
    }
  }

  /**
   * Fetch play url for a single episode
   */
  public async fetchPlayUrl(vid: string): Promise<{ url: string; spadeA?: string | null } | null> {
    // If vid is already a direct URL (from fallback or chapterVideoVo)
    if (vid.startsWith('http://') || vid.startsWith('https://')) {
      return { url: vid };
    }

    // If vid is composite: `${dramaId}$${chapterId}`
    if (vid.includes('$')) {
      const [dramaId, chapterId] = vid.split('$');
      const episodeUrl = `${this.siteUrl}/episode/${dramaId}/${chapterId}`;
      try {
        const res = await axios.get(episodeUrl, {
          headers: { 'User-Agent': COMMON_UA, Referer: this.siteUrl },
          timeout: 8000,
        });

        const html = res.data;
        const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
        if (nextDataMatch) {
          const json = JSON.parse(nextDataMatch[1]);
          const chapterInfo = json.props?.pageProps?.chapterInfo;
          if (chapterInfo?.chapterVideoVo) {
            const vo = chapterInfo.chapterVideoVo;
            const link = vo.mp4 || vo.mp4720p || vo.vodMp4Url;
            if (link) return { url: link };
          }
        }

        const mp4Matches = [...html.matchAll(/https?:\/\/[^"']+\.mp4/g)];
        if (mp4Matches.length > 0) {
          return { url: mp4Matches[0][0] };
        }
      } catch (err: any) {
        console.warn(`[HemaProvider] episode page fetch failed: ${err.message}`);
      }
    }

    throw new Error(`Không lấy được link phát cho tập Hà Mã: ${vid}`);
  }
}
