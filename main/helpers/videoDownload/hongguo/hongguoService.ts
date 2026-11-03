/**
 * Hongguo (红果短剧 / 番茄小说短剧 / novelread) Core Protocol & Decryption Engine
 *
 * Implements:
 * 1. Series link parsing & resolution
 * 2. Episode list retrieval (Official API with Web scraping fallback)
 * 3. Video stream retrieval (High definition selector)
 * 4. spade_a key derivation & CENC-AES-CTR in-memory / on-disk MP4 decrypter
 */

import axios, { type AxiosRequestConfig } from 'axios';
import * as fs from 'fs';
import * as crypto from 'crypto';
import type { ShortDramaEpisode, ShortDramaSeries } from '../../../../types/shortDrama';

const API_BASE = 'https://api5-normal-sinfonlineb.fqnovel.com';
export const HONGGUO_UA =
  'com.phoenix.read/71532 (Linux; U; Android 9; SM-N9860; Build/PQ3A.190705.10241111;tt-ok/3.12.13.20)';
export const HONGGUO_VIDEO_REFERER = 'https://novelquickapp.com/';

const SITE_ORIGIN = 'https://hongguoduanju.com';
const WEB_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const WEB_REFERER = `${SITE_ORIGIN}/`;

const COMMON_QUERY: Record<string, string> = {
  klink_egdi: 'AAI29o4dI-eMiO73_SRSbZ_0By1v3fUSriNeu8-L951MoXhWT88pzj5B',
  iid: '3788260546453235',
  device_id: '538083340353620',
  ac: 'wifi',
  channel: 'oppo_8662_64',
  aid: '8662',
  app_name: 'novelread',
  version_code: '71532',
  version_name: '7.1.5.32',
  device_platform: 'android',
  os: 'android',
  ssmix: 'a',
  device_type: 'SM-N9860',
  device_brand: 'Samsung',
  language: 'zh',
  os_api: '28',
  os_version: '9',
  manifest_version_code: '71532',
  resolution: '900*1600',
  dpi: '320',
  update_version_code: '71532',
  host_abi: 'arm64-v8a',
  dragon_device_type: 'pad',
  pv_player: '71532',
  compliance_status: '0',
  need_personal_recommend: '1',
  player_so_load: '1',
  is_android_pad_screen: '0',
  rom_version: 'PQ3A.190705.10241111+release-keys',
  cdid: 'b4f93387-5319-4134-aab9-2cd4e9279b8f',
};

const HEADERS: Record<string, string> = {
  'User-Agent': HONGGUO_UA,
  'Accept-Encoding': 'gzip',
  Accept: 'application/json; charset=utf-8,application/x-protobuf',
  'Content-Type': 'application/json; charset=utf-8',
  Host: 'api5-normal-sinfonlineb.fqnovel.com',
};

const DETAIL_BIZ_PARAM = {
  detail_page_version: 0,
  disable_digg_stat: false,
  image_shrink_datas_str:
    'W3siaW1hZ2VfdHlwZSI6MywiaW1hZ2Vfd2lkdGgiOjkwMCwic2hyaW5rX3R5cGUiOjN9LHsiaW1hZ2VfdHlwZSI6NCwiaW1hZ2Vfd2lkdGgiOjcyLCJzaHJpbmtfdHlwZSI6NH1d\n',
  need_all_video_definition: false,
  need_mp4_align: false,
  screen_width_px: '900',
  source: 7,
  use_os_player: false,
  use_server_dns: false,
};

const MODEL_BIZ_PARAM = {
  detail_page_version: 0,
  device_level: 3,
  disable_digg_stat: false,
  need_all_video_definition: true,
  need_mp4_align: false,
  use_os_player: false,
  use_server_dns: false,
  video_platform: 1024,
};

/**
 * Call Official App API with retries
 */
async function apiCall(apiPath: string, body: any, retries = 3): Promise<any> {
  const q = { ...COMMON_QUERY, _rticket: Date.now().toString() };
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.post(`${API_BASE}${apiPath}`, body, {
        params: q,
        headers: HEADERS,
        timeout: 25000,
        responseType: 'arraybuffer',
        transformResponse: [(d) => d],
      });
      const buf = Buffer.from(res.data || []);
      if (res.status !== 200) {
        throw new Error(`HTTP ${res.status}`);
      }
      if (buf.length === 0) {
        throw new Error(`API returned empty response (HTTP 200, 0 bytes)`);
      }
      const text = buf.toString('utf8');
      return JSON.parse(text);
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
}

