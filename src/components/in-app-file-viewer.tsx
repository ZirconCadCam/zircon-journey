import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Download, ExternalLink, HardDrive, Cloud } from "lucide-react";
import { getCachedOrFetchBlobUrl, fileManagerSupported } from "@/lib/file-manager";
import { ZipViewerDialog } from "@/components/zip-viewer-dialog";

/**
 * Universal in-app file viewer.
 *
 * Strategy:
 *  1. Try to read the file from the device "مركز زركون CAD/CAM" folder
 *     (acts as a local cache) — opens instantly without network.
 *  2. Fall back to fetching the remote URL, then cache it for next time.
 *  3. Renders inline by mime/extension: image, pdf, video, audio, text,
 *     zip via ZipViewerDialog, otherwise download/open externally.
 */
export function InAppFileViewer({
  open,
  onOpenChange,
  url,
  name,
  mime,
  subfolder = "ملفات",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  url: string | null;
  name: string;
  mime?: string | null;
  subfolder?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [revoke, setRevoke] = useState<(() => void) | null>(null);

  const lower = name.toLowerCase();
  const isZip = /\.(zip|rar)$/i.test(lower);
  const isImage = /^image\//.test(mime ?? "") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(lower);
  const isPdf = mime === "application/pdf" || /\.pdf$/i.test(lower);
  const isVideo = /^video\//.test(mime ?? "") || /\.(mp4|webm|mov|m4v)$/i.test(lower);
  const isAudio = /^audio\//.test(mime ?? "") || /\.(mp3|wav|ogg|m4a|webm)$/i.test(lower);
  const isText = /^text\//.test(mime ?? "") || /\.(txt|json|xml|csv|md|log)$/i.test(lower);

  useEffect(() => {
    if (!open || !url || isZip) return;
    let cancelled = false;
    setBusy(true); setBlobUrl(null); setFromCache(false);
    (async () => {
      const r = await getCachedOrFetchBlobUrl(url, name, subfolder, true);
      if (cancelled) { r.revoke?.(); return; }
      setBlobUrl(r.url);
      setFromCache(r.cached);
      setRevoke(() => r.revoke ?? null);
      setBusy(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, url, name, subfolder, isZip]);

  useEffect(() => {
    if (!open && revoke) { revoke(); setRevoke(null); setBlobUrl(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (isZip) {
    return <ZipViewerDialog open={open} onOpenChange={onOpenChange} url={url} fileName={name} />;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <span className="truncate">{name}</span>
            {fileManagerSupported() && (
              <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${fromCache ? "bg-emerald-500/15 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                {fromCache ? <><HardDrive className="size-3" /> من ذاكرة الجهاز</> : <><Cloud className="size-3" /> من السحابة</>}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-[300px] max-h-[72vh] overflow-auto rounded-xl border border-border bg-muted/30 grid place-items-center">
          {busy && (
            <div className="text-center text-xs text-muted-foreground py-12">
              <Loader2 className="size-5 mx-auto mb-2 animate-spin text-gold" />
              جارٍ تحضير الملف داخل التطبيق...
            </div>
          )}
          {!busy && blobUrl && isImage && (
            <img src={blobUrl} alt={name} className="max-w-full max-h-[68vh] object-contain" />
          )}
          {!busy && blobUrl && isPdf && (
            <iframe src={blobUrl} title={name} className="w-full h-[68vh] bg-background" />
          )}
          {!busy && blobUrl && isVideo && (
            <video src={blobUrl} controls className="max-w-full max-h-[68vh]" />
          )}
          {!busy && blobUrl && isAudio && (
            <audio src={blobUrl} controls className="w-full px-4" />
          )}
          {!busy && blobUrl && isText && (
            <iframe src={blobUrl} title={name} className="w-full h-[68vh] bg-background" />
          )}
          {!busy && blobUrl && !isImage && !isPdf && !isVideo && !isAudio && !isText && (
            <div className="text-center text-xs text-muted-foreground p-6 space-y-3">
              <div>لا يمكن عرض هذا النوع داخل التطبيق مباشرةً.</div>
              <div className="flex items-center justify-center gap-2">
                <a href={blobUrl} download={name}
                  className="inline-flex items-center gap-1.5 rounded-lg gradient-gold text-gold-foreground px-3 py-1.5 text-xs font-bold">
                  <Download className="size-3.5" /> تحميل
                </a>
                <a href={blobUrl} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gold px-3 py-1.5 text-xs font-bold">
                  <ExternalLink className="size-3.5" /> فتح في نافذة
                </a>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
