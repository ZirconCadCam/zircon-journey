import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileArchive, Loader2, Download, Image as ImageIcon, FileText, X } from "lucide-react";
import { toast } from "sonner";

interface ZipEntry {
  name: string;
  size: number;
  dir: boolean;
  /** Lazy: resolve to a blob URL the first time it's previewed. */
  getBlobUrl: () => Promise<string | null>;
}

/**
 * In-app preview for a remote archive (ZIP **and RAR**, plus 7z/tar/…).
 *
 * The designer (ZIP) and the technician (RAR) both need to confirm the
 * contents of a patient/design archive before a case moves forward. JSZip
 * could only read ZIP files, so RAR archives failed to open. We now use
 * libarchive.js (a WASM build of libarchive) which transparently handles
 * ZIP, RAR, 7z, TAR and more. We download the archive once via fetch,
 * extract it in a Web Worker, and render an entry list with image
 * thumbnails and per-file download.
 */

let archivePromise: Promise<typeof import("libarchive.js")["Archive"]> | null = null;
async function getArchive() {
  if (!archivePromise) {
    archivePromise = import("libarchive.js").then(({ Archive }) => {
      Archive.init({ workerUrl: "/libarchive-worker.js" });
      return Archive;
    });
  }
  return archivePromise;
}

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
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !url) return;
    let cancelled = false;
    const urlCache: string[] = [];
    (async () => {
      setLoading(true); setError(null); setEntries([]);
      setPreviewUrl(null); setPreviewName(null);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();

        const Archive = await getArchive();
        const archive = await Archive.open(
          new File([blob], fileName || "archive", { type: "application/octet-stream" }),
        );
        const filesArray = await archive.getFilesArray();

        const list: ZipEntry[] = filesArray.map(({ file, path }) => {
          const full = `${path ?? ""}${file.name}`;
          return {
            name: full,
            size: file.size ?? 0,
            dir: false,
            getBlobUrl: async () => {
              const extracted = await (file as any).extract();
              const u = URL.createObjectURL(extracted);
              urlCache.push(u);
              return u;
            },
          } as ZipEntry;
        });

        list.sort((a, b) => a.name.localeCompare(b.name));
        if (!cancelled) {
          if (list.length === 0) setError("الأرشيف فارغ أو لا يمكن قراءته.");
          setEntries(list);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(
            e?.message?.includes("passphrase") || e?.message?.includes("encrypt")
              ? "هذا الأرشيف محمي بكلمة مرور ولا يمكن فتحه داخل التطبيق."
              : (e?.message ?? "تعذر فتح الأرشيف"),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      urlCache.forEach(u => URL.revokeObjectURL(u));
    };
  }, [open, url, fileName]);

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
    try {
      const u = await e.getBlobUrl();
      if (!u) return;
      const a = document.createElement("a");
      a.href = u; a.download = e.name.split("/").pop() || e.name;
      a.click();
    } catch (err: any) {
      toast.error(err?.message ?? "تعذر التنزيل");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileArchive className="size-4 text-gold" />
            معاينة الأرشيف {fileName && <span className="font-normal text-xs text-muted-foreground truncate">— {fileName}</span>}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <Loader2 className="size-6 mx-auto mb-2 animate-spin text-gold" />
            جارٍ تحميل وفك ضغط الأرشيف...
          </div>
        )}

        {error && (
          <div className="py-6 text-center text-sm text-destructive">{error}</div>
        )}

        {!loading && !error && entries.length > 0 && (
          <div className="grid sm:grid-cols-[1fr_1.2fr] gap-3 max-h-[60vh]">
            <ul className="overflow-y-auto rounded-xl border border-border divide-y divide-border bg-card">
              {entries.filter(e => !e.dir).map(e => {
                const active = previewName === e.name;
                const Icon = isImage(e.name) ? ImageIcon : FileText;
                return (
                  <li key={e.name} className={`flex items-center gap-2 px-3 py-2 text-xs ${active ? "bg-gold/10" : ""}`}>
                    <Icon className="size-3.5 text-gold shrink-0" />
                    <button onClick={() => preview(e)} className="flex-1 min-w-0 text-start truncate font-bold hover:text-gold">
                      {e.name}
                    </button>
                    <span className="text-muted-foreground text-[10px] shrink-0">
                      {e.size > 0 ? `${(e.size / 1024).toFixed(1)} KB` : ""}
                    </span>
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
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gold px-3 py-1.5 font-bold hover:gradient-gold">
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
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="py-8 text-center text-xs text-muted-foreground">الأرشيف فارغ.</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
