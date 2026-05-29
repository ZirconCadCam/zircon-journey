import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Download, ExternalLink, HardDrive, Cloud, ShieldAlert, FolderOpen } from "lucide-react";
import {
  getCachedOrFetchBlobUrl,
  fetchRemoteBlobUrl,
  fileManagerSupported,
  getCenterFolderStatus,
  requestCenterPermission,
  type CenterStatus,
} from "@/lib/file-manager";
import { ZipViewerDialog } from "@/components/zip-viewer-dialog";
import { toast } from "sonner";

/**
 * Universal in-app file viewer.
 *
 * Strategy:
 *  1. Read the file from the device "مركز زركون CAD/CAM" folder first
 *     (acts as a local cache) — opens instantly without network.
 *  2. Fall back to fetching the remote URL, then cache it for next time.
 *  3. If device access is blocked (unsupported browser / denied permission),
 *     show a clear message with the option to continue via the cloud.
 *  4. Renders inline by mime/extension: image, pdf, video, audio, text,
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
  const [deviceStatus, setDeviceStatus] = useState<CenterStatus | null>(null);
  const [forceCloud, setForceCloud] = useState(false);

  const lower = name.toLowerCase();
  const isZip = /\.(zip|rar)$/i.test(lower);
  const isImage = /^image\//.test(mime ?? "") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(lower);
  const isPdf = mime === "application/pdf" || /\.pdf$/i.test(lower);
  const isVideo = /^video\//.test(mime ?? "") || /\.(mp4|webm|mov|m4v)$/i.test(lower);
  const isAudio = /^audio\//.test(mime ?? "") || /\.(mp3|wav|ogg|m4a|webm)$/i.test(lower);
  const isText = /^text\//.test(mime ?? "") || /\.(txt|json|xml|csv|md|log)$/i.test(lower);

  // Reset transient state every time the dialog opens for a new file.
  useEffect(() => {
    if (open) { setForceCloud(false); setDeviceStatus(null); }
  }, [open, url]);

  useEffect(() => {
    if (!open || !url || isZip) return;
    let cancelled = false;

    (async () => {
      const status = await getCenterFolderStatus();
      if (cancelled) return;
      setDeviceStatus(status);

      // Device access blocked → wait for the user to choose how to proceed.
      if (!forceCloud && (status === "unsupported" || status === "denied")) {
        setBusy(false);
        return;
      }

      setBusy(true); setBlobUrl(null); setFromCache(false);
      if (forceCloud) {
        const r = await fetchRemoteBlobUrl(url);
        if (cancelled) { r.revoke?.(); return; }
        setBlobUrl(r.url); setFromCache(false);
        setRevoke(() => r.revoke ?? null);
      } else {
        // Device-first: read cache, otherwise fetch + cache.
        const r = await getCachedOrFetchBlobUrl(url, name, subfolder, true);
        if (cancelled) { r.revoke?.(); return; }
        setBlobUrl(r.url); setFromCache(r.cached);
        setRevoke(() => r.revoke ?? null);
      }
      setBusy(false);
    })();

    return () => { cancelled = true; };
  }, [open, url, name, subfolder, isZip, forceCloud]);

  useEffect(() => {
    if (!open && revoke) { revoke(); setRevoke(null); setBlobUrl(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function grantAndRetry() {
    const ok = await requestCenterPermission();
    if (ok) {
      setDeviceStatus("ready");
      setForceCloud(false);
    } else {
      toast.error("لم يتم منح صلاحية الوصول لمجلد الجهاز");
    }
  }

  if (isZip) {
    return <ZipViewerDialog open={open} onOpenChange={onOpenChange} url={url} fileName={name} />;
  }

  const blocked = !forceCloud && (deviceStatus === "unsupported" || deviceStatus === "denied");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <span className="truncate">{name}</span>
            {fileManagerSupported() && blobUrl && (
              <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${fromCache ? "bg-emerald-500/15 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                {fromCache ? <><HardDrive className="size-3" /> من ذاكرة الجهاز</> : <><Cloud className="size-3" /> من السحابة</>}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-[300px] max-h-[72vh] overflow-auto rounded-xl border border-border bg-muted/30 grid place-items-center">
          {blocked && (
            <div className="max-w-md text-center p-6 space-y-4">
              <div className="size-12 mx-auto rounded-2xl bg-amber-500/15 text-amber-600 grid place-items-center">
                <ShieldAlert className="size-6" />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-bold">تعذّر الوصول إلى مجلد ذاكرة الجهاز</div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {deviceStatus === "unsupported"
                    ? "متصفحك الحالي لا يدعم حفظ الملفات في مجلد الجهاز (مثل Safari أو بعض متصفحات الجوال). يمكنك متابعة فتح الملف عبر السحابة مباشرةً."
                    : "صلاحية الوصول إلى مجلد «مركز زركون CAD/CAM» غير ممنوحة. يمكنك منح الصلاحية لقراءة الملف من الجهاز، أو المتابعة عبر السحابة."}
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {deviceStatus === "denied" && (
                  <button onClick={grantAndRetry}
                    className="inline-flex items-center gap-1.5 rounded-lg gradient-gold text-gold-foreground px-3 py-1.5 text-xs font-bold">
                    <FolderOpen className="size-3.5" /> منح الصلاحية والقراءة من الجهاز
                  </button>
                )}
                <button onClick={() => setForceCloud(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gold px-3 py-1.5 text-xs font-bold hover:bg-gold/10">
                  <Cloud className="size-3.5" /> متابعة الفتح عبر السحابة
                </button>
              </div>
            </div>
          )}

          {!blocked && busy && (
            <div className="text-center text-xs text-muted-foreground py-12">
              <Loader2 className="size-5 mx-auto mb-2 animate-spin text-gold" />
              جارٍ تحضير الملف داخل التطبيق...
            </div>
          )}
          {!blocked && !busy && blobUrl && isImage && (
            <img src={blobUrl} alt={name} className="max-w-full max-h-[68vh] object-contain" />
          )}
          {!blocked && !busy && blobUrl && isPdf && (
            <iframe src={blobUrl} title={name} className="w-full h-[68vh] bg-background" />
          )}
          {!blocked && !busy && blobUrl && isVideo && (
            <video src={blobUrl} controls className="max-w-full max-h-[68vh]" />
          )}
          {!blocked && !busy && blobUrl && isAudio && (
            <audio src={blobUrl} controls className="w-full px-4" />
          )}
          {!blocked && !busy && blobUrl && isText && (
            <iframe src={blobUrl} title={name} className="w-full h-[68vh] bg-background" />
          )}
          {!blocked && !busy && blobUrl && !isImage && !isPdf && !isVideo && !isAudio && !isText && (
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
