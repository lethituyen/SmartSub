import React, { useRef, useState, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { cn } from 'lib/utils';

export interface TimelineTrimmerBarProps {
  duration: number;
  currentTime: number;
  inPoint: number;
  outPoint: number;
  onSeek: (time: number) => void;
  onChangeRange: (newIn: number, newOut: number) => void;
  disabled?: boolean;
  className?: string;
}

function formatTime(sec: number): string {
  const safe = Math.max(0, sec);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const ms = Math.floor((safe % 1) * 10);

  const pad = (n: number, l = 2) => String(n).padStart(l, '0');
  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}.${ms}`;
  }
  return `${pad(m)}:${pad(s)}.${ms}`;
}

type DragHandle = 'in' | 'out' | null;

export default function TimelineTrimmerBar({
  duration,
  currentTime,
  inPoint,
  outPoint,
  onSeek,
  onChangeRange,
  disabled = false,
  className,
}: TimelineTrimmerBarProps) {
  const { t } = useTranslation('toolbox');
  const trackRef = useRef<HTMLDivElement>(null);

  // 鼠标悬停时的预览时间与横坐标
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number>(0);

  // 正在拖动的手柄类型：'in' | 'out' | null
  const [activeHandle, setActiveHandle] = useState<DragHandle>(null);

  const totalDuration = Math.max(0.1, duration || 1);

  const inPointRef = useRef(inPoint);
  const outPointRef = useRef(outPoint);
  const totalDurationRef = useRef(totalDuration);
  inPointRef.current = inPoint;
  outPointRef.current = outPoint;
  totalDurationRef.current = totalDuration;

  const isDraggingRef = useRef(false);

  // 时间转换为百分比 (0 ~ 100)
  const timeToPercent = useCallback(
    (t: number) => {
      const clamped = Math.max(0, Math.min(totalDuration, t));
      return (clamped / totalDuration) * 100;
    },
    [totalDuration],
  );

  // 像素横坐标转换为时间 (秒)
  const clientXToTime = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return 0;
      const rect = trackRef.current.getBoundingClientRect();
      if (rect.width <= 0) return 0;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * totalDuration;
    },
    [totalDuration],
  );

  // 鼠标在轨道上移动时的悬浮时间提示
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled || activeHandle) return;
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const t = clientXToTime(e.clientX);
    setHoverTime(t);
    setHoverX(x);
  };

  const handleMouseLeave = () => {
    if (!activeHandle) {
      setHoverTime(null);
    }
  };

  // 开始拖动两端手柄 ('in' 或 'out')
  const startDrag = (handle: 'in' | 'out', e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();

    setActiveHandle(handle);
    isDraggingRef.current = true;

    const onWindowMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const currentT = clientXToTime(moveEvent.clientX);
      const curIn = inPointRef.current;
      const curOut = outPointRef.current;
      const curDuration = totalDurationRef.current;

      if (handle === 'in') {
        // 限制：0 <= newIn <= curOut - 0.1
        const maxIn = Math.max(0, curOut - 0.1);
        const newIn = Math.max(0, Math.min(maxIn, currentT));
        onChangeRange(newIn, curOut);
        onSeek(newIn);
      } else if (handle === 'out') {
        // 限制：curIn + 0.1 <= newOut <= curDuration
        const minOut = Math.min(curDuration, curIn + 0.1);
        const newOut = Math.max(minOut, Math.min(curDuration, currentT));
        onChangeRange(curIn, newOut);
        onSeek(newOut);
      }
    };

    const onWindowMouseUp = (upEvent: MouseEvent) => {
      upEvent.preventDefault();
      setActiveHandle(null);
      setHoverTime(null);
      setTimeout(() => {
        isDraggingRef.current = false;
      }, 50);
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
    };

    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
  };

  // 点击轨道空白处：就近吸附手柄或在选区内快速跳转播放点
  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled || activeHandle || isDraggingRef.current) return;
    const clickT = clientXToTime(e.clientX);

    if (clickT < inPointRef.current) {
      // 点击在入点左侧：直接将入点拉伸至该位置
      onChangeRange(clickT, outPointRef.current);
      onSeek(clickT);
    } else if (clickT > outPointRef.current) {
      // 点击在出点右侧：直接将出点拉伸至该位置
      onChangeRange(inPointRef.current, clickT);
      onSeek(clickT);
    } else {
      // 点击在选区内部：仅跳转当前播放位置供预览
      onSeek(clickT);
    }
  };

  const leftPercent = timeToPercent(inPoint);
  const rightPercent = timeToPercent(outPoint);
  const playheadPercent = timeToPercent(currentTime);

  return (
    <div className={cn('relative w-full select-none py-1.5', className)}>
      {/* 鼠标悬浮时间气泡 */}
      {hoverTime !== null && !activeHandle && (
        <div
          className="pointer-events-none absolute -top-5 z-40 -translate-x-1/2 rounded bg-zinc-900/90 px-1.5 py-0.5 text-[10px] font-mono text-zinc-100 shadow-md backdrop-blur border border-zinc-700/60"
          style={{ left: hoverX }}
        >
          {formatTime(hoverTime)}
        </div>
      )}

      {/* 轨道主容器 */}
      <div
        ref={trackRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleTrackClick}
        className={cn(
          'relative h-9 w-full rounded-lg border border-border/80 bg-muted/50 cursor-pointer shadow-inner',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        {/* 背景与遮罩层（限制在圆角轨道内，避免手柄被外部剪裁） */}
        <div className="absolute inset-0 rounded-lg overflow-hidden pointer-events-none">
          {/* 背景刻度标尺微格装饰 */}
          <div className="absolute inset-0 opacity-10 bg-[repeating-linear-gradient(90deg,transparent,transparent_19px,currentColor_20px)] text-foreground/50" />

          {/* 左侧非选区暗幕 */}
          <div
            className="absolute top-0 bottom-0 left-0 bg-black/55"
            style={{ width: `${leftPercent}%` }}
          />

          {/* 右侧非选区暗幕 */}
          <div
            className="absolute top-0 bottom-0 right-0 bg-black/55"
            style={{ width: `${Math.max(0, 100 - rightPercent)}%` }}
          />

          {/* 中间高亮选区 */}
          <div
            className="absolute top-0 bottom-0 bg-primary/20 border-y-2 border-primary/60 flex items-center justify-center overflow-hidden"
            style={{
              left: `${leftPercent}%`,
              width: `${Math.max(0, rightPercent - leftPercent)}%`,
            }}
          >
            <span className="text-[11px] font-mono font-medium text-primary/70 select-none">
              {formatTime(outPoint - inPoint)}
            </span>
          </div>

          {/* 只读播放头指示线 */}
          <div
            className="absolute top-0 bottom-0 w-0.5 -ml-[1px] bg-red-500 z-10 shadow-[0_0_6px_rgba(239,68,68,0.8)]"
            style={{ left: `${playheadPercent}%` }}
          >
            <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 bg-red-500 rotate-45 shadow-sm" />
          </div>
        </div>

        {/* 左端手柄：入点 (In Handle) */}
        <div
          onMouseDown={(e) => startDrag('in', e)}
          className={cn(
            'absolute top-0 bottom-0 w-6 -ml-3 flex items-center justify-center rounded-l-md bg-primary text-primary-foreground shadow-md cursor-ew-resize hover:bg-primary/90 transition-transform active:scale-105 z-30 select-none border border-primary-foreground/20',
            activeHandle === 'in' && 'ring-2 ring-primary ring-offset-1 scale-105',
          )}
          style={{ left: `${leftPercent}%` }}
          title={t('videoTrimmer.dragInHandle')}
        >
          <span className="font-mono text-xs font-bold leading-none select-none pointer-events-none">
            [
          </span>
        </div>

        {/* 右端手柄：出点 (Out Handle) */}
        <div
          onMouseDown={(e) => startDrag('out', e)}
          className={cn(
            'absolute top-0 bottom-0 w-6 -ml-3 flex items-center justify-center rounded-r-md bg-primary text-primary-foreground shadow-md cursor-ew-resize hover:bg-primary/90 transition-transform active:scale-105 z-30 select-none border border-primary-foreground/20',
            activeHandle === 'out' && 'ring-2 ring-primary ring-offset-1 scale-105',
          )}
          style={{ left: `${rightPercent}%` }}
          title={t('videoTrimmer.dragOutHandle')}
        >
          <span className="font-mono text-xs font-bold leading-none select-none pointer-events-none">
            ]
          </span>
        </div>
      </div>
    </div>
  );
}
