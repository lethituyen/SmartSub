import React, { useRef, useState } from 'react';
import type { BlurSubtitleConfig } from '../../../types/subtitleMerge';

interface Props {
  config?: BlurSubtitleConfig;
  width: number;
  height: number;
  isVertical: boolean;
  disabled?: boolean;
  onUpdate?: (update: Partial<BlurSubtitleConfig>) => void;
}

export default function BlurMaskCanvas({
  config,
  width,
  height,
  isVertical,
  disabled = false,
  onUpdate,
}: Props) {
  const defaultYRatio = isVertical ? 0.685 : 0.84;
  const defaultHRatio = isVertical ? 0.125 : 0.11;
  const defaultWRatio = isVertical ? 0.86 : 0.8;

  const baseWidthRatio =
    config?.widthPercent !== undefined
      ? config.widthPercent / 100
      : defaultWRatio;
  const baseLeftRatio = (1 - baseWidthRatio) / 2;

  const baseHeightPercent =
    config?.heightPercent !== undefined
      ? config.heightPercent
      : defaultHRatio * 100;
  const baseYPercent =
    config?.yPercent !== undefined ? config.yPercent : defaultYRatio * 100;
  const strength = config?.blurStrength ?? 10;

  const [dragState, setDragState] = useState<{
    type: 'move' | 'resize-top' | 'resize-bottom';
    pointerId: number;
    startY: number;
    startYPercent: number;
    startHPercent: number;
    currentYPercent: number;
    currentHPercent: number;
  } | null>(null);

  const dragBoxRef = useRef<HTMLDivElement>(null);

  if (!config?.enabled || width <= 0 || height <= 0) {
    return null;
  }

  const effectiveYPercent = dragState
    ? dragState.currentYPercent
    : baseYPercent;
  const effectiveHPercent = dragState
    ? dragState.currentHPercent
    : baseHeightPercent;

  const startDrag = (
    e: React.PointerEvent,
    type: 'move' | 'resize-top' | 'resize-bottom',
  ) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    e.currentTarget.setPointerCapture(e.pointerId);

    setDragState({
      type,
      pointerId: e.pointerId,
      startY: e.clientY,
      startYPercent: effectiveYPercent,
      startHPercent: effectiveHPercent,
      currentYPercent: effectiveYPercent,
      currentHPercent: effectiveHPercent,
    });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragState || dragState.pointerId !== e.pointerId || height <= 0) return;
    const deltaY = e.clientY - dragState.startY;
    const deltaPercent = (deltaY / height) * 100;

    if (dragState.type === 'move') {
      const nextY = Math.max(
        0,
        Math.min(100 - dragState.currentHPercent, dragState.startYPercent + deltaPercent),
      );
      setDragState((prev) =>
        prev ? { ...prev, currentYPercent: nextY } : null,
      );
    } else if (dragState.type === 'resize-bottom') {
      const nextH = Math.max(3, Math.min(35, dragState.startHPercent + deltaPercent));
      setDragState((prev) =>
        prev ? { ...prev, currentHPercent: nextH } : null,
      );
    } else if (dragState.type === 'resize-top') {
      const maxDelta = dragState.startHPercent - 3;
      const appliedDelta = Math.min(deltaPercent, maxDelta);
      const nextY = Math.max(0, dragState.startYPercent + appliedDelta);
      const nextH = Math.max(3, Math.min(35, dragState.startHPercent - appliedDelta));
      setDragState((prev) =>
        prev ? { ...prev, currentYPercent: nextY, currentHPercent: nextH } : null,
      );
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    if (onUpdate) {
      onUpdate({
        yPercent: Math.round(dragState.currentYPercent * 10) / 10,
        heightPercent: Math.round(dragState.currentHPercent * 10) / 10,
        mode: 'manual',
      });
    }
    setDragState(null);
  };

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[10]"
      data-blur-mask-canvas
    >
      <div
        ref={dragBoxRef}
        data-blur-box
        tabIndex={disabled ? -1 : 0}
        role="region"
        aria-label="Vùng làm mờ che phụ đề gốc"
        className={`pointer-events-auto absolute select-none transition-all group/blurbox rounded-md ${dragState
          ? 'cursor-grabbing bg-white/10 shadow-[0_0_12px_rgba(251,191,36,0.35)]'
          : 'cursor-grab hover:border-amber-400/80 bg-white/5 hover:bg-white/10 hover:shadow-[0_0_8px_rgba(251,191,36,0.25)]'
          }`}
        style={{
          left: `${baseLeftRatio * 100}%`,
          width: `${baseWidthRatio * 100}%`,
          top: `${effectiveYPercent}%`,
          height: `${effectiveHPercent}%`,
          backdropFilter: `blur(${Math.min(Math.max(strength * 0.7, 4), 24)}px)`,
          WebkitBackdropFilter: `blur(${Math.min(Math.max(strength * 0.7, 4), 24)}px)`,
        }}
        onPointerDown={(e) => startDrag(e, 'move')}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDragState(null)}
        onKeyDown={(e) => {
          if (disabled || !onUpdate) return;
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            const step = (e.shiftKey ? 5 : 1) * (e.key === 'ArrowUp' ? -1 : 1);
            const nextY = Math.max(0, Math.min(100 - effectiveHPercent, effectiveYPercent + step));
            onUpdate({ yPercent: Math.round(nextY * 10) / 10, mode: 'manual' });
          }
        }}
      >
        {/* Mép trên kéo co giãn độ cao (chỉ hiện thanh mỏng khi hover) */}
        {!disabled && (
          <div
            className="pointer-events-auto absolute -top-1.5 left-0 right-0 h-3 flex items-center justify-center cursor-ns-resize z-20 opacity-0 group-hover/blurbox:opacity-100 transition-opacity"
            onPointerDown={(e) => startDrag(e, 'resize-top')}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <div className="w-10 h-1 rounded-full bg-amber-400/80 shadow-xs" />
          </div>
        )}

        {/* Mép dưới kéo co giãn độ cao (chỉ hiện thanh mỏng khi hover) */}
        {!disabled && (
          <div
            className="pointer-events-auto absolute -bottom-1.5 left-0 right-0 h-3 flex items-center justify-center cursor-ns-resize z-20 opacity-0 group-hover/blurbox:opacity-100 transition-opacity"
            onPointerDown={(e) => startDrag(e, 'resize-bottom')}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <div className="w-10 h-1 rounded-full bg-amber-400/80 shadow-xs" />
          </div>
        )}
      </div>
    </div>
  );
}
