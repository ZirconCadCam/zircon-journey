import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X, Check, Undo2, Trash2, Pencil, Minus, ArrowUpRight,
  Square as SquareIcon, Ruler, Type, Circle, Move, Loader2,
} from "lucide-react";

/**
 * Full-screen image annotation editor for the doctor.
 * Lets the doctor draw, write, and take point-to-point measurements/distances
 * on an uploaded image, then flattens everything onto the original-resolution
 * picture and returns a PNG blob to send to the designer / technician.
 */

type ToolKey = "pen" | "line" | "arrow" | "rect" | "ellipse" | "measure" | "text";

interface Pt { x: number; y: number }
interface Shape {
  tool: ToolKey;
  color: string;
  width: number;
  points: Pt[];
  text?: string;
}

const COLORS = ["#e11d48", "#f59e0b", "#10b981", "#2563eb", "#111827", "#ffffff"];
const WIDTHS = [2, 4, 7, 12];

const TOOLS: { key: ToolKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "pen", label: "قلم", icon: Pencil },
  { key: "line", label: "خط", icon: Minus },
  { key: "arrow", label: "سهم", icon: ArrowUpRight },
  { key: "measure", label: "قياس", icon: Ruler },
  { key: "rect", label: "مستطيل", icon: SquareIcon },
  { key: "ellipse", label: "دائرة", icon: Circle },
  { key: "text", label: "كتابة", icon: Type },
];

