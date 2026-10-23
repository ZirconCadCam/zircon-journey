import { useEffect, useState, type ReactNode } from "react";
import { Trash2, Send, Pencil, Archive, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BatchToolbar, RowCheck, useBatchSelection } from "@/components/batch-toolbar";
import { batchTrash, batchCasesToTelegram, batchUpdateCases, batchArchiveCases } from "@/lib/secure-ops.functions";
import { hasValidStaffSession } from "@/lib/staff-session";
import { STATUS_LABELS } from "@/hooks/use-auth";

/** True when this device holds an administration session. */
export function useIsAdmin(): boolean {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    setAdmin(localStorage.getItem("zircon_admin_all") === "1" || hasValidStaffSession("admin"));
  }, []);
  return admin;
}

/**
 * Admin-only multi-select for case lists: delete, send to Telegram, edit, archive.
 * Returns the toolbar and a per-row checkbox renderer (both null for non-admins).
 */
export function useCaseBatch(ids: string[], onDone?: () => void) {
  const isAdmin = useIsAdmin();
  const sel = useBatchSelection(ids);
  const [editIds, setEditIds] = useState<string[] | null>(null);
  const [status, setStatus] = useState("");
  const [shade, setShade] = useState("");
  const [saving, setSaving] = useState(false);

  function done(ok: boolean, error: string | null | undefined, msg: string) {
    if (!ok) { toast.error(error || "تعذر التنفيذ"); return; }
    toast.success(msg);
    sel.clear();
    onDone?.();
  }

  async function saveEdit() {
    if (!editIds) return;
    const patch: { status?: string; shade?: string } = {};
    if (status) patch.status = status;
    if (shade.trim()) patch.shade = shade.trim();
    if (!Object.keys(patch).length) { toast.error("اختر تعديلاً واحداً على الأقل"); return; }
    setSaving(true);
    const r = await batchUpdateCases({ data: { ids: editIds, patch } });
    setSaving(false);
    setEditIds(null);
    done(r.ok, r.error, `تم تعديل ${editIds.length} حالة`);
  }

  if (!isAdmin) return { bar: null as ReactNode, check: (_id: string) => null as ReactNode };

  const bar = (
    <>
      <BatchToolbar
        sel={sel}
        actions={[
          { key: "edit", label: "تعديل", icon: <Pencil className="size-3.5" />, onClick: (x) => { setStatus(""); setShade(""); setEditIds(x); } },
          { key: "archive", label: "أرشفة", icon: <Archive className="size-3.5" />, onClick: async (x) => { const r = await batchArchiveCases({ data: { ids: x } }); done(r.ok, r.error, `تمت أرشفة ${x.length} حالة`); } },
          { key: "telegram", label: "إرسال للتلجرام", icon: <Send className="size-3.5" />, onClick: async (x) => { const r = await batchCasesToTelegram({ data: { ids: x } }); done(r.ok, r.error, "أُضيفت للطابور وسترسل للجروب"); } },
          { key: "trash", label: "حذف", danger: true, icon: <Trash2 className="size-3.5" />, onClick: async (x) => { const r = await batchTrash({ data: { table: "slot_cases", ids: x } }); done(r.ok, r.error, `نُقلت ${x.length} حالة لسلة المهملات`); } },
        ]}
      />
      {editIds && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setEditIds(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-card border border-border p-5 shadow-luxury space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="font-bold text-sm flex items-center gap-2"><Pencil className="size-4 text-gold" /> تعديل {editIds.length} حالة</div>
            <label className="text-xs font-bold flex flex-col gap-1">المرحلة
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-input bg-background px-3 py-2 text-sm">
                <option value="">— بدون تغيير —</option>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold flex flex-col gap-1">اللون
              <input value={shade} onChange={(e) => setShade(e.target.value)} placeholder="بدون تغيير" className="rounded-lg border border-input bg-background px-3 py-2 text-sm" />
            </label>
            <div className="flex gap-2">
              <button onClick={saveEdit} disabled={saving} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg gradient-gold text-gold-foreground px-3 py-2 text-xs font-bold disabled:opacity-50">
                {saving && <Loader2 className="size-3.5 animate-spin" />} حفظ
              </button>
              <button onClick={() => setEditIds(null)} className="rounded-lg border border-border px-3 py-2 text-xs font-bold">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
  return { bar, check: (id: string) => <RowCheck sel={sel} id={id} /> };
}
