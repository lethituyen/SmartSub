import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  RotateCcw,
  Trash2,
  Copy,
  PenTool,
  X,
  Loader2,
  Check,
  Languages,
  GripHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';

interface ChineseHandwritingPadProps {
  /** Callback when user selects/clicks a recognized Chinese character */
  onSelectCharacter?: (char: string) => void;
  /** Optional close callback if rendered in a modal/floating pad */
  onClose?: () => void;
  /** Title or context info (e.g. target cue index) */
  targetContext?: string;
}

interface Stroke {
  x: number[];
  y: number[];
  t: number[];
}

export default function ChineseHandwritingPad({
  onSelectCharacter,
  onClose,
  targetContext,
}: ChineseHandwritingPadProps) {
  const { t } = useTranslation('home');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Vị trí cửa sổ nổi (lưu trong localStorage)
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('smartsub_handwriting_pos');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (
            typeof parsed.x === 'number' &&
            typeof parsed.y === 'number' &&
            parsed.x >= 0 &&
            parsed.x < window.innerWidth &&
            parsed.y >= 0 &&
            parsed.y < window.innerHeight
          ) {
            return parsed;
          }
        }
      } catch {
        // ignore
      }
      // Vị trí mặc định: góc dưới bên phải, không che video bên trái và không che đỉnh danh sách sub
      const defaultX = Math.max(20, window.innerWidth - 330);
      const defaultY = Math.max(70, window.innerHeight - 520);
      return { x: defaultX, y: defaultY };
    }
    return { x: 200, y: 150 };
  });

  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    initX: number;
    initY: number;
  } | null>(null);

  const [language, setLanguage] = useState<'zh_CN' | 'zh_TW'>('zh_CN');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedChar, setCopiedChar] = useState<string | null>(null);

  const currentStrokeRef = useRef<Stroke | null>(null);
  const startTimeRef = useRef<number>(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const CANVAS_SIZE = 260;

  // Xử lý kéo thả cửa sổ nổi
  const handleDragStart = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: pos.x,
      initY: pos.y,
    };
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;

      const padWidth = 296;
      const padHeight = 480;
      const maxX = Math.max(10, window.innerWidth - padWidth - 10);
      const maxY = Math.max(10, window.innerHeight - padHeight - 10);

      const nextX = Math.min(maxX, Math.max(10, dragStartRef.current.initX + dx));
      const nextY = Math.min(maxY, Math.max(10, dragStartRef.current.initY + dy));

      setPos({ x: nextX, y: nextY });
    };

    const handleMouseUp = () => {
      if (dragStartRef.current) {
        dragStartRef.current = null;
        setIsDragging(false);
        try {
          localStorage.setItem('smartsub_handwriting_pos', JSON.stringify(pos));
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, pos]);

  // Đảm bảo không bị lọt ra ngoài khi resize cửa sổ
  useEffect(() => {
    const handleResize = () => {
      setPos((current) => {
        const padWidth = 296;
        const padHeight = 480;
        const maxX = Math.max(10, window.innerWidth - padWidth - 10);
        const maxY = Math.max(10, window.innerHeight - padHeight - 10);
        if (current.x > maxX || current.y > maxY) {
          return {
            x: Math.min(maxX, Math.max(10, current.x)),
            y: Math.min(maxY, Math.max(10, current.y)),
          };
        }
        return current;
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Draw rice-grid (ô chữ 米) and existing strokes
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // 1. Draw Rice-grid lines (米字格)
    const isDark = document.documentElement.classList.contains('dark');
    const gridColor = isDark
      ? 'rgba(255, 255, 255, 0.08)'
      : 'rgba(0, 0, 0, 0.07)';
    const borderColor = isDark
      ? 'rgba(255, 255, 255, 0.15)'
      : 'rgba(0, 0, 0, 0.12)';

    // Outer border
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(1, 1, width - 2, height - 2);

    // Dashed inner lines
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    // Horizontal center
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Vertical center
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.stroke();

    // Diagonals
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(width, height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(width, 0);
    ctx.lineTo(0, height);
    ctx.stroke();

    ctx.setLineDash([]); // Reset dash

    // 2. Draw user strokes
    const strokeColor = isDark ? '#f8fafc' : '#0f172a';
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const stroke of strokes) {
      if (!stroke.x.length) continue;
      ctx.beginPath();
      ctx.moveTo(stroke.x[0], stroke.y[0]);
      for (let i = 1; i < stroke.x.length; i++) {
        ctx.lineTo(stroke.x[i], stroke.y[i]);
      }
      ctx.stroke();
    }

    ctx.restore();
  }, [strokes]);

  // Canvas size setup for HiDPI
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = CANVAS_SIZE * dpr;
    canvas.height = CANVAS_SIZE * dpr;
    canvas.style.width = `${CANVAS_SIZE}px`;
    canvas.style.height = `${CANVAS_SIZE}px`;
    redrawCanvas();
  }, [redrawCanvas]);

  // Recognize handwriting with debouncing
  const recognize = useCallback(
    async (currentStrokes: Stroke[]) => {
      if (!currentStrokes.length) {
        setCandidates([]);
        return;
      }

      setLoading(true);
      const ink = currentStrokes.map((s) => [s.x, s.y, s.t]);

      try {
        let result: { success?: boolean; candidates?: string[] } = {};

        // 1. Try via Electron IPC
        if (typeof window !== 'undefined' && (window as any).ipc?.invoke) {
          result = await (window as any).ipc.invoke('handwriting:recognize', {
            ink,
            language,
            width: CANVAS_SIZE,
            height: CANVAS_SIZE,
          });
        } else {
          // 2. Fallback direct fetch in browser
          const itc =
            language === 'zh_TW'
              ? 'zh-hant-t-i0-handwrit'
              : 'zh-t-i0-handwrit';
          const resp = await fetch(
            `https://inputtools.google.com/request?itc=${itc}&app=translate`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                app_version: 0.4,
                api_level: '537.36',
                device: '5',
                input_type: '0',
                options: 'enable_pre_space',
                requests: [
                  {
                    writing_guide: {
                      writing_area_width: CANVAS_SIZE,
                      writing_area_height: CANVAS_SIZE,
                    },
                    pre_context: '',
                    max_num_results: 12,
                    max_completions: 0,
                    language: language === 'zh_TW' ? 'zh_TW' : 'zh_CN',
                    ink,
                  },
                ],
              }),
            },
          );
          const data = await resp.json();
          if (
            Array.isArray(data) &&
            data[0] === 'SUCCESS' &&
            Array.isArray(data[1]?.[0]?.[1])
          ) {
            result = { success: true, candidates: data[1][0][1] };
          }
        }

        if (result.success && Array.isArray(result.candidates)) {
          setCandidates(result.candidates);
        }
      } catch (err) {
        console.warn('Handwriting recognition failed:', err);
      } finally {
        setLoading(false);
      }
    },
    [language],
  );

  const scheduleRecognition = useCallback(
    (newStrokes: Stroke[]) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        recognize(newStrokes);
      }, 200);
    },
    [recognize],
  );

  // Mouse & Touch events
  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return {
      x: Math.round(clientX - rect.left),
      y: Math.round(clientY - rect.top),
    };
  };

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const { x, y } = getCoordinates(e);
    setIsDrawing(true);
    if (!startTimeRef.current) {
      startTimeRef.current = Date.now();
    }
    const t = Date.now() - startTimeRef.current;
    const newStroke: Stroke = { x: [x], y: [y], t: [t] };
    currentStrokeRef.current = newStroke;
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !currentStrokeRef.current) return;
    e.preventDefault();
    const { x, y } = getCoordinates(e);
    const t = Date.now() - startTimeRef.current;

    currentStrokeRef.current.x.push(x);
    currentStrokeRef.current.y.push(y);
    currentStrokeRef.current.t.push(t);

    // Fast local redraw of current stroke
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.scale(dpr, dpr);
    const isDark = document.documentElement.classList.contains('dark');
    ctx.strokeStyle = isDark ? '#f8fafc' : '#0f172a';
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const xs = currentStrokeRef.current.x;
    const ys = currentStrokeRef.current.y;
    if (xs.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(xs[xs.length - 2], ys[ys.length - 2]);
      ctx.lineTo(xs[xs.length - 1], ys[ys.length - 1]);
      ctx.stroke();
    }
    ctx.restore();
  };

  const handleEnd = () => {
    if (!isDrawing || !currentStrokeRef.current) return;
    setIsDrawing(false);
    const finishedStroke = currentStrokeRef.current;
    currentStrokeRef.current = null;

    if (finishedStroke.x.length > 0) {
      const nextStrokes = [...strokes, finishedStroke];
      setStrokes(nextStrokes);
      scheduleRecognition(nextStrokes);
    }
  };

  // Undo last stroke
  const handleUndo = () => {
    if (!strokes.length) return;
    const nextStrokes = strokes.slice(0, -1);
    setStrokes(nextStrokes);
    if (!nextStrokes.length) {
      startTimeRef.current = 0;
      setCandidates([]);
    } else {
      scheduleRecognition(nextStrokes);
    }
  };

  // Clear all
  const handleClear = () => {
    setStrokes([]);
    startTimeRef.current = 0;
    setCandidates([]);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    redrawCanvas();
  };

  // Select a recognized candidate
  const handleSelect = (char: string) => {
    onSelectCharacter?.(char);
    toast.success(`Đã chọn chữ: ${char}`);
    // Reset canvas for the next character
    handleClear();
  };

  const handleCopy = (char: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(char);
    setCopiedChar(char);
    toast.success(`Đã sao chép: ${char}`);
    setTimeout(() => setCopiedChar(null), 1500);
  };

  // Phím Esc đóng cửa sổ
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        left: `${pos.x}px`,
        top: `${pos.y}px`,
      }}
      className={`fixed z-50 flex flex-col w-[300px] p-3 rounded-xl border border-border/80 bg-background/95 backdrop-blur-md shadow-2xl text-foreground select-none transition-shadow ${
        isDragging ? 'ring-2 ring-amber-500/50 shadow-amber-500/20' : ''
      }`}
    >
      {/* Draggable Header */}
      <div
        onMouseDown={handleDragStart}
        className="flex items-center justify-between pb-2 mb-2 border-b cursor-grab active:cursor-grabbing select-none"
        title="Kéo thả thanh tiêu đề này để di chuyển vị trí"
      >
        <div className="flex items-center gap-1.5 pointer-events-none">
          <GripHorizontal className="h-4 w-4 text-muted-foreground/60" />
          <PenTool className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-xs font-semibold">
            {t('chineseHandwritingTitle') || 'Vẽ tay tìm chữ Hán'}
          </span>
          {targetContext && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">
              {targetContext}
            </Badge>
          )}
        </div>
        <div
          className="flex items-center gap-1"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Language Switch */}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
            onClick={() => {
              const next = language === 'zh_CN' ? 'zh_TW' : 'zh_CN';
              setLanguage(next);
              if (strokes.length) recognize(strokes);
            }}
            title={language === 'zh_CN' ? 'Đổi sang Phồn thể' : 'Đổi sang Giản thể'}
          >
            <Languages className="h-3 w-3" />
            {language === 'zh_CN' ? 'Giản' : 'Phồn'}
          </Button>

          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={onClose}
              title="Đóng (Esc)"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Canvas Area with Rice-grid */}
      <div className="relative mx-auto rounded-lg overflow-hidden border border-border/70 bg-card cursor-crosshair shadow-inner">
        <canvas
          ref={canvasRef}
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
          className="touch-none block"
        />

        {strokes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/40 font-medium">
            Vẽ chữ Hán vào đây...
          </div>
        )}

        {loading && (
          <div className="absolute top-2 right-2 pointer-events-none">
            <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
          </div>
        )}
      </div>

      {/* Action buttons (Undo, Clear) */}
      <div className="flex items-center justify-between mt-2 pt-1">
        <span className="text-[11px] text-muted-foreground">
          {strokes.length > 0 ? `${strokes.length} nét vẽ` : 'Dùng chuột/bút để vẽ'}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            disabled={strokes.length === 0}
            onClick={handleUndo}
            title="Xóa nét vừa vẽ (Undo)"
          >
            <RotateCcw className="h-3 w-3" />
            Hoàn tác
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-destructive"
            disabled={strokes.length === 0}
            onClick={handleClear}
            title="Xóa toàn bộ"
          >
            <Trash2 className="h-3 w-3" />
            Xóa
          </Button>
        </div>
      </div>

      {/* Candidates Section */}
      <div className="mt-2.5 pt-2 border-t">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center justify-between">
          <span>Gợi ý nhận diện:</span>
          {candidates.length > 0 && (
            <span className="text-[10px] text-amber-500 font-normal">
              Click để chèn vào câu
            </span>
          )}
        </div>

        {candidates.length === 0 ? (
          <div className="text-center py-3 text-[11px] text-muted-foreground/60 italic">
            {strokes.length > 0
              ? 'Đang nhận diện...'
              : 'Các chữ Hán gợi ý sẽ xuất hiện ở đây'}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-1 max-h-[140px] overflow-y-auto p-0.5">
            {candidates.map((char, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelect(char)}
                className="group relative flex flex-col items-center justify-center h-11 rounded-lg border border-border/80 bg-muted/40 hover:bg-amber-500/10 hover:border-amber-500/60 transition-all text-xl font-serif text-foreground active:scale-95"
                title={`Chèn "${char}"`}
              >
                <span>{char}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  className="opacity-0 group-hover:opacity-100 absolute top-0.5 right-0.5 p-0.5 rounded text-muted-foreground hover:text-amber-500 transition-opacity"
                  onClick={(e) => handleCopy(char, e)}
                  title={`Sao chép "${char}"`}
                >
                  {copiedChar === char ? (
                    <Check className="h-2.5 w-2.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-2.5 w-2.5" />
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
