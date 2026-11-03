import React, { useRef, useState } from 'react';
import type { WatermarkConfig } from '../../../types/subtitleMerge';

interface Props {
  config?: WatermarkConfig;
  width: number;
  height: number;
  disabled?: boolean;
  onUpdate?: (update: Partial<WatermarkConfig>) => void;
}

export default function WatermarkCanvas({
  config,
  width,
  height,
  disabled = false,
  onUpdate,
}: Props) {
  const [dragState, setDragState] = useState<{
    pointerId: number;
    startX: number;
    startY: number;
    initialXPercent: number;
    initialYPercent: number;
    currentXPercent: number;
    currentYPercent: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  if (!config?.enabled || !config.imagePath || width <= 0 || height <= 0) {
    return null;
  }

  const scalePercent = config.scalePercent ?? 15;
  const opacity = (config.opacity ?? 90) / 100;
  const targetWidthPx = Math.max(32, (width * scalePercent) / 100);

  // 计算当前显示位置 (百分比)
  let posXPercent = 85;
  let posYPercent = 5;

  if (config.positionPreset === 'top-left') {
    posXPercent = (24 / width) * 100;
    posYPercent = (24 / height) * 100;
  } else if (config.positionPreset === 'bottom-left') {
    posXPercent = (24 / width) * 100;
    posYPercent = Math.max(0, 100 - (24 / height) * 100 - (targetWidthPx * 0.4 / height) * 100);
  } else if (config.positionPreset === 'bottom-right') {
    posXPercent = Math.max(0, 100 - (targetWidthPx / width) * 100 - (24 / width) * 100);
    posYPercent = Math.max(0, 100 - (24 / height) * 100 - (targetWidthPx * 0.4 / height) * 100);
  } else if (config.positionPreset === 'custom') {
    posXPercent = config.xPercent ?? 85;
    posYPercent = config.yPercent ?? 5;
  } else {
    // default top-right
    posXPercent = Math.max(0, 100 - (targetWidthPx / width) * 100 - (24 / width) * 100);
    posYPercent = (24 / height) * 100;
  }

  const effectiveXPercent = dragState ? dragState.currentXPercent : posXPercent;
  const effectiveYPercent = dragState ? dragState.currentYPercent : posYPercent;

  const startDrag = (e: React.PointerEvent) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    e.currentTarget.setPointerCapture(e.pointerId);

    setDragState({
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      initialXPercent: effectiveXPercent,
      initialYPercent: effectiveYPercent,
      currentXPercent: effectiveXPercent,
      currentYPercent: effectiveYPercent,
    });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragState || dragState.pointerId !== e.pointerId || width <= 0 || height <= 0) return;
    const deltaX = e.clientX - dragState.startX;
    const deltaY = e.clientY - dragState.startY;

    const deltaXPercent = (deltaX / width) * 100;
    const deltaYPercent = (deltaY / height) * 100;

    const nextX = Math.max(0, Math.min(95, dragState.initialXPercent + deltaXPercent));
    const nextY = Math.max(0, Math.min(95, dragState.initialYPercent + deltaYPercent));

    setDragState((prev) =>
      prev ? { ...prev, currentXPercent: nextX, currentYPercent: nextY } : null,
    );
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
        positionPreset: 'custom',
        xPercent: Math.round(dragState.currentXPercent * 10) / 10,
        yPercent: Math.round(dragState.currentYPercent * 10) / 10,
      });
    }
    setDragState(null);
  };

  const imgSrc =
    config.imagePath.startsWith('http://') ||
    config.imagePath.startsWith('https://') ||
    config.imagePath.startsWith('data:')
      ? config.imagePath
      : `media://${encodeURIComponent(config.imagePath)}`;

  const hasBlur = Boolean(config.blurBackground);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[25]"
      data-watermark-canvas
    >
      <div
        ref={containerRef}
        data-watermark-box
        tabIndex={disabled ? -1 : 0}
        role="region"
        aria-label="Hình mờ Logo"
        className={`pointer-events-auto absolute select-none transition-all group/wm rounded-md p-1 border ${
          hasBlur
            ? 'backdrop-blur-md bg-black/40 shadow-md ring-1 ring-white/10'
            : ''
        } ${
          dragState
            ? 'cursor-grabbing border-primary/90 shadow-[0_0_12px_rgba(59,130,246,0.35)]'
            : hasBlur
              ? 'cursor-grab border-transparent hover:border-primary/60'
              : 'cursor-grab border-transparent hover:border-primary/60 hover:bg-black/20 hover:shadow-sm'
        }`}
        style={{
          left: `${effectiveXPercent}%`,
          top: `${effectiveYPercent}%`,
          width: `${targetWidthPx}px`,
          opacity,
        }}
        onPointerDown={startDrag}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDragState(null)}
      >
        <img
          src={imgSrc}
          alt="Watermark"
          className="w-full h-auto object-contain pointer-events-none select-none block"
          draggable={false}
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
              const ratio = Math.round((img.naturalWidth / img.naturalHeight) * 100) / 100;
              if (config.aspectRatio !== ratio && onUpdate) {
                onUpdate({ aspectRatio: ratio });
              }
            }
          }}
        />
      </div>
    </div>
  );
}
