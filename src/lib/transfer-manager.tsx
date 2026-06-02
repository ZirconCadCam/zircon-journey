/**
 * Global transfer manager — tracks every file upload/download across the app
 * and renders a floating overlay with:
 *   1. A "tube" progress indicator (vertical fill) for each active transfer.
 *   2. Pause / resume / cancel controls.
 *   3. A pop-up bar when a download completes (auto-dismisses after 5s).
 *
 * Usage (downloads):
 *   await transferDownload({ url, filename, saveToCenter: true });
 *
 * Usage (uploads — feed progress from your own uploader):
 *   const t = registerUpload(filename, { pause, resume, cancel });
 *   t.update(pct, loaded, total);  t.done();  // or t.fail() / t.cancelDone();
 */
import { useEffect, useSyncExternalStore } from "react";
import { Pause, Play, X, Download, ExternalLink, FileDown, CheckCircle2, Upload as UploadIcon } from "lucide-react";
import { saveToCenter, fileManagerSupported } from "@/lib/file-manager";

export type TransferKind = "upload" | "download";
export type TransferStatus = "active" | "paused" | "done" | "error" | "canceled";

export interface Transfer {
  id: string;
  kind: TransferKind;
  filename: string;
  progress: number; // 0-100
  loaded: number;
  total: number;
  status: TransferStatus;
  pause?: () => void;
  resume?: () => void;
  cancel?: () => void;
}

export interface CompletedPopup {
  id: string;
  filename: string;
  kind?: TransferKind;
  blobUrl?: string;
  savedPath?: string;
  fallback?: boolean;
}

/* ----------------------------- tiny store ----------------------------- */
let transfers: Transfer[] = [];
let popups: CompletedPopup[] = [];
const listeners = new Set<() => void>();

