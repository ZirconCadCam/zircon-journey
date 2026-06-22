import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileArchive, Loader2, Download, Image as ImageIcon, FileText, X, ExternalLink, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface ZipEntry {
  name: string;
  size: number;
  dir: boolean;
  /** Lazy: resolve to a blob URL the first time it's previewed. */
  getBlobUrl: () => Promise<string | null>;
}

function formatSize(n: number): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * In-app preview for a remote archive (ZIP / RAR).
 *
 * - ZIP archives are downloaded once via fetch, parsed with JSZip in the
 *   browser, and rendered as an entry list with image thumbnails and
 *   per-file download.
 * - RAR archives cannot be parsed in-browser (no pure-JS reader), so we show
 *   a clean panel that lets the user download or open the whole archive with
 *   their device's archive tool — instead of a confusing "failed" error.
 */
export function ZipViewerDialog({
  url, fileName, open, onOpenChange,
}: {
  url: string | null;
  fileName?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [entries, setEntries] = useState<ZipEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [wholeUrl, setWholeUrl] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const lowerName = (fileName || url || "").toLowerCase();
  const isRar = /\.rar(\?|$)/i.test(lowerName) || /\.7z(\?|$)/i.test(lowerName);

  useEffect(() => {
    if (!open || !url || isRar) return;
    let cancelled = false;
    const urlCache: string[] = [];
    let wholeBlobUrl: string | null = null;
    (async () => {
      setLoading(true); setError(null); setEntries([]); setProgress(0);
      setPreviewUrl(null); setPreviewName(null); setWholeUrl(null);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        // Stream so the user sees real progress on large archives.
        const total = Number(res.headers.get("content-length")) || 0;
        let buf: ArrayBuffer;
        if (res.body?.getReader && total > 0) {
          const reader = res.body.getReader();
          const chunks: Uint8Array[] = [];
          let loaded = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value); loaded += value.length;
              if (!cancelled) setProgress(Math.round((loaded / total) * 100));
            }
          }
          const merged = new Uint8Array(loaded);
          let off = 0;
          for (const c of chunks) { merged.set(c, off); off += c.length; }
          buf = merged.buffer;
        } else {
          const blob = await res.blob();
          buf = await blob.arrayBuffer();
        }
        if (cancelled) return;

        wholeBlobUrl = URL.createObjectURL(new Blob([buf], { type: "application/zip" }));
        if (!cancelled) setWholeUrl(wholeBlobUrl);

        const { default: JSZip } = await import("jszip");
        const zip = await JSZip.loadAsync(buf);
        const list: ZipEntry[] = [];
        zip.forEach((path, entry) => {
          list.push({
            name: path,
            size: (entry as any)._data?.uncompressedSize ?? 0,
            dir: entry.dir,
            getBlobUrl: async () => {
              if (entry.dir) return null;
              const blob = await entry.async("blob");
              const u = URL.createObjectURL(blob);
              urlCache.push(u);
              return u;
            },
          });
        });
        list.sort((a, b) => a.name.localeCompare(b.name));
        if (!cancelled) setEntries(list);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "تعذر فتح الملف");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      urlCache.forEach(u => URL.revokeObjectURL(u));
      if (wholeBlobUrl) URL.revokeObjectURL(wholeBlobUrl);
    };
  }, [open, url, isRar, reloadKey]);

  function isImage(name: string) {
    return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
  }
  function isText(name: string) {
    return /\.(txt|json|xml|csv|md|log|stl|obj|ply)$/i.test(name);
  }

  async function preview(e: ZipEntry) {
    if (e.dir) return;
    try {
      const u = await e.getBlobUrl();
      if (!u) return;
      setPreviewUrl(u);
      setPreviewName(e.name);
    } catch (err: any) {
      toast.error(err?.message ?? "تعذر المعاينة");
    }
  }

  async function downloadEntry(e: ZipEntry) {
    if (e.dir) return;
    const u = await e.getBlobUrl();
    if (!u) return;
    const a = document.createElement("a");
    a.href = u; a.download = e.name.split("/").pop() || e.name;
    a.click();
  }

  const fileEntries = entries.filter(e => !e.dir);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileArchive className={`size-4 ${isRar ? "text-amber-600" : "text-gold"}`} />
            {isRar ? "ملف مضغوط RAR" : "معاينة ملف ZIP"}
            {fileName && <span className="font-normal text-xs text-muted-foreground truncate">— {fileName}</span>}
          </DialogTitle>
        </DialogHeader>

        {/* RAR / 7z: no in-browser reader — offer download / open whole archive. */}
        {isRar && (
          <div className="py-8 px-4 text-center space-y-4">
            <div className="size-14 mx-auto rounded-2xl bg-amber-500/15 text-amber-600 grid place-items-center">
              <AlertTriangle className="size-7" />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-bold">لا يمكن عرض ملفات RAR داخل التطبيق</div>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-md mx-auto">
                صيغة RAR لا تُفتح داخل المتصفح مباشرةً. نزّل الملف ثم افتحه ببرنامج فك الضغط على جهازك
                (مثل WinRAR أو مدير الملفات).
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {url && (
                <a href={url} download={fileName || undefined}
                  className="inline-flex items-center gap-1.5 rounded-lg gradient-gold text-gold-foreground px-4 py-2 text-xs font-bold">
                  <Download className="size-3.5" /> تنزيل الملف
                </a>
              )}
              {url && (
                <a href={url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gold px-4 py-2 text-xs font-bold hover:bg-gold/10">
                  <ExternalLink className="size-3.5" /> فتح في نافذة
                </a>
              )}
            </div>
          </div>
        )}

        {!isRar && loading && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <Loader2 className="size-6 mx-auto mb-2 animate-spin text-gold" />
            جارٍ تحميل وفك ضغط الأرشيف{progress > 0 ? ` — ${progress}%` : "..."}
            {progress > 0 && (
              <div className="mx-auto mt-3 h-1.5 w-48 overflow-hidden rounded-full bg-muted">
                <div className="h-full gradient-gold transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        )}

        {!isRar && error && (
          <div className="py-8 text-center space-y-3">
            <div className="text-sm text-destructive">{error}</div>
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => setReloadKey(k => k + 1)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gold px-3 py-1.5 text-xs font-bold hover:bg-gold/10">
                <RefreshCw className="size-3.5" /> إعادة المحاولة
              </button>
              {url && (
                <a href={url} download={fileName || undefined}
                  className="inline-flex items-center gap-1.5 rounded-lg gradient-gold text-gold-foreground px-3 py-1.5 text-xs font-bold">
                  <Download className="size-3.5" /> تنزيل الملف
                </a>
              )}
            </div>
          </div>
        )}

        {!isRar && !loading && !error && fileEntries.length > 0 && (
          <>
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground -mt-1">
              <span>{fileEntries.length} ملف داخل الأرشيف</span>
              {wholeUrl && (
                <a href={wholeUrl} download={fileName || "archive.zip"}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gold px-2.5 py-1 font-bold text-gold hover:bg-gold/10">
                  <Download className="size-3.5" /> تنزيل الأرشيف كاملاً
                </a>
              )}
            </div>
            <div className="grid sm:grid-cols-[1fr_1.2fr] gap-3 max-h-[60vh]">
              <ul className="overflow-y-auto rounded-xl border border-border divide-y divide-border bg-card">
                {fileEntries.map(e => {
                  const active = previewName === e.name;
                  const Icon = isImage(e.name) ? ImageIcon : FileText;
                  return (
                    <li key={e.name} className={`flex items-center gap-2 px-3 py-2 text-xs ${active ? "bg-gold/10" : ""}`}>
                      <Icon className="size-3.5 text-gold shrink-0" />
                      <button onClick={() => preview(e)} className="flex-1 min-w-0 text-start truncate font-bold hover:text-gold">
                        {e.name}
                      </button>
                      <span className="text-muted-foreground text-[10px] shrink-0">{formatSize(e.size)}</span>
                      <button onClick={() => downloadEntry(e)} className="p-1 rounded hover:bg-muted" title="تنزيل">
                        <Download className="size-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="relative rounded-xl border border-border bg-muted/30 grid place-items-center overflow-hidden min-h-[280px]">
                {previewUrl ? (
                  isImage(previewName || "") ? (
                    <img src={previewUrl} alt={previewName || ""} className="max-w-full max-h-[55vh] object-contain" />
                  ) : isText(previewName || "") ? (
                    <iframe src={previewUrl} className="w-full h-[55vh] bg-background" title={previewName || ""} />
                  ) : (
                    <div className="text-center text-xs text-muted-foreground p-6">
                      لا يمكن عرض هذا النوع داخل التطبيق
                      <div className="mt-3">
                        <a href={previewUrl} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gold px-3 py-1.5 font-bold hover:bg-gold/10">
                          فتح في نافذة جديدة
                        </a>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="text-xs text-muted-foreground p-6 text-center">
                    اختر ملفاً من القائمة لمعاينته
                  </div>
                )}
                {previewUrl && (
                  <button onClick={() => { setPreviewUrl(null); setPreviewName(null); }}
                    className="absolute top-2 end-2 p-1 rounded bg-background/80 border border-border hover:bg-muted">
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {!isRar && !loading && !error && entries.length === 0 && (
          <div className="py-8 text-center text-xs text-muted-foreground">الأرشيف فارغ.</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
