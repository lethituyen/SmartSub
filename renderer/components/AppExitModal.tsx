import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, LogOut, Undo2, Minimize2, Save } from 'lucide-react';

interface ExitModalData {
  busyCount: number;
  isDirty: boolean;
  canBackground?: boolean;
}

export function AppExitModal() {
  const router = useRouter();
  const locale = router.locale || 'vi';

  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<ExitModalData>({
    busyCount: 0,
    isDirty: false,
    canBackground: false,
  });

  useEffect(() => {
    if (!window?.ipc?.on) return;
    const unsub = window.ipc.on(
      'app:request-window-close',
      (payload: ExitModalData) => {
        setData(payload || { busyCount: 0, isDirty: false, canBackground: false });
        setIsOpen(true);
      },
    );
    return () => unsub?.();
  }, []);

  const handleCancel = () => {
    setIsOpen(false);
  };

  const handleConfirmExit = () => {
    setIsOpen(false);
    window?.ipc?.send('app:confirm-window-close', true);
  };

  const handleMinimizeBackground = () => {
    setIsOpen(false);
    window?.ipc?.send('app:minimize-to-background', true);
  };

  const isVi = locale === 'vi';
  const isZh = locale === 'zh';

  const title = (() => {
    if (data.busyCount > 0) {
      if (isVi) return 'Vẫn còn tác vụ đang chạy ngầm';
      if (isZh) return '后台仍有任务在运行';
      return 'Tasks Still Running in Background';
    }
    if (data.isDirty) {
      if (isVi) return 'Có thay đổi chưa được lưu';
      if (isZh) return '当前存在未保存的内容';
      return 'Unsaved Changes';
    }
    if (isVi) return 'Xác nhận thoát ứng dụng';
    if (isZh) return '确认退出 SmartSub';
    return 'Confirm Exit';
  })();

  const description = (() => {
    if (data.busyCount > 0) {
      if (isVi) {
        return `Hiện có ${data.busyCount} tác vụ đang được xử lý ngầm. Nếu thoát lúc này, tiến trình sẽ bị gián đoạn và hủy bỏ.`;
      }
      if (isZh) {
        return `当前仍有 ${data.busyCount} 个任务在后台处理中。此时退出将中断并取消正在执行的操作。`;
      }
      return `${data.busyCount} task(s) are still processing. Quitting now will cancel the current operations.`;
    }
    if (data.isDirty) {
      if (isVi) {
        return 'Phiên làm việc hiện tại có dữ liệu hoặc hàng đợi chưa hoàn tất. Bạn có chắc chắn muốn đóng ứng dụng không?';
      }
      if (isZh) {
        return '当前工作区包含未提交的修改或未完成的任务队列。退出可能会丢失未保存的改动。';
      }
      return 'Your current workspace contains unsaved changes or active queues. Are you sure you want to exit?';
    }
    if (isVi) {
      return 'Bạn có chắc chắn muốn đóng và thoát khỏi ứng dụng SmartSub không?';
    }
    if (isZh) {
      return '您确定要关闭并退出 SmartSub 吗？';
    }
    return 'Are you sure you want to close and exit SmartSub?';
  })();

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogContent className="max-w-md border border-border/80 bg-background/95 shadow-2xl backdrop-blur-xl rounded-2xl p-6">
        <AlertDialogHeader className="space-y-3">
          <div className="flex items-center gap-3">
            {data.busyCount > 0 ? (
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/30">
                <AlertTriangle className="h-6 w-6 animate-pulse" />
              </div>
            ) : data.isDirty ? (
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500/15 text-orange-500 ring-1 ring-orange-500/30">
                <Save className="h-6 w-6" />
              </div>
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
                <LogOut className="h-6 w-6" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <AlertDialogTitle className="text-base font-semibold text-foreground">
                  {title}
                </AlertDialogTitle>
                {data.busyCount > 0 && (
                  <Badge variant="outline" className="border-amber-500/40 text-amber-500 text-[11px] font-mono">
                    {data.busyCount} active
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">SmartSub Studio</p>
            </div>
          </div>
          <AlertDialogDescription className="text-xs leading-relaxed text-muted-foreground pt-1">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="mt-5 flex-row items-center justify-end gap-2.5 sm:space-x-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancel}
            className="h-9 px-3.5 text-xs gap-1.5 hover:bg-muted/60"
          >
            <Undo2 className="h-3.5 w-3.5" />
            {isVi ? 'Tiếp tục làm việc' : isZh ? '继续编辑' : 'Keep Working'}
          </Button>

          {data.canBackground && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleMinimizeBackground}
              className="h-9 px-3.5 text-xs gap-1.5"
            >
              <Minimize2 className="h-3.5 w-3.5" />
              {isVi ? 'Chạy ngầm' : isZh ? '转入后台' : 'Background'}
            </Button>
          )}

          <Button
            variant="destructive"
            size="sm"
            onClick={handleConfirmExit}
            className="h-9 px-4 text-xs gap-1.5 bg-red-600 hover:bg-red-700 text-white shadow-sm"
          >
            <LogOut className="h-3.5 w-3.5" />
            {isVi ? 'Thoát ứng dụng' : isZh ? '退出应用' : 'Exit App'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
