/**
 * Hongguo & Short Drama Download Manager
 *
 * Handles:
 * - Concurrent queue scheduling (1-10 workers)
 * - Stream downloading with byte progress & speed calculation
 * - Transparent MP4 CENC-AES-CTR decryption on finish
 * - Task persistence across app launches
 * - Lossless FFmpeg episode concatenation
 */

import { app, BrowserWindow, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { execFile, spawn } from 'child_process';
import { store } from '../../store';
import { getWorkItemById, saveWorkItem } from '../../workItemStore';
import type {
  ShortDramaDownloadTask,
  ShortDramaSettings,
} from '../../../../types/shortDrama';
import {
  deriveKey,
  decryptMp4File,
  HONGGUO_UA,
  HONGGUO_VIDEO_REFERER,
} from './hongguoService';
import { fetchDramaPlayUrl } from '../providers';

const DEFAULT_SETTINGS: ShortDramaSettings = {
  root: '',
  name_format: '{series_title} - E{vid_index}',
  max_concurrent: 3,
  auto_merge: false,
};

export class ShortDramaManager {
  private static instance: ShortDramaManager | null = null;
  private settings: ShortDramaSettings;
  private tasks: Map<string, ShortDramaDownloadTask> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
  private activeCount = 0;
  private windowRef: BrowserWindow | null = null;
  private settingsPath: string;
  private tasksPath: string;

  private constructor() {
    const userData = app?.getPath ? app.getPath('userData') : process.cwd();
    this.settingsPath = path.join(userData, 'short_drama_settings.json');
    this.tasksPath = path.join(userData, 'short_drama_tasks.json');

    const globalSettings = (store.get('settings') || {}) as any;
    const defaultDownloads =
      globalSettings?.videoDownloadSavePath ||
      (app?.getPath
        ? path.join(app.getPath('downloads'), 'SmartSub_ShortDrama')
        : path.join(process.cwd(), 'downloads'));

    this.settings = { ...DEFAULT_SETTINGS, root: defaultDownloads };
    this.loadSettings();
    this.loadTasks();
  }

  public static getInstance(): ShortDramaManager {
    if (!ShortDramaManager.instance) {
      ShortDramaManager.instance = new ShortDramaManager();
    }
    return ShortDramaManager.instance;
  }

  public setWindow(win: BrowserWindow) {
    this.windowRef = win;
  }

  private notifyWindow(channel: string, payload: any) {
    if (this.windowRef && !this.windowRef.isDestroyed()) {
      try {
        this.windowRef.webContents.send(channel, payload);
      } catch {
        // window may be closing
      }
    }
  }

  public getSettings(): ShortDramaSettings {
    return { ...this.settings };
  }

  public updateSettings(newSettings: Partial<ShortDramaSettings>): ShortDramaSettings {
    this.settings = { ...this.settings, ...newSettings };
    if (!fs.existsSync(this.settings.root)) {
      try {
        fs.mkdirSync(this.settings.root, { recursive: true });
      } catch {}
    }
    if (newSettings.root) {
      try {
        const curSettings = (store.get('settings') || {}) as any;
        store.set('settings', { ...curSettings, videoDownloadSavePath: newSettings.root });
      } catch {}
    }
    this.saveSettings();
    this.scheduleNext();
    return { ...this.settings };
  }

  private loadSettings() {
    try {
      const globalSettings = (store.get('settings') || {}) as any;
      if (fs.existsSync(this.settingsPath)) {
        const raw = fs.readFileSync(this.settingsPath, 'utf8');
        const parsed = JSON.parse(raw);
        this.settings = { ...this.settings, ...parsed };
      }
      if (globalSettings?.videoDownloadSavePath) {
        if (!this.settings.root || this.settings.root.includes('SmartSub_ShortDrama')) {
          this.settings.root = globalSettings.videoDownloadSavePath;
        }
      }
    } catch (err) {
      console.warn('[ShortDramaManager] Failed to load settings:', err);
    }
    if (!fs.existsSync(this.settings.root)) {
      try {
        fs.mkdirSync(this.settings.root, { recursive: true });
      } catch {}
    }
  }

  private saveSettings() {
    try {
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf8');
    } catch (err) {
      console.warn('[ShortDramaManager] Failed to save settings:', err);
    }
  }

  private loadTasks() {
    try {
      if (fs.existsSync(this.tasksPath)) {
        const raw = fs.readFileSync(this.tasksPath, 'utf8');
        const list: ShortDramaDownloadTask[] = JSON.parse(raw);
        for (const t of list) {
          // If task was downloading/decrypting when app closed, set stopped
          if (t.status === 'downloading' || t.status === 'decrypting') {
            t.status = 'stopped';
          }
          this.tasks.set(t.id, t);
        }
      }
    } catch (err) {
      console.warn('[ShortDramaManager] Failed to load tasks:', err);
    }
  }

  private saveTasks() {
    try {
      const list = Array.from(this.tasks.values());
      fs.writeFileSync(this.tasksPath, JSON.stringify(list, null, 2), 'utf8');
    } catch (err) {
      console.warn('[ShortDramaManager] Failed to save tasks:', err);
    }
  }

  public getTasks(): ShortDramaDownloadTask[] {
    return Array.from(this.tasks.values());
  }

  public sanitizeFilename(name: string): string {
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
  }

  public formatFilename(
    template: string,
    seriesTitle: string,
    vidIndex: number,
    epTitle?: string,
    seriesTitleVi?: string
  ): string {
    const epPadded = String(vidIndex).padStart(2, '0');
    let out = template
      .replace(/\{series_title_vi\}/g, seriesTitleVi || seriesTitle)
      .replace(/\{series_title\}/g, seriesTitle)
      .replace(/\{vid_index\}/g, epPadded)
      .replace(/\{ep_title\}/g, epTitle || `Tập ${vidIndex}`);
    return this.sanitizeFilename(out) + '.mp4';
  }

  public addTasks(
    items: Array<{
      provider_id: string;
      series_id: string;
      series_title: string;
      series_title_vi?: string;
      vid: string;
      vid_index: number;
      ep_title?: string;
      cover?: string;
    }>
  ): ShortDramaDownloadTask[] {
    const added: ShortDramaDownloadTask[] = [];
    const first = items[0];
    const folderName = first?.series_title_vi && first.series_title_vi !== first.series_title
      ? `${this.sanitizeFilename(first.series_title_vi)} (${this.sanitizeFilename(first.series_title)})`
      : this.sanitizeFilename(first?.series_title || 'Series');

    const seriesDir = path.join(
      this.settings.root,
      folderName
    );
    if (!fs.existsSync(seriesDir)) {
      try {
        fs.mkdirSync(seriesDir, { recursive: true });
      } catch {}
    }

    for (const item of items) {
      const id = `${item.provider_id}_${item.series_id}_${item.vid_index}`;
      const existing = this.tasks.get(id);

      const filename = this.formatFilename(
        this.settings.name_format,
        item.series_title,
        item.vid_index,
        item.ep_title,
        item.series_title_vi
      );
      const savePath = path.join(seriesDir, filename);

      if (existing) {
        if (existing.status === 'completed' && fs.existsSync(existing.savePath || savePath)) {
          added.push(existing);
          continue;
        }
      }

      const task: ShortDramaDownloadTask = {
        id,
        provider_id: item.provider_id,
        series_id: item.series_id,
        series_title: item.series_title,
        series_title_vi: item.series_title_vi,
        vid: item.vid,
        vid_index: item.vid_index,
        ep_title: item.ep_title,
        cover: item.cover,
        filename,
        savePath,
        status: 'pending',
        progress: 0,
        receivedBytes: 0,
        totalBytes: 0,
        startTime: Date.now(),
      };

      this.tasks.set(id, task);
      added.push(task);
    }

    if (items.length > 0) {
      try {
        const seriesId = items[0].series_id;
        const seriesTitle = items[0].series_title;
        const workItemId = `shortdrama_${seriesId}`;
        const existing = getWorkItemById(workItemId);
        const downloadEntries = items.map((it) => ({
          id: `${it.provider_id}_${it.series_id}_${it.vid_index}`,
          url: `hongguo://series/${it.series_id}/${it.vid}`,
          engine: 'yt-dlp' as const,
          status: 'loading' as const,
          progress: 0,
          meta: {
            title: it.ep_title || `Tập ${it.vid_index}`,
            thumbnail: it.cover,
          },
        }));

        saveWorkItem({
          id: workItemId,
          name: `[Phim ngắn] ${seriesTitle}`,
          type: 'download',
          status: 'running',
          createdAt: existing?.createdAt || Date.now(),
          updatedAt: Date.now(),
          downloadEntries: [
            ...(existing?.downloadEntries || []).filter(
              (e) => !downloadEntries.some((d) => d.id === e.id)
            ),
            ...downloadEntries,
          ],
          artifacts: existing?.artifacts || [],
        });
      } catch (err) {
        console.warn('[ShortDramaManager] Failed to sync WorkItem on addTasks:', err);
      }
    }

    this.saveTasks();
    this.scheduleNext();
    return added;
  }

  public pauseTask(taskId: string) {
    const task = this.tasks.get(taskId);
    if (!task) return;
    if (task.status === 'downloading' || task.status === 'pending') {
      const controller = this.abortControllers.get(taskId);
      if (controller) {
        controller.abort();
        this.abortControllers.delete(taskId);
      }
      task.status = 'stopped';
      this.notifyTaskUpdate(task);
      this.saveTasks();
      this.scheduleNext();
    }
  }

  public resumeTask(taskId: string) {
    const task = this.tasks.get(taskId);
    if (!task) return;
    if (task.status === 'stopped' || task.status === 'failed') {
      task.status = 'pending';
      task.error = undefined;
      this.notifyTaskUpdate(task);
      this.saveTasks();
      this.scheduleNext();
    }
  }

  public retryTask(taskId: string) {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.status = 'pending';
    task.progress = 0;
    task.receivedBytes = 0;
    task.totalBytes = 0;
    task.error = undefined;
    this.notifyTaskUpdate(task);
    this.saveTasks();
    this.scheduleNext();
  }

  public deleteTask(taskId: string, deleteFile = false) {
    const task = this.tasks.get(taskId);
    if (!task) return;
    const controller = this.abortControllers.get(taskId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(taskId);
    }
    if (deleteFile && task.savePath && fs.existsSync(task.savePath)) {
      try {
        fs.unlinkSync(task.savePath);
      } catch {}
    }
    this.tasks.delete(taskId);
    this.saveTasks();
    this.notifyWindow('short-drama:task-deleted', taskId);
    this.scheduleNext();
  }

  public pauseAll() {
    for (const [id, task] of this.tasks.entries()) {
      if (task.status === 'downloading' || task.status === 'pending') {
        const c = this.abortControllers.get(id);
        if (c) {
          c.abort();
          this.abortControllers.delete(id);
        }
        task.status = 'stopped';
        this.notifyTaskUpdate(task);
      }
    }
    this.saveTasks();
  }

  public resumeAll() {
    for (const task of this.tasks.values()) {
      if (task.status === 'stopped' || task.status === 'failed') {
        task.status = 'pending';
        task.error = undefined;
        this.notifyTaskUpdate(task);
      }
    }
    this.saveTasks();
    this.scheduleNext();
  }

  private notifyTaskUpdate(task: ShortDramaDownloadTask) {
    this.notifyWindow('short-drama:task-updated', task);
  }

  private scheduleNext() {
    const maxWorkers = Math.max(1, Math.min(10, this.settings.max_concurrent || 3));
    while (this.activeCount < maxWorkers) {
      const nextTask = Array.from(this.tasks.values()).find((t) => t.status === 'pending');
      if (!nextTask) break;
      this.startDownload(nextTask);
    }
  }

  private async startDownload(task: ShortDramaDownloadTask) {
    this.activeCount++;
    task.status = 'downloading';
    task.startTime = Date.now();
    task.error = undefined;
    this.notifyTaskUpdate(task);

    const controller = new AbortController();
    this.abortControllers.set(task.id, controller);

    const seriesDir = path.dirname(task.savePath || path.join(this.settings.root, 'Unknown'));
    if (!fs.existsSync(seriesDir)) {
      fs.mkdirSync(seriesDir, { recursive: true });
    }
    const finalPath = task.savePath || path.join(seriesDir, task.filename);
    const tempEncPath = `${finalPath}.enc.tmp`;

    try {
      // 1. Resolve playback stream & key via provider
      const playInfo = await fetchDramaPlayUrl(task.provider_id, task.vid, {
        series_id: task.series_id,
      });
      if (!playInfo || !playInfo.url) {
        throw new Error('Không lấy được link phát video');
      }

      // Check abort
      if (controller.signal.aborted) {
        throw new Error('Aborted');
      }

      // 2. Download stream (M3U8 via FFmpeg or MP4 stream)
      const reqHeaders = playInfo.headers || {
        'User-Agent': HONGGUO_UA,
        Referer: HONGGUO_VIDEO_REFERER,
      };

      if (playInfo.url.includes('.m3u8')) {
        await this.downloadM3u8WithFfmpeg(
          playInfo.url,
          finalPath,
          reqHeaders,
          controller.signal,
          task
        );
      } else {
        const response = await axios({
          method: 'GET',
          url: playInfo.url,
          headers: reqHeaders,
          responseType: 'stream',
          signal: controller.signal,
          timeout: 30000,
        });

        const totalLength = parseInt(response.headers['content-length'] || '0', 10);
        task.totalBytes = totalLength;

        const writer = fs.createWriteStream(tempEncPath);
        let receivedBytes = 0;
        let lastTime = Date.now();
        let lastBytes = 0;

        await new Promise<void>((resolve, reject) => {
          response.data.on('data', (chunk: Buffer) => {
            receivedBytes += chunk.length;
            task.receivedBytes = receivedBytes;
            if (totalLength > 0) {
              task.progress = Math.min(99, Math.round((receivedBytes / totalLength) * 100));
            }

            const now = Date.now();
            if (now - lastTime >= 500) {
              const timeDiff = (now - lastTime) / 1000;
              task.speed = Math.round((receivedBytes - lastBytes) / timeDiff);
              lastTime = now;
              lastBytes = receivedBytes;
              this.notifyTaskUpdate(task);
            }
          });

          response.data.pipe(writer);

          writer.on('finish', () => resolve());
          writer.on('error', (err) => reject(err));
          response.data.on('error', (err: any) => reject(err));
        });

        if (controller.signal.aborted) {
          throw new Error('Aborted');
        }

        // 3. Decryption phase
        if (playInfo.spadeA) {
          task.status = 'decrypting';
          task.progress = 99;
          this.notifyTaskUpdate(task);

          const aesKey = deriveKey(playInfo.spadeA);
          if (!aesKey) {
            throw new Error('Không thể giải mã khoá spade_a (khoá không hợp lệ)');
          }
          decryptMp4File(tempEncPath, finalPath, aesKey);
          try {
            fs.unlinkSync(tempEncPath);
          } catch {}
        } else {
          // Plaintext direct MP4
          if (fs.existsSync(finalPath)) {
            try {
              fs.unlinkSync(finalPath);
            } catch {}
          }
          fs.renameSync(tempEncPath, finalPath);
        }
      }

      task.status = 'completed';
      task.progress = 100;
      task.endTime = Date.now();
      task.savePath = finalPath;
      this.notifyTaskUpdate(task);
      this.saveTasks();

      // Sync completed episode into SmartSub WorkItem
      try {
        const workItemId = `shortdrama_${task.series_id}`;
        const workItem = getWorkItemById(workItemId);
        if (workItem) {
          const artifacts = [...(workItem.artifacts || [])];
          if (!artifacts.some((a) => a.path === finalPath)) {
            artifacts.push({ kind: 'video', path: finalPath });
          }
          const seriesTasks = Array.from(this.tasks.values()).filter((t) => t.series_id === task.series_id);
          const allDone = seriesTasks.length > 0 && seriesTasks.every((t) => t.status === 'completed');
          saveWorkItem({
            ...workItem,
            status: allDone ? 'done' : 'running',
            artifacts,
            updatedAt: Date.now(),
            finishedAt: allDone ? Date.now() : undefined,
          });
        }
      } catch (err) {
        console.warn('[ShortDramaManager] Failed to sync WorkItem on finish:', err);
      }

      // Check auto merge
      if (this.settings.auto_merge) {
        this.checkAutoMerge(task.series_id);
      }
    } catch (err: any) {
      if (controller.signal.aborted || err.message === 'Aborted') {
        task.status = 'stopped';
      } else {
        task.status = 'failed';
        task.error = err.message || String(err);
      }
      try {
        if (fs.existsSync(tempEncPath)) {
          fs.unlinkSync(tempEncPath);
        }
      } catch {}
      this.notifyTaskUpdate(task);
      this.saveTasks();
    } finally {
      this.abortControllers.delete(task.id);
      this.activeCount--;
      this.scheduleNext();
    }
  }

  private checkAutoMerge(seriesId: string) {
    const seriesTasks = Array.from(this.tasks.values()).filter((t) => t.series_id === seriesId);
    const allDone = seriesTasks.length > 0 && seriesTasks.every((t) => t.status === 'completed');
    if (allDone) {
      this.mergeSeries(seriesId).catch((err) =>
        console.warn('[ShortDramaManager] Auto merge failed:', err)
      );
    }
  }

  private getFfmpegBinary(): string {
    try {
      const staticPath = require('ffmpeg-static');
      if (staticPath && fs.existsSync(staticPath)) return staticPath;
    } catch {}
    return 'ffmpeg';
  }

  private async downloadM3u8WithFfmpeg(
    m3u8Url: string,
    outputPath: string,
    headers: Record<string, string>,
    signal: AbortSignal,
    task: ShortDramaDownloadTask
  ): Promise<void> {
    const ffmpegBin = this.getFfmpegBinary();
    const headerLines = Object.entries(headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\r\n');

    const args = [
      '-y',
      '-headers',
      `${headerLines}\r\n`,
      '-i',
      m3u8Url,
      '-c',
      'copy',
      '-bsf:a',
      'aac_adtstoasc',
      outputPath,
    ];

    await new Promise<void>((resolve, reject) => {
      const child = spawn(ffmpegBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

      const onAbort = () => {
        try {
          child.kill('SIGKILL');
        } catch {}
        reject(new Error('Aborted'));
      };

      if (signal.aborted) {
        onAbort();
        return;
      }

      signal.addEventListener('abort', onAbort, { once: true });

      let lastProgressTime = Date.now();
      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        const timeMatch = text.match(/time=(\d+):(\d+):(\d+)/);
        if (timeMatch) {
          const now = Date.now();
          if (now - lastProgressTime >= 1000) {
            lastProgressTime = now;
            task.progress = Math.min(95, (task.progress || 10) + 5);
            this.notifyTaskUpdate(task);
          }
        }
      });

      child.on('close', (code) => {
        signal.removeEventListener('abort', onAbort);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });

      child.on('error', (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      });
    });
  }

  /**
   * Fast lossless merge of all completed episodes of a series using FFmpeg concat stream-copy
   */
  public async mergeSeries(seriesId: string, customOutName?: string): Promise<string> {
    const seriesTasks = Array.from(this.tasks.values())
      .filter((t) => t.series_id === seriesId && t.status === 'completed' && t.savePath && fs.existsSync(t.savePath))
      .sort((a, b) => a.vid_index - b.vid_index);

    if (seriesTasks.length === 0) {
      throw new Error('Chưa có tập nào hoàn thành để ghép nối');
    }

    const seriesTitle = seriesTasks[0].series_title;
    const seriesDir = path.dirname(seriesTasks[0].savePath!);
    const outFileName = customOutName
      ? this.sanitizeFilename(customOutName) + '.mp4'
      : `${this.sanitizeFilename(seriesTitle)} - Full_${seriesTasks.length}_Tập.mp4`;
    const outFilePath = path.join(seriesDir, outFileName);

    const listFilePath = path.join(seriesDir, `concat_list_${Date.now()}.txt`);
    const listContent = seriesTasks
      .map((t) => `file '${t.savePath!.replace(/'/g, "'\\''")}'`)
      .join('\n');

    fs.writeFileSync(listFilePath, listContent, 'utf8');
    const ffmpegBin = this.getFfmpegBinary();

    return new Promise((resolve, reject) => {
      execFile(
        ffmpegBin,
        ['-f', 'concat', '-safe', '0', '-i', listFilePath, '-c', 'copy', '-y', outFilePath],
        (err) => {
          try {
            fs.unlinkSync(listFilePath);
          } catch {}
          if (err) {
            reject(new Error(`Ghép video thất bại: ${err.message}`));
          } else {
            resolve(outFilePath);
          }
        }
      );
    });
  }

  public openSeriesFolder(seriesId: string) {
    const task = Array.from(this.tasks.values()).find((t) => t.series_id === seriesId && t.savePath);
    if (task && task.savePath) {
      const dir = path.dirname(task.savePath);
      if (fs.existsSync(dir)) {
        shell.openPath(dir);
        return;
      }
    }
    if (fs.existsSync(this.settings.root)) {
      shell.openPath(this.settings.root);
    }
  }
}