/** MP4 URL sanitization */
function normalizeVideoUrl(raw: string): string {
  return String(raw || '')
    .replace(/\\u002F/g, '/')
    .replace(/\\u0026/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/([?&])Range=[^&]*/gi, '$1')
    .replace(/[?&]$/, '');
}

function pickJsonString(text: string, key: string): string {
  const m = text.match(new RegExp('"' + key + '"\\s*:\\s*"([^"]*)"'));
  return m ? m[1].replace(/\\u002F/g, '/').replace(/\\u0026/g, '&') : '';
}

async function fetchSiteHtml(url: string): Promise<string> {
  const res = await axios.get(url, {
    headers: {
      'User-Agent': WEB_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Referer: WEB_REFERER,
    },
    timeout: 30000,
    responseType: 'text',
    maxRedirects: 5,
  });
  return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
}

/**
 * Fallback: fetch episode list directly from website player page
 */
export async function fetchEpisodeListFromWeb(
  seriesId: string,
): Promise<ShortDramaSeries> {
  const html = await fetchSiteHtml(
    `${SITE_ORIGIN}/player/${encodeURIComponent(seriesId)}`,
  );

  const m = html.match(/"vid_list"\s*:\s*\[([^\]]*)\]/);
  if (!m) throw new Error('Không tìm thấy danh sách tập phim (vid_list) trên trang web');

  const vids = m[1]
    .split(',')
    .map((s) => s.trim().replace(/^"|"$/g, ''))
    .filter((s) => /^\d+$/.test(s));
  if (!vids.length) throw new Error('Danh sách tập phim trên web trống');

  const seriesTitle = pickJsonString(html, 'series_name') || 'Phim ngắn chưa đặt tên';
  const cover = pickJsonString(html, 'series_cover');

  const episodes: ShortDramaEpisode[] = vids.map((vid, i) => ({
    vid,
    vid_index: i + 1,
    title: `Tập ${i + 1}`,
    series_id: String(seriesId),
    series_title: seriesTitle,
    cover,
  }));

  return {
    provider_id: 'hongguo',
    series_id: String(seriesId),
    series_title: seriesTitle,
    cover: cover || (episodes[0] && episodes[0].cover) || '',
    total: episodes.length,
    episodes,
    source: 'web',
  };
}

/**
 * Fallback: fetch plaintext MP4 direct link from web
 */
export async function fetchPlayUrlFromWeb(
  vid: string,
  sid?: string,
): Promise<{ url: string; spadeA: string | null; codec: string; source: string } | null> {
  const candidates: string[] = [];
  if (sid) {
    candidates.push(
      `${SITE_ORIGIN}/player/${encodeURIComponent(sid)}/${encodeURIComponent(vid)}`,
    );
  }
  candidates.push(`${SITE_ORIGIN}/player/_/${encodeURIComponent(vid)}`);

  let lastErr: any = null;
  for (const url of candidates) {
    try {
      const html = await fetchSiteHtml(url);
      let m = html.match(/"main_url"\s*:\s*"([^"]+)"/);
      if (!m) m = html.match(/"contentUrl"\s*:\s*"([^"]+)"/);
      if (!m) continue;

      const videoUrl = normalizeVideoUrl(m[1]);
      if (!/^https?:\/\//i.test(videoUrl)) continue;
      return { url: videoUrl, spadeA: null, codec: '', source: 'web' };
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) console.warn('[Hongguo Web] Lấy link trực tiếp thất bại:', lastErr.message);
  return null;
}

/**
 * Resolve share URL / shortlink / query param / pure ID to series_id
 */
