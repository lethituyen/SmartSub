import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const rawUrl = process.argv[2] || 'https://v.douyin.com/wfsSA5DGF-8/';
const timeoutSec = parseInt(process.argv[3] || '45', 10);
const startTime = Date.now();

const debugLogPath = path.join(os.tmpdir(), 'storycut_cdp', 'debug.log');
function logDebug(msg) {
  try {
    fs.mkdirSync(path.dirname(debugLogPath), { recursive: true });
    fs.appendFileSync(debugLogPath, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

logDebug(`Starting resolver for URL: ${rawUrl}`);

const CUSTOM_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';

// 1. Locate Edge or Chrome
const browserCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/microsoft-edge',
  '/usr/bin/chromium-browser',
];

const browserExe = browserCandidates.find(p => fs.existsSync(p));
if (!browserExe) {
  logDebug('Error: No browser found');
  process.stderr.write(JSON.stringify({ error: 'Không tìm thấy trình duyệt Edge hoặc Chrome trên hệ thống' }));
  process.exit(1);
}

// 2. Pre-resolve short link if needed to avoid cross-domain navigation inside Edge
let targetUrl = rawUrl;
try {
  logDebug('Resolving redirect via fetch...');
  const headResp = await fetch(rawUrl, {
    redirect: 'follow',
    headers: {
      'User-Agent': CUSTOM_UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    }
  });
  if (headResp.url && (headResp.url.includes('douyin.com') || headResp.url.includes('fanqie') || headResp.url.includes('hongguo') || headResp.url.includes('snssdk.com'))) {
    targetUrl = headResp.url;
    logDebug(`Resolved targetUrl: ${targetUrl}`);
  }
} catch (err) {
  logDebug(`Pre-resolve error: ${err.message}`);
}

// Clean tracking parameters from Douyin video URL to avoid referral bot detection
const vidMatch = targetUrl.match(/video\/(\d+)/) || targetUrl.match(/note\/(\d+)/);
if (vidMatch) {
  targetUrl = `https://www.douyin.com/video/${vidMatch[1]}`;
  logDebug(`Cleaned targetUrl to: ${targetUrl}`);
}

const cdpPort = 9700 + Math.floor(Math.random() * 200);
const tempProfileDir = path.join(os.tmpdir(), 'storycut_douyin_cdp_profile');
fs.mkdirSync(tempProfileDir, { recursive: true });
logDebug(`Spawning browser on port ${cdpPort}, profile ${tempProfileDir}`);

const browserProcess = spawn(browserExe, [
  '--headless=new',
  `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${tempProfileDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-sync',
  '--disable-blink-features=AutomationControlled',
  `--user-agent=${CUSTOM_UA}`,
  '--window-size=1280,720',
  targetUrl
], { stdio: 'ignore' });

let cleanedUp = false;
async function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  logDebug('Cleanup called');
  if (process.platform === 'win32' && browserProcess.pid) {
    try {
      execSync(`taskkill /F /T /PID ${browserProcess.pid}`, { stdio: 'ignore' });
    } catch {}
  } else {
    try { browserProcess.kill('SIGKILL'); } catch {}
  }
}

const globalTimeout = setTimeout(async () => {
  logDebug(`Global timeout (${timeoutSec}s) triggered`);
  await cleanup();
  process.stderr.write(JSON.stringify({ error: `Quá thời gian chờ (${timeoutSec}s) khi giải mã liên kết Douyin qua trình duyệt` }));
  process.exit(2);
}, timeoutSec * 1000);

async function findPageWebSocketUrl(port, maxAttempts = 35) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (resp.ok) {
        const list = await resp.json();
        const page = list.find(t =>
          t.type === 'page' &&
          t.webSocketDebuggerUrl &&
          !t.url.startsWith('edge://') &&
          !t.url.startsWith('chrome://')
        );

        if (page) {
          logDebug(`Found page WS URL: ${page.webSocketDebuggerUrl} (${page.url})`);
          return page.webSocketDebuggerUrl;
        }
      }
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  return null;
}

async function run() {
  const wsUrl = await findPageWebSocketUrl(cdpPort);
  if (!wsUrl) {
    logDebug('Error: Could not find page WS URL');
    clearTimeout(globalTimeout);
    await cleanup();
    process.stderr.write(JSON.stringify({ error: 'Không thể kết nối đến giao diện gỡ lỗi CDP của trình duyệt' }));
    process.exit(3);
  }

  let ws = new WebSocket(wsUrl);
  let cmdCounter = 0;
  let finished = false;
  const pendingRequests = new Set();
  const requestedCmdIds = new Map(); // cmdId -> reqId

  function sendCommand(method, params = {}) {
    const id = ++cmdCounter;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ id, method, params }));
    }
    return id;
  }

  async function emitPayload(payload) {
    if (finished) return;
    finished = true;
    clearTimeout(globalTimeout);
    try { ws.close(); } catch {}
    logDebug(`SUCCESS! Emitting payload for aweme_id=${payload.aweme_id}`);
    process.stdout.write(JSON.stringify(payload));
    await cleanup();
    process.exit(0);
  }

  function setupWs(socket) {
    socket.onopen = () => {
      logDebug('CDP WebSocket opened. Sending Network.enable with buffer params');
      sendCommand('Network.enable', {
        maxTotalBufferSize: 100000000,
        maxResourceBufferSize: 20000000,
        maxPostDataSize: 20000000
      });
      sendCommand('Network.getAllCookies');
    };

    socket.onmessage = async (event) => {
      if (finished) return;
      try {
        const msg = JSON.parse(event.data);

        // 1. Capture detail request ID when status is 200
        if (msg.method === 'Network.responseReceived') {
          const reqUrl = msg.params?.response?.url || '';
          const status = msg.params?.response?.status || 0;
          if (
            (reqUrl.includes('aweme/v1/web/aweme/detail') ||
             reqUrl.includes('aweme/detail') ||
             reqUrl.includes('reading/drama') ||
             reqUrl.includes('snssdk.com') ||
             reqUrl.includes('play_url')) &&
            (status === 200 || status === 0)
          ) {
            const reqId = msg.params.requestId;
            logDebug(`Network.responseReceived for aweme detail: reqId=${reqId}, status=${status}, url=${reqUrl.substring(0, 80)}`);
            pendingRequests.add(reqId);
          }
        }

        // 2. Immediate trigger when response loading is fully finished
        if (msg.method === 'Network.loadingFinished') {
          const reqId = msg.params?.requestId;
          if (reqId && pendingRequests.has(reqId)) {
            logDebug(`Network.loadingFinished for reqId=${reqId}, requesting body immediately`);
            const cmdId = sendCommand('Network.getResponseBody', { requestId: reqId });
            requestedCmdIds.set(cmdId, reqId);
            sendCommand('Network.getAllCookies');
          }
        }

        // 3. Save cookies
        if (msg.result?.cookies && Array.isArray(msg.result.cookies)) {
          try {
            const cookieDir = path.join(os.tmpdir(), 'storycut_cookies');
            fs.mkdirSync(cookieDir, { recursive: true });
            const cookieFile = path.join(cookieDir, 'douyin_cookies.txt');
            let netscape = '# Netscape HTTP Cookie File\n# Generated by StoryCut CDP\n\n';
            for (const c of msg.result.cookies) {
              const domain = c.domain;
              const includeSub = domain.startsWith('.') ? 'TRUE' : 'FALSE';
              const p = c.path || '/';
              const secure = c.secure ? 'TRUE' : 'FALSE';
              const expires = c.expires && c.expires > 0 ? Math.floor(c.expires) : Math.floor(Date.now() / 1000) + 86400 * 30;
              netscape += `${domain}\t${includeSub}\t${p}\t${secure}\t${expires}\t${c.name}\t${c.value}\n`;
            }
            fs.writeFileSync(cookieFile, netscape, 'utf8');
          } catch {}
        }

        // 4. Handle getResponseBody result or error
        if (requestedCmdIds.has(msg.id)) {
          const associatedReqId = requestedCmdIds.get(msg.id);
          logDebug(`Received getResponseBody reply for cmdId=${msg.id}, reqId=${associatedReqId}`);

          if (msg.error) {
            logDebug(`getResponseBody error: ${JSON.stringify(msg.error)}`);
            return;
          }

          if (msg.result?.body) {
            let bodyStr = msg.result.body;
            logDebug(`Body received, length: ${bodyStr.length}, base64Encoded: ${msg.result.base64Encoded}`);

            if (msg.result.base64Encoded) {
              const buf = Buffer.from(bodyStr, 'base64');
              try {
                bodyStr = zlib.brotliDecompressSync(buf).toString('utf8');
                logDebug('Decompressed brotli body successfully');
              } catch {
                try {
                  bodyStr = zlib.gunzipSync(buf).toString('utf8');
                  logDebug('Decompressed gzip body successfully');
                } catch {
                  bodyStr = buf.toString('utf8');
                }
              }
            }

            let json;
            try {
              json = JSON.parse(bodyStr);
            } catch (parseErr) {
              logDebug(`JSON parse error: ${parseErr.message}`);
              return;
            }

            const aweme = json.aweme_detail || (Array.isArray(json.item_list) ? json.item_list[0] : null);
            if (aweme && aweme.video) {
              const title = (aweme.desc || '').trim() || 'douyin_video';
              const durationUs = aweme.duration ? Math.round(aweme.duration * 1000) : null;
              const uploader = aweme.author?.nickname || null;
              const thumbnailUrl = aweme.video?.cover?.url_list?.[0] || null;

              const rawStreams = (aweme.video.bit_rate || []).map(b => {
                const urlList = b.play_addr?.url_list || [];
                return {
                  gear_name: b.gear_name || '',
                  quality_type: b.quality_type || 0,
                  bit_rate: b.bit_rate || 0,
                  width: b.play_addr?.width || 0,
                  height: b.play_addr?.height || 0,
                  url: urlList[0] || '',
                  fallback_urls: urlList.slice(1),
                };
              }).filter(s => s.url.length > 0);

              rawStreams.sort((a, b) => b.bit_rate - a.bit_rate);
              const defaultUrl = aweme.video?.play_addr?.url_list?.[0] || (rawStreams[0]?.url ?? '');

              if (defaultUrl || rawStreams.length > 0) {
                await emitPayload({
                  success: true,
                  elapsed_ms: Date.now() - startTime,
                  aweme_id: String(aweme.aweme_id || 'douyin_video'),
                  title,
                  uploader,
                  duration_us: durationUs,
                  thumbnail_url: thumbnailUrl,
                  default_play_url: defaultUrl,
                  streams: rawStreams,
                });
                return;
              }
            }

            // Hongguo / Fanqie Drama format check
            const dramaData = (json.data && (json.data.video_list || json.data.play_url || json.data.video)) ? json.data : (json.video_list || json.play_url ? json : null);
            if (dramaData) {
              const title = dramaData.title || dramaData.series_title || dramaData.book_name || 'hongguo_drama';
              const vid = dramaData.item_id || dramaData.video_id || `hg_${Date.now()}`;
              let playUrl = dramaData.play_url || '';
              if (!playUrl && dramaData.video_list) {
                const keys = Object.keys(dramaData.video_list);
                if (keys.length > 0) {
                  playUrl = dramaData.video_list[keys[0]]?.main_url || '';
                }
              }
              if (playUrl) {
                await emitPayload({
                  success: true,
                  elapsed_ms: Date.now() - startTime,
                  aweme_id: String(vid),
                  title,
                  uploader: dramaData.author || '红果短剧',
                  duration_us: dramaData.duration ? Math.round(dramaData.duration * 1000) : null,
                  thumbnail_url: dramaData.cover_url || null,
                  default_play_url: playUrl,
                  streams: [{
                    gear_name: '1080p',
                    quality_type: 1080,
                    bit_rate: 2000000,
                    width: 1080,
                    height: 1920,
                    url: playUrl,
                    fallback_urls: [],
                  }],
                });
                return;
              }
            }

            logDebug('Parsed JSON but missing matching video streams');
            return;
          }
        }
      } catch (err) {
        logDebug(`Error in onmessage: ${err.message}`);
      }
    };

    socket.onerror = (err) => {
      logDebug(`WebSocket error: ${err.message || 'unknown'}`);
    };

    socket.onclose = async () => {
      logDebug(`WebSocket closed, finished=${finished}`);
      if (!finished) {
        await new Promise(r => setTimeout(r, 400));
        if (!finished) {
          const newWsUrl = await findPageWebSocketUrl(cdpPort, 10);
          if (newWsUrl && !finished) {
            logDebug(`Reconnecting to new WS URL: ${newWsUrl}`);
            ws = new WebSocket(newWsUrl);
            setupWs(ws);
          }
        }
      }
    };
  }

  setupWs(ws);
}

run().catch(async (err) => {
  logDebug(`Unhandled error: ${err.message}`);
  clearTimeout(globalTimeout);
  await cleanup();
  process.stderr.write(JSON.stringify({ error: err.message }));
  process.exit(8);
});