function emit() {
  // new array references so useSyncExternalStore detects the change
  transfers = [...transfers];
  popups = [...popups];
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getTransfers() { return transfers; }
function getPopups() { return popups; }
const emptyT: Transfer[] = [];
const emptyP: CompletedPopup[] = [];

export function useTransfers(): Transfer[] {
  return useSyncExternalStore(subscribe, getTransfers, () => emptyT);
}
export function usePopups(): CompletedPopup[] {
  return useSyncExternalStore(subscribe, getPopups, () => emptyP);
}

function upsert(t: Transfer) {
  const i = transfers.findIndex((x) => x.id === t.id);
  if (i === -1) transfers.push(t); else transfers[i] = t;
  emit();
}
function patch(id: string, p: Partial<Transfer>) {
  const i = transfers.findIndex((x) => x.id === id);
  if (i !== -1) { transfers[i] = { ...transfers[i], ...p }; emit(); }
}
function removeTransfer(id: string) {
  transfers = transfers.filter((x) => x.id !== id);
  emit();
}
export function dismissPopup(id: string) {
  const p = popups.find((x) => x.id === id);
  if (p?.blobUrl) { try { URL.revokeObjectURL(p.blobUrl); } catch { /* ignore */ } }
  popups = popups.filter((x) => x.id !== id);
  emit();
}
function pushPopup(p: CompletedPopup) {
  popups.push(p);
  emit();
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------- upload registration ------------------------ */
export function registerUpload(
  filename: string,
  controls?: { pause?: () => void; resume?: () => void; cancel?: () => void },
) {
  const id = uid();
  upsert({
    id, kind: "upload", filename, progress: 0, loaded: 0, total: 0, status: "active",
    pause: controls?.pause, resume: controls?.resume, cancel: controls?.cancel,
  });
  return {
    id,
    update(pct: number, loaded = 0, total = 0) {
      patch(id, { progress: Math.max(0, Math.min(100, Math.round(pct))), loaded, total, status: "active" });
    },
    paused() { patch(id, { status: "paused" }); },
    resumed() { patch(id, { status: "active" }); },
    done() { patch(id, { progress: 100, status: "done" }); setTimeout(() => removeTransfer(id), 1500); },
    fail() { patch(id, { status: "error" }); setTimeout(() => removeTransfer(id), 3500); },
    remove() { removeTransfer(id); },
  };
}

/* --------------------------- tracked download ------------------------- */
interface Control { paused: boolean; canceled: boolean; abort?: () => void }

async function streamToBlob(
  url: string,
  control: Control,
  onProgress: (loaded: number, total: number) => void,
): Promise<Blob> {
  const ctrl = new AbortController();
  control.abort = () => ctrl.abort();
  const res = await fetch(url, { signal: ctrl.signal });
  if (!res.ok) throw new Error("HTTP " + res.status);

  const total = Number(res.headers.get("content-length")) || 0;
  const ct = res.headers.get("content-type") || "application/octet-stream";

  if (!res.body || !res.body.getReader) {
    // No streaming support — fall back to a single blob read.
    const blob = await res.blob();
    onProgress(blob.size, blob.size || total);
    return blob;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    while (control.paused && !control.canceled) await sleep(150);
    if (control.canceled) { try { ctrl.abort(); } catch { /* ignore */ } throw new DOMException("canceled", "AbortError"); }
    const { done, value } = await reader.read();
    if (done) break;
    if (value) { chunks.push(value); loaded += value.length; onProgress(loaded, total); }
  }
  return new Blob(chunks as BlobPart[], { type: ct });
}

export async function transferDownload(opts: {
  url: string;
  filename: string;
  mime?: string | null;
  saveToCenter?: boolean;
  subfolder?: string;
}): Promise<{ ok: boolean; canceled: boolean; savedPath?: string; fallback?: boolean }> {
  const id = uid();
  const control: Control = { paused: false, canceled: false };

  upsert({
    id, kind: "download", filename: opts.filename, progress: 0, loaded: 0, total: 0, status: "active",
    pause: () => { control.paused = true; patch(id, { status: "paused" }); },
    resume: () => { control.paused = false; patch(id, { status: "active" }); },
    cancel: () => { control.canceled = true; control.abort?.(); patch(id, { status: "canceled" }); },
  });

  try {
    const blob = await streamToBlob(opts.url, control, (loaded, total) => {
      const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
      patch(id, { loaded, total, progress: pct });
    });

    patch(id, { progress: 100, status: "done" });

    let savedPath: string | undefined;
    let fallback = false;
    const wantCenter = opts.saveToCenter !== false && fileManagerSupported();
    if (wantCenter) {
      const r = await saveToCenter(blob, opts.filename, opts.subfolder ?? "ملفات");
      savedPath = r.path;
      fallback = r.fallback;
    } else {
      triggerBrowserDownload(blob, opts.filename);
      fallback = true;
    }

    const blobUrl = URL.createObjectURL(blob);
    pushPopup({ id: uid(), filename: opts.filename, blobUrl, savedPath, fallback });

    setTimeout(() => removeTransfer(id), 1200);
    return { ok: true, canceled: false, savedPath, fallback };
  } catch (err: any) {
    if (control.canceled || err?.name === "AbortError") {
      patch(id, { status: "canceled" });
      setTimeout(() => removeTransfer(id), 1500);
      return { ok: false, canceled: true };
    }
    patch(id, { status: "error" });
    setTimeout(() => removeTransfer(id), 3500);
    throw err;
  }
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ------------------------------ overlay UI ---------------------------- */
function StatusLabel(s: TransferStatus): string {
  switch (s) {
    case "paused": return "متوقف مؤقتاً";
    case "done": return "اكتمل";
    case "error": return "فشل";
    case "canceled": return "أُلغي";
    default: return "جارٍ…";
  }
}

function Tube({ progress, status }: { progress: number; status: TransferStatus }) {
  const color =
    status === "error" ? "bg-destructive"
      : status === "canceled" ? "bg-muted-foreground/40"
        : status === "paused" ? "bg-amber-500"
          : "gradient-gold";
  return (
    <div
      className="relative h-10 w-3 shrink-0 overflow-hidden rounded-full bg-muted/60 border border-border/60"
      role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}
      title={`${progress}%`}
    >
      <div className={`absolute inset-x-0 bottom-0 ${color} transition-all duration-200`} style={{ height: `${progress}%` }} />
    </div>
  );
}

export function TransferOverlay() {
  const items = useTransfers();
  const completed = usePopups();

  return (
    <div className="fixed bottom-4 left-4 z-[60] flex w-[min(92vw,22rem)] flex-col gap-2" dir="rtl">
      {/* completion popups (auto-dismiss handled per item) */}
      {completed.map((p) => <DownloadDonePopup key={p.id} p={p} />)}

      {/* active transfers */}
      {items.map((t) => (
        <div key={t.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card/95 backdrop-blur p-3 shadow-luxury">
          <Tube progress={t.progress} status={t.status} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
              {t.kind === "upload" ? <UploadIcon className="size-3" /> : <FileDown className="size-3" />}
              <span>{t.kind === "upload" ? "رفع" : "تنزيل"}</span>
              <span className="text-gold">• {t.progress}% {StatusLabel(t.status)}</span>
            </div>
            <div className="truncate text-xs font-bold">{t.filename}</div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {(t.status === "active" || t.status === "paused") && (t.pause || t.resume) && (
              t.status === "paused"
                ? <button onClick={() => t.resume?.()} className="rounded-lg border border-border p-1.5 hover:border-gold" aria-label="استئناف"><Play className="size-3.5" /></button>
                : <button onClick={() => t.pause?.()} className="rounded-lg border border-border p-1.5 hover:border-gold" aria-label="إيقاف مؤقت"><Pause className="size-3.5" /></button>
            )}
            {(t.status === "active" || t.status === "paused") && t.cancel && (
              <button onClick={() => t.cancel?.()} className="rounded-lg border border-border p-1.5 hover:bg-destructive hover:text-destructive-foreground" aria-label="إلغاء"><X className="size-3.5" /></button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function DownloadDonePopup({ p }: { p: CompletedPopup }) {
  // auto-dismiss after 5 seconds of no action
  useEffect(() => {
    const t = setTimeout(() => dismissPopup(p.id), 5000);
    return () => clearTimeout(t);
  }, [p.id]);
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/40 bg-card/95 backdrop-blur p-3 shadow-luxury animate-in slide-in-from-bottom-2">
      <div className="size-9 shrink-0 grid place-items-center rounded-xl bg-emerald-500/15 text-emerald-600">
        <CheckCircle2 className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-bold text-emerald-600">اكتمل التنزيل</div>
        <div className="truncate text-xs font-bold">{p.filename}</div>
        {p.savedPath && !p.fallback && <div className="truncate text-[10px] text-muted-foreground">{p.savedPath}</div>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {p.blobUrl && (
          <a href={p.blobUrl} target="_blank" rel="noreferrer" onClick={() => dismissPopup(p.id)}
            className="rounded-lg border border-gold p-1.5 hover:bg-gold/10" aria-label="فتح"><ExternalLink className="size-3.5" /></a>
        )}
        {p.blobUrl && (
          <a href={p.blobUrl} download={p.filename} onClick={() => dismissPopup(p.id)}
            className="rounded-lg gradient-gold text-gold-foreground p-1.5" aria-label="حفظ"><Download className="size-3.5" /></a>
        )}
        <button onClick={() => dismissPopup(p.id)} className="rounded-lg border border-border p-1.5 hover:bg-muted" aria-label="إغلاق"><X className="size-3.5" /></button>
      </div>
    </div>
  );
}