export async function resolveSeriesId(shareUrl: string): Promise<string> {
  const trimmed = String(shareUrl || '').trim();
  if (/^\d{6,}$/.test(trimmed)) {
    return trimmed;
  }

  // Extract URL from mixed text (e.g. from mobile share sheet)
  const urlMatch = trimmed.match(/https?:\/\/[^\s]+/);
  const targetUrl = urlMatch ? urlMatch[0] : trimmed;

  // 1. Direct fast regex matching on targetUrl before network request
  let m = targetUrl.match(/video_series_id=(\d+)/);
  if (m) return m[1];

  m = targetUrl.match(/(?:series_id|page|player|detail)[/=](\d{6,})/);
  if (m) return m[1];

  m = targetUrl.match(/\/(\d{15,})/);
  if (m) return m[1];

  try {
    const res = await axios.get(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 9; SM-N9860) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.152 Mobile Safari/537.36',
      },
      timeout: 25000,
      maxRedirects: 10,
    });

    const finalUrl = res.request?.res?.responseUrl || res.config?.url || targetUrl;
    m = finalUrl.match(/video_series_id=(\d+)/);
    if (m) return m[1];

    m = finalUrl.match(/schemeParams[^&]*/);
    if (m) {
      const raw = decodeURIComponent(decodeURIComponent(m[0]));
      const jm = raw.match(/"video_id"\s*:\s*"(\d+)"/);
      if (jm) return jm[1];
    }

    const bodyText = typeof res.data === 'string' ? res.data : JSON.stringify(res.data || '');
    m =
      bodyText.match(/video_series_id=(\d+)/) ||
      bodyText.match(/"video_id"\s*:\s*"(\d+)"/) ||
      bodyText.match(/"series_id"\s*:\s*"(\d+)"/);
    if (m) return m[1];
  } catch (err: any) {
    // If network request failed (e.g. 404), do fallback search on string
    const fallbackMatch = targetUrl.match(/(\d{8,})/);
    if (fallbackMatch) return fallbackMatch[1];
  }

  throw new Error(`Không thể phân tích series_id từ liên kết: ${targetUrl}`);
}

/**
 * Fetch full episode list
 */
export async function fetchEpisodeList(seriesId: string): Promise<ShortDramaSeries> {
  const body = {
    biz_param: DETAIL_BIZ_PARAM,
    dr_scene: 'preload',
    series_id: seriesId,
  };

  let j: any;
  try {
    j = await apiCall('/novel/player/multi_video_detail/preload/v1', body);
  } catch (e: any) {
    console.warn('[Hongguo] App detail API thất bại, chuyển sang web fallback:', e.message);
    try {
      const webData = await fetchEpisodeListFromWeb(seriesId);
      return webData;
    } catch (webErr: any) {
      throw new Error(
        `Lấy danh sách tập thất bại: App API (${e.message}), Web (${webErr.message})`,
      );
    }
  }

  if (!j || j.code !== 0) {
    // Try web fallback if app API response code is non-zero
    try {
      return await fetchEpisodeListFromWeb(seriesId);
    } catch {
      throw new Error(`Lỗi detail API: ${JSON.stringify(j || {}).slice(0, 200)}`);
    }
  }

  const d = j.data || {};
  const sid = Object.keys(d)[0];
  if (!sid) {
    return await fetchEpisodeListFromWeb(seriesId);
  }

  const vd = d[sid]?.video_data || {};
  const vl = vd.video_list || [];
  const eps: ShortDramaEpisode[] = vl.map((item: any) => ({
    vid: String(item.vid),
    vid_index: item.vid_index || 0,
    title: item.title ? `Tập ${item.vid_index}: ${item.title}` : `Tập ${item.vid_index}`,
    series_id: String(item.series_id || sid),
    series_title: vd.series_title || '',
    cover: vd.series_cover || vd.cover_url || item.cover_url || '',
  }));

  eps.sort((a, b) => a.vid_index - b.vid_index);

  return {
    provider_id: 'hongguo',
    series_id: String(sid),
    series_title: vd.series_title || 'Phim ngắn chưa đặt tên',
    cover: vd.series_cover || vd.cover_url || (eps[0] && eps[0].cover) || '',
    total: eps.length,
    episodes: eps,
    source: 'api',
  };
}