export function ImageAnnotator({
  src,
  fileName,
  onCancel,
  onSave,
}: {
  src: string;
  fileName: string;
  onCancel: () => void;
  onSave: (blob: Blob, name: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  const [tool, setTool] = useState<ToolKey>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const shapesRef = useRef<Shape[]>([]);
  shapesRef.current = shapes;

  const drafting = useRef<Shape | null>(null);
  // Display transform: native px -> screen px scale + offset (centered).
  const view = useRef({ scale: 1, offX: 0, offY: 0, natW: 0, natH: 0 });

  // Calibration: real-world mm per native pixel (null = show pixels).
  const [mmPerPx, setMmPerPx] = useState<number | null>(null);

  // Load the image.
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      view.current.natW = img.naturalWidth || img.width;
      view.current.natH = img.naturalHeight || img.height;
      setReady(true);
    };
    img.onerror = () => setReady(false);
    img.src = src;
  }, [src]);

  const computeView = useCallback(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const { natW, natH } = view.current;
    if (!natW || !natH) return;
    const availW = wrap.clientWidth;
    const availH = wrap.clientHeight;
    const scale = Math.min(availW / natW, availH / natH);
    const dispW = Math.round(natW * scale);
    const dispH = Math.round(natH * scale);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = dispW * dpr;
    canvas.height = dispH * dpr;
    canvas.style.width = `${dispW}px`;
    canvas.style.height = `${dispH}px`;
    view.current.scale = scale;
    view.current.offX = 0;
    view.current.offY = 0;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { scale } = view.current;
    const dispW = view.current.natW * scale;
    const dispH = view.current.natH * scale;
    ctx.clearRect(0, 0, dispW, dispH);
    ctx.drawImage(img, 0, 0, dispW, dispH);
    const all = drafting.current ? [...shapesRef.current, drafting.current] : shapesRef.current;
    for (const s of all) drawShape(ctx, s, scale, mmPerPx);
  }, [mmPerPx]);

  useEffect(() => {
    if (!ready) return;
    computeView();
    draw();
    const onResize = () => { computeView(); draw(); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [ready, computeView, draw]);

  useEffect(() => { if (ready) draw(); }, [shapes, ready, draw]);

  function toNative(e: React.PointerEvent): Pt {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scale = view.current.scale;
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!ready) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const p = toNative(e);
    if (tool === "text") {
      const txt = window.prompt("اكتب النص الذي سيظهر على الصورة:");
      if (txt && txt.trim()) {
        setShapes(prev => [...prev, { tool: "text", color, width, points: [p], text: txt.trim() }]);
      }
      return;
    }
    drafting.current = { tool, color, width, points: [p, p] };
    draw();
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drafting.current) return;
    const p = toNative(e);
    const d = drafting.current;
    if (d.tool === "pen") d.points.push(p);
    else d.points[1] = p;
    draw();
  }

  function onPointerUp() {
    const d = drafting.current;
    drafting.current = null;
    if (!d) return;
    // Discard tiny accidental taps (except pen which may be a dot).
    const [a, b] = [d.points[0], d.points[d.points.length - 1]];
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    if (d.tool !== "pen" && dist < 3) { draw(); return; }
    if (d.tool === "measure" && mmPerPx == null) {
      // Offer calibration on the first measurement.
      maybeCalibrate(dist);
    }
    setShapes(prev => [...prev, d]);
  }

  function maybeCalibrate(pxLen: number) {
    const ans = window.prompt(
      "لمعايرة القياسات: اكتب الطول الحقيقي لهذا الخط بالمليمتر (اختياري — اتركه فارغاً لعرض البكسل).",
    );
    if (ans && !isNaN(parseFloat(ans)) && parseFloat(ans) > 0 && pxLen > 0) {
      setMmPerPx(parseFloat(ans) / pxLen);
    }
  }

  function undo() { setShapes(prev => prev.slice(0, -1)); }
  function clearAll() { setShapes([]); }

  async function handleSave() {
    const img = imgRef.current;
    if (!img) return;
    setSaving(true);
    try {
      const off = document.createElement("canvas");
      off.width = view.current.natW;
      off.height = view.current.natH;
      const ctx = off.getContext("2d")!;
      ctx.drawImage(img, 0, 0, off.width, off.height);
      for (const s of shapesRef.current) drawShape(ctx, s, 1, mmPerPx);
      const blob: Blob | null = await new Promise(res => off.toBlob(res, "image/png", 0.95));
      if (!blob) throw new Error("تعذر إنشاء الصورة");
      const base = fileName.replace(/\.[^.]+$/, "");
      onSave(blob, `${base}-مشروح.png`);
    } catch {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex flex-col bg-neutral-900" dir="rtl">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap p-2 bg-neutral-800 text-white border-b border-white/10">
        <div className="flex items-center gap-1 flex-wrap">
          {TOOLS.map(t => (
            <button key={t.key} type="button" onClick={() => setTool(t.key)}
              title={t.label}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${tool === t.key ? "bg-gold text-gold-foreground" : "bg-white/10 hover:bg-white/20"}`}>
              <t.icon className="size-4" /> {t.label}
            </button>
          ))}
        </div>
        <div className="mx-1 h-6 w-px bg-white/15" />
        <div className="flex items-center gap-1">
          {COLORS.map(c => (
            <button key={c} type="button" onClick={() => setColor(c)}
              className={`size-6 rounded-full border-2 ${color === c ? "border-gold ring-2 ring-gold/50" : "border-white/30"}`}
              style={{ backgroundColor: c }} aria-label={c} />
          ))}
        </div>
        <div className="mx-1 h-6 w-px bg-white/15" />
        <div className="flex items-center gap-1">
          {WIDTHS.map(w => (
            <button key={w} type="button" onClick={() => setWidth(w)}
              className={`grid place-items-center size-7 rounded-lg ${width === w ? "bg-gold text-gold-foreground" : "bg-white/10 hover:bg-white/20"}`}
              title={`سماكة ${w}`}>
              <span className="rounded-full bg-current" style={{ width: w + 2, height: w + 2 }} />
            </button>
          ))}
        </div>
        <div className="mx-1 h-6 w-px bg-white/15" />
        <button type="button" onClick={undo} disabled={shapes.length === 0}
          className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-bold hover:bg-white/20 disabled:opacity-40">
          <Undo2 className="size-4" /> تراجع
        </button>
        <button type="button" onClick={clearAll} disabled={shapes.length === 0}
          className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-bold hover:bg-white/20 disabled:opacity-40">
          <Trash2 className="size-4" /> مسح الكل
        </button>
        {mmPerPx != null && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-600/80 px-2.5 py-1.5 text-[11px] font-bold">
            <Ruler className="size-3.5" /> معايرة مفعّلة
            <button type="button" onClick={() => setMmPerPx(null)} className="ms-1 hover:text-white/70"><X className="size-3" /></button>
          </span>
        )}
        <div className="ms-auto flex items-center gap-2">
          <button type="button" onClick={onCancel}
            className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold hover:bg-white/20">
            <X className="size-4" /> إلغاء
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg gradient-gold text-gold-foreground px-4 py-1.5 text-xs font-bold shadow-gold disabled:opacity-60">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} حفظ الشرح
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div ref={wrapRef} className="relative flex-1 grid place-items-center overflow-hidden p-3">
        {!ready ? (
          <div className="text-white/70 text-sm inline-flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" /> جارٍ تحميل الصورة…
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="touch-none cursor-crosshair rounded-lg shadow-2xl bg-white"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        )}
      </div>
      <div className="p-2 text-center text-[11px] text-white/50 bg-neutral-800 border-t border-white/10">
        <Move className="inline size-3.5 me-1" />
        ارسم على الصورة لشرح ما تريد للمصمم أو الفني — استخدم «قياس» لتحديد المسافة من نقطة إلى أخرى.
      </div>
    </div>,
    document.body,
  );
}

function drawShape(ctx: CanvasRenderingContext2D, s: Shape, scale: number, mmPerPx: number | null) {
  const sx = (v: number) => v * scale;
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = Math.max(1, s.width * scale);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const p = s.points;

  if (s.tool === "pen") {
    ctx.beginPath();
    ctx.moveTo(sx(p[0].x), sx(p[0].y));
    for (let i = 1; i < p.length; i++) ctx.lineTo(sx(p[i].x), sx(p[i].y));
    ctx.stroke();
  } else if (s.tool === "line") {
    line(ctx, sx(p[0].x), sx(p[0].y), sx(p[1].x), sx(p[1].y));
  } else if (s.tool === "arrow") {
    line(ctx, sx(p[0].x), sx(p[0].y), sx(p[1].x), sx(p[1].y));
    arrowHead(ctx, sx(p[0].x), sx(p[0].y), sx(p[1].x), sx(p[1].y), Math.max(10, s.width * scale * 3));
  } else if (s.tool === "rect") {
    ctx.strokeRect(sx(p[0].x), sx(p[0].y), sx(p[1].x - p[0].x), sx(p[1].y - p[0].y));
  } else if (s.tool === "ellipse") {
    const cx = sx((p[0].x + p[1].x) / 2), cy = sx((p[0].y + p[1].y) / 2);
    const rx = Math.abs(sx(p[1].x - p[0].x)) / 2, ry = Math.abs(sx(p[1].y - p[0].y)) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (s.tool === "measure") {
    line(ctx, sx(p[0].x), sx(p[0].y), sx(p[1].x), sx(p[1].y));
    tick(ctx, sx(p[0].x), sx(p[0].y), sx(p[1].x), sx(p[1].y));
    const pxLen = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);
    const label = mmPerPx != null ? `${(pxLen * mmPerPx).toFixed(1)} مم` : `${Math.round(pxLen)} بكسل`;
    const mx = sx((p[0].x + p[1].x) / 2), my = sx((p[0].y + p[1].y) / 2);
    drawLabel(ctx, label, mx, my - 8, s.color, scale);
  } else if (s.tool === "text" && s.text) {
    drawLabel(ctx, s.text, sx(p[0].x), sx(p[0].y), s.color, scale, true);
  }
  ctx.restore();
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function arrowHead(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, size: number) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(ang - Math.PI / 6), y2 - size * Math.sin(ang - Math.PI / 6));
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(ang + Math.PI / 6), y2 - size * Math.sin(ang + Math.PI / 6));
  ctx.stroke();
}

// End caps perpendicular to a measurement line.
function tick(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  const ang = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2;
  const len = 7;
  for (const [cx, cy] of [[x1, y1], [x2, y2]] as const) {
    ctx.beginPath();
    ctx.moveTo(cx - len * Math.cos(ang), cy - len * Math.sin(ang));
    ctx.lineTo(cx + len * Math.cos(ang), cy + len * Math.sin(ang));
    ctx.stroke();
  }
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, scale: number, anchorTopLeft = false) {
  const fs = Math.max(13, 16 * scale);
  ctx.save();
  ctx.font = `bold ${fs}px system-ui, sans-serif`;
  ctx.textBaseline = anchorTopLeft ? "top" : "middle";
  const metrics = ctx.measureText(text);
  const padX = 6, padY = 4;
  const w = metrics.width + padX * 2;
  const h = fs + padY * 2;
  const bx = anchorTopLeft ? x : x - w / 2;
  const by = anchorTopLeft ? y : y - h / 2;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  roundRect(ctx, bx, by, w, h, 5);
  ctx.fill();
  ctx.fillStyle = color === "#111827" ? "#ffffff" : color;
  ctx.fillText(text, bx + padX, anchorTopLeft ? by + padY : by + h / 2);
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
