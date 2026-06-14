import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ZipViewerDialog } from "@/components/zip-viewer-dialog";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrl } from "@/lib/chat";
import { toast } from "sonner";
import {
  Eye, RefreshCw, Loader2, Save, ClipboardEdit, FileArchive, ExternalLink, Download,
} from "lucide-react";

interface TechRevisionPanelProps {
  caseId: string;
  caseCode: string;
  /** Designer text revision for this case (may be empty). */
  textRevision?: string | null;
  /** Cloud path/url of the designer's revised design file (.rar/.zip). */
  revisionFilePath?: string | null;
  revisionFileName?: string | null;
  /** Current saved technician execution notes. */
  execNotes?: string | null;
  /** Whether there is any designer revision (file or text) to preview. */
  hasRevision: boolean;
}

async function resolveUrl(path: string): Promise<string | null> {
  if (/^https?:\/\//i.test(path)) return path;
  return await getSignedUrl(path, 3600);
}

/**
 * Technician card add-on: preview the designer's revision (text + file) and
 * edit/save execution notes — all inside the same case card.
 */
export function TechRevisionPanel({
  caseId, caseCode, textRevision, revisionFilePath, revisionFileName, execNotes, hasRevision,
}: TechRevisionPanelProps) {
  const [open, setOpen] = useState(false);
  const [zip, setZip] = useState<{ url: string; name: string | null } | null>(null);
  const [resolving, setResolving] = useState(false);

  // Execution notes editing state.
  const [notes, setNotes] = useState(execNotes ?? "");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setNotes(execNotes ?? ""); }, [execNotes]);
  const dirty = (notes ?? "").trim() !== (execNotes ?? "").trim();

  const isZip = !!revisionFileName && /\.zip$/i.test(revisionFileName);

  async function previewFile() {
    if (!revisionFilePath) return;
    if (isZip) {
      setResolving(true);
      const url = await resolveUrl(revisionFilePath);
      setResolving(false);
      if (!url) { toast.error("تعذر فتح الملف"); return; }
      setZip({ url, name: revisionFileName ?? null });
      return;
    }
    // Non-zip (e.g. .rar) — open the file in a new window.
    setResolving(true);
    const url = await resolveUrl(revisionFilePath);
    setResolving(false);
    if (!url) { toast.error("تعذر فتح الملف"); return; }
    window.open(url, "_blank", "noopener");
  }

  async function saveNotes() {
    setSaving(true);
    const { error } = await supabase.from("slot_cases")
      .update({ tech_exec_notes: notes.trim() || null } as never).eq("id", caseId);
    setSaving(false);
    if (error) { toast.error("تعذر حفظ الملاحظات"); return; }
    toast.success("تم حفظ الملاحظات التنفيذية");
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {hasRevision && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-700 dark:text-amber-400 hover:bg-amber-500 hover:text-white transition"
            title="معاينة تعديل المصمم (النص والملف) داخل البطاقة"
          >
            <Eye className="size-3.5" /> معاينة تعديل المصمم
          </button>
        )}
      </div>

      {/* Execution notes editor */}
      <div className="rounded-lg border border-border bg-muted/30 p-2.5">
        <div className="text-[11px] font-bold text-muted-foreground mb-1.5 flex items-center gap-1.5">
          <ClipboardEdit className="size-3.5 text-gold" /> ملاحظات تنفيذية (الفني)
        </div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          placeholder="اكتب ملاحظاتك التنفيذية حول هذه الحالة…"
          className="w-full resize-y rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus:border-gold"
        />
        <div className="mt-1.5 flex justify-end">
          <button
            type="button"
            onClick={saveNotes}
            disabled={saving || !dirty}
            className="inline-flex items-center gap-1.5 rounded-lg gradient-gold text-gold-foreground px-3 py-1.5 text-xs font-bold shadow-gold hover:opacity-90 transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} حفظ
          </button>
        </div>
      </div>

      {/* Preview dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <RefreshCw className="size-4 text-amber-600" /> تعديل المصمم — {caseCode}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {textRevision ? (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <div className="font-bold text-amber-700 dark:text-amber-400 mb-1">التعديل النصي</div>
                <div className="whitespace-pre-wrap text-foreground/90">{textRevision}</div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">لا يوجد تعديل نصي من المصمم.</div>
            )}

            {revisionFilePath ? (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="text-xs font-bold mb-2 flex items-center gap-1.5">
                  <FileArchive className="size-3.5 text-gold" />
                  {revisionFileName || "ملف التصميم المعدّل"}
                </div>
                <button
                  type="button"
                  onClick={previewFile}
                  disabled={resolving}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gold/60 bg-gold/10 px-3 py-1.5 text-xs font-bold hover:gradient-gold hover:text-gold-foreground transition disabled:opacity-60"
                >
                  {resolving ? <Loader2 className="size-3.5 animate-spin" />
                    : isZip ? <Eye className="size-3.5" /> : <ExternalLink className="size-3.5" />}
                  {isZip ? "عرض محتوى الملف" : "فتح الملف"}
                </button>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">لا يوجد ملف تصميم معدّل.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ZipViewerDialog
        url={zip?.url ?? null}
        fileName={zip?.name}
        open={!!zip}
        onOpenChange={(v) => { if (!v) setZip(null); }}
      />
    </div>
  );
}