function streamScore(v: any) {
  const meta = v.video_meta || {};
  const defStr = String(meta.definition || '');
  let defNum = 0;
  const m = defStr.match(/(\d+)\s*p/i);
  if (m) {
    defNum = parseInt(m[1], 10);
  } else {
    const map: Record<string, number> = {
      '4k': 2160,
      '2k': 1440,
      fhd: 1080,
      fullhd: 1080,
      hd: 720,
      sd: 480,
      ld: 360,
    };
    defNum = map[defStr.toLowerCase()] || 0;
  }
  const w = parseInt(meta.vwidth, 10) || 0;
  const h = parseInt(meta.vheight, 10) || 0;
  const bitrate = parseInt(meta.bitrate || meta.real_bitrate, 10) || 0;
  return { defNum, pixels: w * h, bitrate };
}

function parseModelVideo(vm: any): [string | null, string | null, string | null] {
  if (typeof vm !== 'string') return [null, null, null];
  let vmj: any;
  try {
    vmj = JSON.parse(vm);
  } catch {
    return [null, null, null];
  }
  const vl = vmj.video_list || [];
  const rank = (codec: string) => {
    if (['h265', 'h264', 'h265_hvc1', 'hevc', 'hvc1', 'avc1'].includes(codec)) return 0;
    if (codec === 'bytevc1') return 1;
    return 2;
  };
  const cmp = (a: any, b: any) => {
    if (a.defNum !== b.defNum) return a.defNum - b.defNum;
    if (a.pixels !== b.pixels) return a.pixels - b.pixels;
    if (a.codecRank !== b.codecRank) return b.codecRank - a.codecRank;
    return a.bitrate - b.bitrate;
  };

  let best: [string, string | null, string] | null = null;
  let bestScore: any = null;
  for (const v of vl) {
    if (!v.main_url) continue;
    const codec = v.video_meta?.codec_type || '';
    const ei = v.encrypt_info || {};
    const s = { ...streamScore(v), codecRank: rank(codec) };
    if (!bestScore || cmp(s, bestScore) > 0) {
      bestScore = s;
      best = [v.main_url, ei.spade_a || null, codec];
    }
  }
  return best || [null, null, null];
}

/**
 * Fetch video URL and spade_a key token for a single episode
 */
export async function fetchPlayUrlSingle(
  vid: string,
  sid?: string,
): Promise<{ url: string | null; spadeA: string | null; codec: string | null; source: string }> {
  const body = {
    biz_param: MODEL_BIZ_PARAM,
    dr_scene: 'preload',
    mixed_video_id_map: { '1004': [vid] },
  };

  try {
    const j = await apiCall('/novel/player/multi_video_model/preload/v1', body);
    const item = j?.data?.[vid] || {};
    const [url, spadeA, codec] = parseModelVideo(item.video_model);
    if (url) return { url, spadeA, codec, source: 'api' };
  } catch (e: any) {
    console.warn('[Hongguo] App stream API thất bại, chuyển web:', e.message);
  }

  // Fallback to website player
  try {
    const web = await fetchPlayUrlFromWeb(vid, sid);
    if (web && web.url) return web;
  } catch {}

  return { url: null, spadeA: null, codec: null, source: 'none' };
}

// ======================== CENC-AES-CTR DECRYPTION ========================

function avBase64Decode(s: string): Buffer {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const table: Record<number, number> = {};
  for (let i = 0; i < chars.length; i++) table[chars.charCodeAt(i)] = i;
  const dst: number[] = [];
  let i = 0;
  while (i + 4 <= s.length) {
    const vals: number[] = [];
    let ok = true;
    for (let j = 0; j < 4; j++) {
      const c = s.charCodeAt(i + j);
      if (c in table) {
        vals.push(table[c]);
      } else {
        ok = false;
        break;
      }
    }
    if (!ok) {
      let v = 0;
      for (let j2 = 0; j2 < vals.length; j2++) {
        v = (v << 6) | vals[j2];
      }
      if (vals.length === 3) {
        dst.push((v >> 10) & 0xff);
        dst.push((v >> 2) & 0xff);
      } else if (vals.length === 2) {
        dst.push((v >> 4) & 0xff);
      }
      break;
    }
    const v = (vals[0] << 18) | (vals[1] << 12) | (vals[2] << 6) | vals[3];
    dst.push((v >> 16) & 0xff);
    dst.push((v >> 8) & 0xff);
    dst.push(v & 0xff);
    i += 4;
  }
  return Buffer.from(dst);
}

/**
 * Derive 16-byte AES-128 key from spade_a string
 */
