import type { ShortDramaSeries } from '../../../../types/shortDrama';
import type { ShortDramaProvider, ShortDramaPlayInfo } from './types';
import {
  resolveSeriesId,
  fetchEpisodeList,
  fetchPlayUrlSingle,
  HONGGUO_UA,
  HONGGUO_VIDEO_REFERER,
} from '../hongguo/hongguoService';

export class HongguoProvider implements ShortDramaProvider {
  public id = 'hongguo';
  public name = 'Hồng Quả / 番茄短剧';
  public badge = 'Hongguo (CENC DRM)';

  public canHandle(input: string): boolean {
    const s = String(input || '').toLowerCase();
    if (s.includes('fanqienovel.com') || s.includes('hongguoduanju.com') || s.includes('fqnovel.com')) {
      return true;
    }
    if (s.includes('番茄') || s.includes('红果') || s.includes('novelread')) {
      return true;
    }
    // 18-19 digit IDs are typically Hongguo series IDs
    if (/^\d{17,20}$/.test(s.trim())) {
      return true;
    }
    return false;
  }

  public async resolve(input: string): Promise<ShortDramaSeries> {
    const seriesId = await resolveSeriesId(input);
    if (!seriesId) {
      throw new Error('Không tìm thấy series_id của Hồng Quả');
    }
    return fetchEpisodeList(seriesId);
  }

  public async fetchPlayUrl(vid: string): Promise<ShortDramaPlayInfo | null> {
    const info = await fetchPlayUrlSingle(vid);
    if (!info) return null;
    return {
      url: info.url,
      spadeA: info.spadeA,
      codec: info.codec,
      headers: {
        'User-Agent': HONGGUO_UA,
        Referer: HONGGUO_VIDEO_REFERER,
      },
      source: info.source,
    };
  }
}
