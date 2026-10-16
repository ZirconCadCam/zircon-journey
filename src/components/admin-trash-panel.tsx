import { useCallback, useEffect, useState } from "react";
import { Loader2, RotateCcw, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { listTrashed, batchRestore, batchDeletePermanent } from "@/lib/secure-ops.functions";
import { BatchToolbar, RowCheck, useBatchSelection } from "@/components/batch-toolbar";

type TrashTable = "slot_cases" | "doctor_files" | "expenses";

const TABS: { key: TrashTable; label: string }[] = [
  { key: "slot_cases", label: "الحالات" },
  { key: "doctor_files", label: "ملفات الأطباء" },
  { key: "expenses", label: "المصروفات" },
];

function daysLeft(trashedAt: string) {
  const left = 7 - Math.floor((Date.now() - new Date(trashedAt).getTime()) / 86400000);
  return Math.max(0, left);
}

function rowTitle(table: TrashTable, r: any) {
  if (table === "slot_cases") return `${r.case_code} — ${r.patient_name}`;
  if (table === "doctor_files") return r.file_name;
  return `${r.vendor ?? "مصروف"}${r.amount != null ? ` — ${r.amount} ${r.currency ?? ""}` : ""} (${r.file_name})`;
}

export function AdminTrashPanel() {
  const [table, setTable] = useState<TrashTable>("slot_cases");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setRows(await listTrashed({ data: { table } }));
    setLoading(false);
  }, [table]);

  useEffect(() => { load(); }, [load]);

  const sel = useBatchSelection(rows.map((r) => r.id));

  async function restore(ids: string[]) {
    setBusy(true);
    const r = await batchRestore({ data: { table, ids } });
    setBusy(false);
    if (r.ok) { toast.success("تمت الاستعادة"); sel.clear(); load(); }
    else toast.error(r.error ?? "تعذرت الاستعادة");
  }

  async function purge(ids: string[]) {
    if (!confirm(`حذف ${ids.length} عنصر نهائياً مع ملفاته؟ لا يمكن التراجع.`)) return;
    setBusy(true);
    const r = await batchDeletePermanent({ data: { table, ids } });
    setBusy(false);
    if (r.ok) { toast.success("تم الحذف النهائي"); sel.clear(); load(); }
    else toast.error(r.error ?? "تعذر الحذف");
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTable(t.key)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold border transition ${table === t.key ? "gradient-gold text-gold-foreground border-transparent shadow-gold" : "border-border bg-background hover:border-gold"}`}>
            {t.label}
          </button>
        ))}
        <button onClick={load} disabled={loading}
          className="mr-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted/40 transition disabled:opacity-50">
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> تحديث
        </button>
      </div>

      <div className="text-xs text-muted-foreground rounded-lg border border-border bg-muted/20 px-3 py-2">
        تُحذف العناصر نهائياً تلقائياً بعد 7 أيام من نقلها هنا. الحذف النهائي اليدوي يحذف الملفات من التخزين فوراً.
      </div>

      <BatchToolbar sel={sel} busy={busy} actions={[
        { key: "restore", label: "استعادة", icon: <RotateCcw className="size-3.5" />, onClick: restore },
        { key: "purge", label: "حذف نهائي", icon: <Trash2 className="size-3.5" />, danger: true, onClick: purge },
      ]} />

      {loading ? (
        <div className="rounded-2xl bg-card border border-border p-12 text-center text-muted-foreground shadow-luxury">
          <Loader2 className="size-6 animate-spin mx-auto mb-2" /> جارِ التحميل…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl bg-card border border-border p-12 text-center text-muted-foreground shadow-luxury">
          <Trash2 className="size-10 mx-auto mb-3 opacity-40" />
          سلة المهملات فارغة
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className={`rounded-xl bg-card border p-4 shadow-luxury flex items-center justify-between gap-3 flex-wrap ${sel.isSelected(r.id) ? "border-gold/60 bg-gold/5" : "border-border"}`}>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <RowCheck sel={sel} id={r.id} />
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">{rowTitle(table, r)}</div>
                  <div className="text-[11px] text-muted-foreground">
                    نُقل {new Date(r.trashed_at).toLocaleDateString("ar-EG")} — متبقٍ {daysLeft(r.trashed_at)} أيام للحذف النهائي
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => restore([r.id])} disabled={busy}
                  className="inline-flex items-center gap-1 rounded-lg border border-gold/60 bg-gold/10 px-2.5 py-1.5 text-xs font-bold hover:gradient-gold hover:text-gold-foreground transition disabled:opacity-50">
                  <RotateCcw className="size-3.5" /> استعادة
                </button>
                <button onClick={() => purge([r.id])} disabled={busy}
                  className="inline-flex items-center gap-1 rounded-lg border border-destructive/50 text-destructive px-2.5 py-1.5 text-xs font-bold hover:bg-destructive/10 transition disabled:opacity-50">
                  <Trash2 className="size-3.5" /> حذف نهائي
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
