import { spawn, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getExtraResourcesPath } from '../utils';
import { logMessage } from '../logger';

export interface DouyinStream {
  gearName: string;
  qualityType: number;
  bitRate: number;
  width: number;
  height: number;
  url: string;
  fallbackUrls: string[];
}

export interface DouyinMediaResult {
  success: boolean;
  awemeId: string;
  title: string;
  uploader?: string;
  duration?: number; // seconds
  thumbnail?: string;
  defaultPlayUrl: string;
  streams: DouyinStream[];
}

/** In-memory cache to avoid re-running browser CDP between preflight and download */
const RESOLVE_CACHE = new Map<
  string,
  { timestamp: number; data: DouyinMediaResult }
>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function isDouyinUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === 'douyin.com' ||
      host.endsWith('.douyin.com') ||
      host === 'iesdouyin.com' ||
      host.endsWith('.iesdouyin.com')
    );
  } catch {
    return false;
  }
}

export function sanitizeTitle(name: string): string {
  const sanitized = name
    .replace(/[/\\:*?"<>|\r\n\t]/g, '_')
    .trim();
  return sanitized.length > 0 ? sanitized.slice(0, 100) : 'douyin_video';
}

function findWorkerExecutable(): {
  exe: string;
  args: string[];
  env: NodeJS.ProcessEnv;
} {
  // Option 1: Current Electron runtime (SmartSub.exe in production, electron.exe in dev)
  // With ELECTRON_RUN_AS_NODE=1 and --experimental-websocket, it is 100% self-contained
  // and requires zero external Node.js installation on user machines.
  const electronExe = process.execPath;
  if (electronExe && fs.existsSync(electronExe)) {
    return {
      exe: electronExe,
      args: ['--experimental-websocket'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    };
  }

  // Option 2: System Node.js
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\nodejs\\node.exe',
      'C:\\Program Files (x86)\\nodejs\\node.exe',
      path.join(process.env.APPDATA || '', 'npm\\node.cmd'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs\\node\\node.exe'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        return {
          exe: c,
          args: ['--experimental-websocket'],
          env: process.env,
        };
      }
    }
  }

  return {
    exe: 'node',
    args: ['--experimental-websocket'],
    env: process.env,
  };
}

function resolveScriptPath(): string {
  const candidates: string[] = [];
  try {
    const extraPath = getExtraResourcesPath();
    if (extraPath) {
      candidates.push(path.join(extraPath, 'douyin_cdp_resolver.mjs'));
    }
  } catch {
    // getExtraResourcesPath may throw if app is not yet initialized or outside Electron
  }

  if (typeof __dirname !== 'undefined') {
    candidates.push(path.join(__dirname, 'douyin_cdp_resolver.mjs'));
    candidates.push(
      path.join(__dirname, '..', '..', 'extraResources', 'douyin_cdp_resolver.mjs'),
    );
    candidates.push(
      path.join(__dirname, '..', '..', '..', 'extraResources', 'douyin_cdp_resolver.mjs'),
    );
  }

  candidates.push(
    path.join(process.cwd(), 'extraResources', 'douyin_cdp_resolver.mjs'),
    path.join(
      process.cwd(),
      'main',
      'helpers',
      'videoDownload',
      'douyin_cdp_resolver.mjs',
    ),
    path.join(process.cwd(), 'resources', 'extraResources', 'douyin_cdp_resolver.mjs'),
    path.join(os.tmpdir(), 'smartsub_douyin_cdp_resolver.mjs'),
  );

  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }

  // Fallback: If not found anywhere, copy from embedded/local fallback into os.tmpdir()
  const fallbackPath = path.join(os.tmpdir(), 'smartsub_douyin_cdp_resolver.mjs');
  for (const c of candidates) {
    try {
      if (c && fs.existsSync(c)) {
        fs.copyFileSync(c, fallbackPath);
        return fallbackPath;
      }
    } catch {}
  }

  return candidates[0] || fallbackPath;
}

/**
 * Resolves a Douyin video link using Headless Edge/Chrome CDP via an isolated worker.
 * Bypasses anti-bot/WAF challenges and extracts high-speed unwatermarked CDN stream URLs.
 */
export async function resolveDouyinMedia(
  rawUrl: string,
  timeoutSec = 35,
): Promise<DouyinMediaResult> {
  const cached = RESOLVE_CACHE.get(rawUrl);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const scriptPath = resolveScriptPath();
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Douyin CDP resolver script not found at ${scriptPath}`);
  }

  const worker = findWorkerExecutable();

  return new Promise<DouyinMediaResult>((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const child = spawn(
      worker.exe,
      [...worker.args, scriptPath, rawUrl, String(timeoutSec)],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        env: worker.env,
      },
    );

    const timer = setTimeout(() => {
      try {
        if (child.pid) {
          if (process.platform === 'win32') {
            execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: 'ignore' });
          } else {
            child.kill('SIGKILL');
          }
        }
      } catch {
        // ignore
      }
      reject(
        new Error(
          `Quá thời gian (${timeoutSec}s) khi giải mã liên kết Douyin qua worker.`,
        ),
      );
    }, timeoutSec * 1000);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Không thể khởi chạy Node.js worker để giải mã Douyin: ${err.message}`,
        ),
      );
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        let errMessage = stderr.trim();
        try {
          const parsed = JSON.parse(stderr);
          if (parsed.error) errMessage = parsed.error;
        } catch {}
        reject(
          new Error(
            errMessage ||
              `Tiến trình giải mã Douyin kết thúc với mã lỗi ${code}`,
          ),
        );
        return;
      }

      try {
        const payload = JSON.parse(stdout);
        const mappedStreams: DouyinStream[] = (payload.streams || []).map(
          (s: any) => ({
            gearName: s.gear_name || '',
            qualityType: s.quality_type || 0,
            bitRate: s.bit_rate || 0,
            width: s.width || 0,
            height: s.height || 0,
            url: s.url || '',
            fallbackUrls: s.fallback_urls || [],
          }),
        );

        const result: DouyinMediaResult = {
          success: true,
          awemeId: payload.aweme_id || 'douyin_video',
          title: payload.title || 'douyin_video',
          uploader: payload.uploader,
          duration: payload.duration_us
            ? Math.round(payload.duration_us / 1000000)
            : undefined,
          thumbnail: payload.thumbnail_url,
          defaultPlayUrl:
            payload.default_play_url || mappedStreams[0]?.url || '',
          streams: mappedStreams,
        };

        RESOLVE_CACHE.set(rawUrl, { timestamp: Date.now(), data: result });
        if (result.awemeId) {
          RESOLVE_CACHE.set(result.awemeId, {
            timestamp: Date.now(),
            data: result,
          });
        }

        resolve(result);
      } catch (parseError: any) {
        reject(
          new Error(`Lỗi phân tích JSON kết quả Douyin: ${parseError.message}`),
        );
      }
    });
  });
}