export function deriveKey(spadeA: string): Buffer | null {
  if (!spadeA) return null;
  const buf = avBase64Decode(spadeA);
  const L = buf.length;
  if (L < 3) return null;

  const key0 = buf[0] ^ buf[1] ^ buf[2];
  const x27 = key0 - 0x30;
  const w22 = L - key0 + 0x2f;
  if (x27 < 2 || w22 < 2 || w22 > L - 1) return null;

  const x21 = Buffer.from(buf.subarray(1, 1 + w22));
  let w11 = 0x55;
  let w12 = 0xfa;
  const w10 = 0xeb;
  for (let i = 0; i < x21.length; i++) {
    const w13 = x21[i];
    const pc = i.toString(2).split('1').length - 1;
    const w14 = (i & 1) === 0 ? w12 : w11;
    if ((i & 1) === 1) {
      w11 = w13;
    } else {
      w12 = w13;
    }
    const w13_xor = w14 ^ x21[i];
    const w14_sub = w10 - pc;
    x21[i] = (w14_sub + w13_xor) & 0xff;
  }

  const c0 = x21[0];
  let hval = 0;
  if (0x30 <= c0 && c0 <= 0x39) {
    hval = c0 - 0x30;
  } else if (0x61 <= c0 && c0 <= 0x7a) {
    hval = c0 - 0x57;
  } else {
    return null;
  }

  const w9 = w22 - hval;
  if (w9 < 2) return null;

  const strA = x21.subarray(1, 1 + w9 - 1).toString('ascii');
  if (strA.length !== 32) return null;

  try {
    return Buffer.from(strA, 'hex');
  } catch {
    return null;
  }
}

