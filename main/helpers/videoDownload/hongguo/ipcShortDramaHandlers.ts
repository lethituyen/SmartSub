/**
 * IPC Handlers for Short Drama & Video Downloader
 */

import { BrowserWindow, dialog, shell } from 'electron';
import { ipcMain } from '../../../automation/handlers';
import { ShortDramaManager } from './hongguoManager';
import { resolveDrama, PROVIDERS } from '../providers';
import { TrendingService } from '../shortDrama/trendingService';
import type { ShortDramaSettings } from '../../../../types/shortDrama';

export function registerShortDramaHandlers(mainWindow: BrowserWindow): void {
  const manager = ShortDramaManager.getInstance();
  manager.setWindow(mainWindow);

  // 0. List supported providers
  ipcMain.handle('short-drama:list-providers', async () => {
    return PROVIDERS.map((p) => ({
      id: p.id,
      name: p.name,
      badge: p.badge,
    }));
  });

  // 0.1 Real-time trending feed
  ipcMain.handle(
    'short-drama:get-trending',
    async (_event, payload?: { category?: string; query?: string; refresh?: boolean }) => {
      try {
        const trendingService = TrendingService.getInstance();
        const items = await trendingService.getRealtimeTrending(
          payload?.category || 'all',
          payload?.query,
          payload?.refresh
        );
        return { success: true, items };
      } catch (err: any) {
        return { success: false, items: [], error: err.message };
      }
    }
  );

  // 1. Resolve series information (multi-platform: Hongguo, Qimao, Kuaishou, Douyin, Generic)
  ipcMain.handle(
    'short-drama:resolve',
    async (_event, payload: { input: string; providerId?: string }) => {
      try {
        const { series, provider } = await resolveDrama(payload.input, payload.providerId);
        return { success: true, series, provider: { id: provider.id, name: provider.name, badge: provider.badge } };
      } catch (err: any) {
        return { success: false, error: err.message || 'Lỗi phân tích phim' };
      }
    }
  );

  // 2. Add tasks
  ipcMain.handle(
    'short-drama:add-tasks',
    async (
      _event,
      items: Array<{
        provider_id: string;
        series_id: string;
        series_title: string;
        vid: string;
        vid_index: number;
        ep_title?: string;
        cover?: string;
      }>
    ) => {
      try {
        const added = manager.addTasks(items);
        return { success: true, count: added.length };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  // 3. Task queries & actions
  ipcMain.handle('short-drama:get-tasks', async () => {
    return manager.getTasks();
  });

  ipcMain.handle('short-drama:pause-task', async (_event, taskId: string) => {
    manager.pauseTask(taskId);
    return { success: true };
  });

  ipcMain.handle('short-drama:resume-task', async (_event, taskId: string) => {
    manager.resumeTask(taskId);
    return { success: true };
  });

  ipcMain.handle('short-drama:retry-task', async (_event, taskId: string) => {
    manager.retryTask(taskId);
    return { success: true };
  });

  ipcMain.handle(
    'short-drama:delete-task',
    async (_event, payload: { taskId: string; deleteFile?: boolean }) => {
      manager.deleteTask(payload.taskId, payload.deleteFile);
      return { success: true };
    }
  );

  ipcMain.handle('short-drama:pause-all', async () => {
    manager.pauseAll();
    return { success: true };
  });

  ipcMain.handle('short-drama:resume-all', async () => {
    manager.resumeAll();
    return { success: true };
  });

  // 4. Concat merge
  ipcMain.handle(
    'short-drama:merge-series',
    async (_event, payload: { seriesId: string; customOutName?: string }) => {
      try {
        const outPath = await manager.mergeSeries(payload.seriesId, payload.customOutName);
        return { success: true, outPath };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  // 5. Open directory
  ipcMain.handle('short-drama:open-folder', async (_event, seriesId?: string) => {
    if (seriesId) {
      manager.openSeriesFolder(seriesId);
    } else {
      const s = manager.getSettings();
      shell.openPath(s.root);
    }
    return { success: true };
  });

  // 6. Settings
  ipcMain.handle('short-drama:get-settings', async () => {
    return manager.getSettings();
  });

  ipcMain.handle(
    'short-drama:save-settings',
    async (_event, settings: Partial<ShortDramaSettings>) => {
      const updated = manager.updateSettings(settings);
      return { success: true, settings: updated };
    }
  );

  // 8. VietPhrase Title & Text Translation
  ipcMain.handle('short-drama:translate-title', async (_event, title: string) => {
    try {
      const { TitleTranslator } = require('../shortDrama/titleTranslator');
      return { success: true, ...TitleTranslator.getInstance().translateTitle(title) };
    } catch (err: any) {
      return { success: false, error: err.message, original: title, vietnamese: title };
    }
  });

  ipcMain.handle('short-drama:translate-text', async (_event, text: string) => {
    try {
      const { TitleTranslator } = require('../shortDrama/titleTranslator');
      return { success: true, text: TitleTranslator.getInstance().translateText(text) };
    } catch (err: any) {
      return { success: false, error: err.message, text };
    }
  });

  ipcMain.handle('short-drama:add-custom-word', async (_event, payload: { zh: string; vi: string }) => {
    try {
      const { TitleTranslator } = require('../shortDrama/titleTranslator');
      const ok = TitleTranslator.getInstance().addCustomWord(payload.zh, payload.vi);
      return { success: ok };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('short-drama:get-vietphrase-stats', async () => {
    try {
      const { TitleTranslator } = require('../shortDrama/titleTranslator');
      return { success: true, ...TitleTranslator.getInstance().getStats() };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
}