function aes128EcbEncrypt(key16: Buffer, data: Buffer): Buffer {
  const cipher = crypto.createCipheriv('aes-128-ecb', key16, null);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

function decryptSample(key: Buffer, nonce: Buffer, cipher: Buffer): Buffer {
  if (!cipher || cipher.length === 0) return Buffer.alloc(0);
  const nblocks = Math.ceil(cipher.length / 16);
  const full = Buffer.alloc(nblocks * 16);
  for (let k = 0; k < nblocks; k++) {
    nonce.copy(full, k * 16, 0, 8);
    full.writeBigUInt64BE(BigInt(k), k * 16 + 8);
  }
  const ks = aes128EcbEncrypt(key, full);
  const plain = Buffer.alloc(cipher.length);
  for (let i = 0; i < cipher.length; i++) {
    plain[i] = cipher[i] ^ ks[i];
  }
  return plain;
}

interface Mp4Box {
  typ: string;
  off: number;
  size: number;
  hdr: number;
  children: Mp4Box[] | null;
}

function parseBoxes(data: Buffer, start: number, end: number): Mp4Box[] {
  const boxes: Mp4Box[] = [];
  let off = start;
  while (off + 8 <= end) {
    let size = data.readUInt32BE(off);
    const typ = data.subarray(off + 4, off + 8).toString('latin1');
    let hdr = 8;
    if (size === 1) {
      size = Number(data.readBigUInt64BE(off + 8));
      hdr = 16;
    } else if (size === 0) {
      size = end - off;
    }
    if (size < hdr || off + size > end) break;
    let children: Mp4Box[] | null = null;
    if (['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf', 'udta', 'meta'].includes(typ)) {
      children = parseBoxes(data, off + hdr, off + size);
    }
    boxes.push({ typ, off, size, hdr, children });
    off += size;
  }
  return boxes;
}

function rebuildMoov(data: Buffer, moovOff: number, moovSize: number, top: Mp4Box[]): Buffer {
  const moovBox = top.find((b) => b.typ === 'moov');
  if (!moovBox) throw new Error('Không tìm thấy moov box');

  function clone(box: Mp4Box): Mp4Box {
    return {
      typ: box.typ,
      off: box.off,
      size: box.size,
      hdr: box.hdr,
      children: box.children ? box.children.map(clone) : null,
    };
  }

  function prune(box: Mp4Box): Mp4Box {
    if (!box.children) return box;
    const keep: Mp4Box[] = [];
    for (const c of box.children) {
      if (['senc', 'saio', 'saiz', 'sgpd', 'sbgp'].includes(c.typ)) continue;
      keep.push(prune(c));
    }
    box.children = keep;
    return box;
  }

  const tree = prune(clone(moovBox));

  function* walkChildren(box: Mp4Box): Generator<Mp4Box> {
    for (const c of box.children || []) {
      yield c;
      for (const x of walkChildren(c)) yield x;
    }
  }

  const patches: Record<number, Buffer> = {};
  for (const b of walkChildren(tree)) {
    if (b.typ === 'stsd') {
      const content = b.off + 8;
      const count = data.readUInt32BE(content + 4);
      let p = content + 8;
      const entries: Buffer[] = [];
      for (let i = 0; i < count; i++) {
        const esize = data.readUInt32BE(p);
        const etyp = data.subarray(p + 4, p + 8).toString('latin1');
        if (etyp === 'encv' || etyp === 'enca') {
          const newType = etyp === 'encv' ? 'hvc1' : 'mp4a';
          const hdrSize = etyp === 'encv' ? 78 : 28;
          const entry = Buffer.alloc(8 + hdrSize);
          entry.writeUInt32BE(0, 0);
          entry.write(newType, 4, 4, 'latin1');
          data.copy(entry, 8, p + 8, p + 8 + hdrSize);

          let entryExtra = Buffer.alloc(0);
          let q = p + 8 + hdrSize;
          while (q + 8 <= p + esize) {
            let s2 = data.readUInt32BE(q);
            const t2 = data.subarray(q + 4, q + 8).toString('latin1');
            if (s2 === 1) {
              s2 = Number(data.readBigUInt64BE(q + 8));
            } else if (s2 === 0) {
              s2 = p + esize - q;
            }
            if (t2 !== 'sinf') {
              entryExtra = Buffer.concat([entryExtra, data.subarray(q, q + s2)]);
            }
            q += s2;
          }
          const fullEntry = Buffer.concat([entry, entryExtra]);
          fullEntry.writeUInt32BE(fullEntry.length, 0);
          entries.push(fullEntry);
        } else {
          entries.push(data.subarray(p, p + esize));
        }
        p += esize;
      }
      const stsdHdr = Buffer.alloc(16);
      data.copy(stsdHdr, 0, b.off, content + 8);
      stsdHdr.writeUInt32BE(entries.length, 12);
      const fullStsd = Buffer.concat([stsdHdr, ...entries]);
      fullStsd.writeUInt32BE(fullStsd.length, 0);
      patches[b.off] = fullStsd;
    }
  }

  function serialize(box: Mp4Box): Buffer {
    if (!box.children) {
      return patches[box.off] || data.subarray(box.off, box.off + box.size);
    }
    const body = Buffer.concat(box.children.map(serialize));
    const hdrb = Buffer.alloc(box.hdr);
    data.copy(hdrb, 0, box.off, box.off + box.hdr);
    if (box.hdr === 8) {
      hdrb.writeUInt32BE(8 + body.length, 0);
    } else {
      hdrb.writeUInt32BE(1, 0);
      hdrb.writeBigUInt64BE(BigInt(16 + body.length), 8);
    }
    return Buffer.concat([hdrb, body]);
  }

  const first = serialize(tree);
  const delta = moovSize - first.length;

  for (const b of walkChildren(tree)) {
    if (b.typ === 'stco') {
      const nc = data.readUInt32BE(b.off + 12);
      for (let i = 0; i < nc; i++) {
        const v = data.readUInt32BE(b.off + 16 + i * 4);
        if (v >= delta) {
          data.writeUInt32BE(v - delta, b.off + 16 + i * 4);
        }
      }
    }
  }

  return serialize(tree);
}

/**
 * Decrypt CENC-AES-CTR in-memory buffer
 */
export function decryptMp4Buffer(data: Buffer, key: Buffer): Buffer {
  const total = data.length;
  const top = parseBoxes(data, 0, total);
  const moov = top.find((b) => b.typ === 'moov');
  if (!moov) throw new Error('Không tìm thấy moov box trong tệp MP4');

  function getBox(boxes: Mp4Box[] | null, typ: string): Mp4Box | undefined {
    return (boxes || []).find((b) => b.typ === typ);
  }

  function* walkBoxes(boxes: Mp4Box[]): Generator<Mp4Box> {
    for (const b of boxes) {
      if (b.children) {
        for (const x of walkBoxes(b.children)) yield x;
      }
      yield b;
    }
  }

  const stbls = Array.from(walkBoxes(top)).filter((b) => b.typ === 'stbl');
  const trackInfo: Array<{
    sizes: number[];
    offs: number[];
    ivs: Buffer[];
    stco: Mp4Box;
  }> = [];

  for (const stbl of stbls) {
    const stsz = getBox(stbl.children, 'stsz');
    const stco = getBox(stbl.children, 'stco');
    const stsc = getBox(stbl.children, 'stsc');
    const senc = getBox(stbl.children, 'senc');
    if (!stsz || !stco || !stsc) continue;

    const ss = data.readUInt32BE(stsz.off + 12);
    const n = data.readUInt32BE(stsz.off + 16);
    const sizes: number[] = [];
    if (ss === 0) {
      for (let i = 0; i < n; i++) {
        sizes.push(data.readUInt32BE(stsz.off + 20 + i * 4));
      }
    } else {
      sizes.length = n;
      sizes.fill(ss);
    }

    const nc = data.readUInt32BE(stco.off + 12);
    const chunkOffs: number[] = [];
    for (let i = 0; i < nc; i++) {
      chunkOffs.push(data.readUInt32BE(stco.off + 16 + i * 4));
    }

    const ns = data.readUInt32BE(stsc.off + 12);
    const stscTab: number[][] = [];
    for (let i = 0; i < ns; i++) {
      stscTab.push([
        data.readUInt32BE(stsc.off + 16 + i * 12),
        data.readUInt32BE(stsc.off + 20 + i * 12),
        data.readUInt32BE(stsc.off + 24 + i * 12),
      ]);
    }

    const ivs: Buffer[] = [];
    if (senc) {
      const sc = data.readUInt32BE(senc.off + 12);
      for (let i = 0; i < sc; i++) {
        ivs.push(data.subarray(senc.off + 16 + i * 8, senc.off + 24 + i * 8));
      }
    }

    const chunkSpc: Record<number, number> = {};
    for (let i = 0; i < stscTab.length; i++) {
      const fc = stscTab[i][0];
      const spc = stscTab[i][1];
      const nxt = i + 1 < stscTab.length ? stscTab[i + 1][0] : nc + 1;
      for (let ci = fc - 1; ci < nxt - 1; ci++) {
        chunkSpc[ci] = spc;
      }
    }

    const sampleOffs: number[] = [];
    let si = 0;
    for (let ci = 0; ci < nc; ci++) {
      let off = chunkOffs[ci];
      const spc = chunkSpc[ci] || 1;
      for (let s = 0; s < spc; s++) {
        if (si >= n) break;
        sampleOffs.push(off);
        off += sizes[si];
        si++;
      }
    }

    trackInfo.push({ sizes, offs: sampleOffs, ivs, stco });
  }

  for (const ti of trackInfo) {
    for (let i = 0; i < ti.offs.length; i++) {
      const off = ti.offs[i];
      const sz = ti.sizes[i];
      if (off + sz > total) continue;
      if (i < ti.ivs.length) {
        const nonce = ti.ivs[i].subarray(0, 8);
        const cipher = data.subarray(off, off + sz);
        const plain = decryptSample(key, nonce, cipher);
        plain.copy(data, off);
      }
    }
  }

  const newMoov = rebuildMoov(data, moov.off, moov.size, top);
  const out: Buffer[] = [];
  let off = 0;
  while (off < total) {
    let size = data.readUInt32BE(off);
    const typ = data.subarray(off + 4, off + 8).toString('latin1');
    let hdr = 8;
    if (size === 1) {
      size = Number(data.readBigUInt64BE(off + 8));
      hdr = 16;
    } else if (size === 0) {
      size = total - off;
    }
    if (typ === 'moov') {
      out.push(newMoov);
    } else {
      out.push(data.subarray(off, off + size));
    }
    off += size;
  }

  return Buffer.concat(out);
}

/**
 * Decrypt encrypted MP4 file to destination MP4 file
 */
export function decryptMp4File(srcPath: string, dstPath: string, key: Buffer): void {
  const data = fs.readFileSync(srcPath);
  const finalBuf = decryptMp4Buffer(data, key);
  fs.writeFileSync(dstPath, finalBuf);
}
