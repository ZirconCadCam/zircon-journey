import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCw, ArrowRight, Download, FileText, Loader2, Receipt, Trash2, Upload, Eye } from "lucide-react";
import { toast } from "sonner";
import { hasValidStaffSession } from "@/lib/staff-session";
import {
  EXPENSE_CATEGORIES, uploadExpense, listExpenses, updateExpense, deleteExpense, expenseFileUrl, retryExpense,
} from "@/lib/expenses.functions";
import { batchTrash } from "@/lib/secure-ops.functions";
import { BatchToolbar, RowCheck, useBatchSelection } from "@/components/batch-toolbar";
import { safeCsvCell } from "@/lib/report-safety";

export const Route = createFileRoute("/admin/expenses")({
  head: () => ({
    meta: [
      { title: "المصروفات — مركز زركون" },
      { name: "description", content: "رفع الفواتير والإيصالات وقراءتها وتصنيفها تلقائياً وتصدير جدول المصروفات." },
      { property: "og:title", content: "المصروفات — مركز زركون" },
      { property: "og:description", content: "قراءة الفواتير بالذكاء الاصطناعي وتصدير المصروفات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExpensesPage,
});

type Row = Awaited<ReturnType<typeof listExpenses>>[number];
const ACCEPT = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

function toBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

function ExpensesPage() {
  const nav = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string[]>([]);
  const [cat, setCat] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => { setLoading(true); setRows(await listExpenses()); setLoading(false); };
  useEffect(() => {
    if (!hasValidStaffSession("admin")) { nav({ to: "/staff/$role", params: { role: "admin" } }); return; }
    load();
  }, [nav]);

  async function onFiles(files: FileList | null) {
    if (!files) return;
    for (const f of Array.from(files)) {
      if (!(ACCEPT as readonly string[]).includes(f.type)) { toast.error(`${f.name}: نوع غير مدعوم (صور أو PDF فقط)`); continue; }
      if (f.size > 10 * 1024 * 1024) { toast.error(`${f.name}: الحجم أكبر من 10 ميجا`); continue; }
      setBusy((b) => [...b, f.name]);
      try {
        const r = await uploadExpense({ data: { fileName: f.name, mime: f.type as (typeof ACCEPT)[number], base64: await toBase64(f) } });
        if (r.ok) toast.success(`تمت قراءة ${f.name}`);
        else toast.error(`${f.name}: ${r.error ?? "فشل"}`);
      } catch (e) { toast.error(`${f.name}: ${e instanceof Error ? e.message : "فشل"}`); }
      setBusy((b) => b.filter((n) => n !== f.name));
      await load();
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  async function patch(id: string, p: Partial<Pick<Row, "vendor" | "expense_date" | "amount" | "currency" | "description">> & { category?: (typeof EXPENSE_CATEGORIES)[number] }) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } as Row : r)));
    const r = await updateExpense({ data: { id, patch: p } });
    if (!r.ok) toast.error(r.error ?? "تعذر الحفظ");
  }

  const filtered = useMemo(() => rows.filter((r) =>
    (cat === "all" || r.category === cat) &&
    (!from || (r.expense_date ?? r.created_at.slice(0, 10)) >= from) &&
    (!to || (r.expense_date ?? r.created_at.slice(0, 10)) <= to)), [rows, cat, from, to]);

  const sel = useBatchSelection(filtered.map((r) => r.id));

  async function trashSelected(ids: string[]) {
    if (!confirm(`نقل ${ids.length} مصروف إلى سلة المهملات؟ يُحذف نهائياً بعد 7 أيام.`)) return;
    const r = await batchTrash({ data: { table: "expenses", ids } });
    if (r.ok) { toast.success("تم النقل إلى سلة المهملات"); sel.clear(); await load(); }
    else toast.error(r.error ?? "تعذر الحذف");
  }

  const totals = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) if (r.amount != null) m.set(r.currency ?? "—", (m.get(r.currency ?? "—") ?? 0) + Number(r.amount));
    return [...m.entries()];
  }, [filtered]);

  function exportCsv() {
    const head = ["التاريخ", "المورد", "التصنيف", "المبلغ", "العملة", "رقم الفاتورة", "الوصف", "الملف"];
    const lines = [head, ...filtered.map((r) => [r.expense_date, r.vendor, r.category, r.amount, r.currency, r.invoice_number, r.description, r.file_name])]
      .map((l) => l.map(safeCsvCell).join(","));
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function retry(id: string) {
    setBusy((b) => [...b, id]);
    try {
      const r = await retryExpense({ data: { id } });
      if (r.ok) toast.success("تمت إعادة القراءة بنجاح"); else toast.error(r.error ?? "تعذرت القراءة");
    } catch (e) { toast.error(e instanceof Error ? e.message : "تعذرت القراءة"); }
    setBusy((b) => b.filter((x) => x !== id));
    await load();
  }

  async function retryAllFailed() {
    for (const r of rows.filter((x) => x.status === "failed")) await retry(r.id);
  }

  async function view(id: string) {
    const { url } = await expenseFileUrl({ data: { id } });
    if (url) window.open(url, "_blank", "noopener"); else toast.error("تعذر فتح الملف");
  }

  async function remove(id: string) {
    if (!confirm("نقل هذا المصروف إلى سلة المهملات؟ يُحذف نهائياً بعد 7 أيام.")) return;
    const r = await deleteExpense({ data: { id } });
    if (r.ok) setRows((rs) => rs.filter((x) => x.id !== id)); else toast.error(r.error ?? "تعذر الحذف");
  }

  const inp = "bg-background border border-border rounded-md px-2 py-1 text-sm w-full";

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Receipt className="size-6 text-primary" /> المصروفات</h1>
        <Link to="/staff/$role" params={{ role: "admin" }} className="text-sm flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <ArrowRight className="size-4" /> رجوع للإدارة
        </Link>
      </div>

      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files); }}
        className="block border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:bg-muted/30 transition">
        <input ref={inputRef} type="file" multiple accept={ACCEPT.join(",")} className="hidden" onChange={(e) => onFiles(e.target.files)} />
        <Upload className="size-8 mx-auto text-primary mb-2" />
        <div className="font-bold">ارفع الفواتير والإيصالات</div>
        <div className="text-sm text-muted-foreground">صور أو PDF حتى 10 ميجا — تُقرأ وتُصنّف تلقائياً</div>
        {busy.length > 0 && (
          <div className="mt-3 text-sm flex items-center justify-center gap-2 text-primary">
            <Loader2 className="size-4 animate-spin" /> جارٍ القراءة…
          </div>
        )}
      </label>

      <div className="flex flex-wrap items-end gap-3">
        <div><div className="text-xs text-muted-foreground mb-1">التصنيف</div>
          <select value={cat} onChange={(e) => setCat(e.target.value)} className={inp}>
            <option value="all">الكل</option>
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select></div>
        <div><div className="text-xs text-muted-foreground mb-1">من</div><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inp} /></div>
        <div><div className="text-xs text-muted-foreground mb-1">إلى</div><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inp} /></div>
        <button onClick={exportCsv} disabled={!filtered.length}
          className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 bg-primary text-primary-foreground disabled:opacity-50">
          <Download className="size-4" /> تصدير Excel (CSV)
        </button>
        {rows.some((r) => r.status === "failed") && (
          <button onClick={retryAllFailed} disabled={busy.length > 0}
            className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 border border-border hover:bg-muted disabled:opacity-50">
            <RotateCw className="size-4" /> إعادة قراءة كل المتعذّرة ({rows.filter((r) => r.status === "failed").length})
          </button>
        )}
        <div className="text-sm text-muted-foreground ms-auto">
          {filtered.length} مصروف{totals.length > 0 && " — الإجمالي: "}
          {totals.map(([c, v]) => `${v.toLocaleString("ar")} ${c}`).join(" + ")}
        </div>
      </div>

      <BatchToolbar
        sel={sel}
        actions={[{ key: "trash", label: "حذف (سلة المهملات)", icon: <Trash2 className="size-3.5" />, danger: true, onClick: trashSelected }]}
      />

      <div className="overflow-x-auto border border-border rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>{["", "التاريخ", "المورد", "التصنيف", "المبلغ", "العملة", "الوصف", ""].map((h, i) => <th key={i} className="p-2 text-start font-bold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground"><Loader2 className="size-5 animate-spin inline" /></td></tr>}
            {!loading && !filtered.length && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">لا توجد مصروفات بعد</td></tr>}
            {filtered.map((r) => (
              <tr key={`${r.id}-${r.status}-${r.amount ?? ""}-${r.vendor ?? ""}`} className={`border-t border-border align-top ${sel.isSelected(r.id) ? "bg-gold/5" : ""}`}>
                <td className="p-2 w-8"><RowCheck sel={sel} id={r.id} /></td>
                <td className="p-2 w-36"><input type="date" defaultValue={r.expense_date ?? ""} className={inp}
                  onBlur={(e) => e.target.value !== (r.expense_date ?? "") && patch(r.id, { expense_date: e.target.value || null })} /></td>
                <td className="p-2"><input defaultValue={r.vendor ?? ""} className={inp}
                  onBlur={(e) => e.target.value !== (r.vendor ?? "") && patch(r.id, { vendor: e.target.value || null })} />
                  {r.status === "failed" && <div className="text-xs text-destructive mt-1">لم تُقرأ: {r.error}</div>}</td>
                <td className="p-2 w-40"><select value={r.category} className={inp}
                  onChange={(e) => patch(r.id, { category: e.target.value as (typeof EXPENSE_CATEGORIES)[number] })}>
                  {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></td>
                <td className="p-2 w-28"><input type="number" step="any" defaultValue={r.amount ?? ""} className={inp}
                  onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== r.amount) patch(r.id, { amount: v }); }} /></td>
                <td className="p-2 w-20"><input defaultValue={r.currency ?? ""} className={inp}
                  onBlur={(e) => e.target.value !== (r.currency ?? "") && patch(r.id, { currency: e.target.value || null })} /></td>
                <td className="p-2"><input defaultValue={r.description ?? ""} className={inp}
                  onBlur={(e) => e.target.value !== (r.description ?? "") && patch(r.id, { description: e.target.value || null })} /></td>
                <td className="p-2 whitespace-nowrap">
                  {(r.status === "failed" || busy.includes(r.id)) && (
                    <button onClick={() => retry(r.id)} disabled={busy.includes(r.id)} title="إعادة القراءة بالذكاء الاصطناعي"
                      className="p-1.5 rounded hover:bg-muted text-primary disabled:opacity-50">
                      <RotateCw className={`size-4 ${busy.includes(r.id) ? "animate-spin" : ""}`} />
                    </button>
                  )}
                  <button onClick={() => view(r.id)} title={r.file_name} className="p-1.5 rounded hover:bg-muted">
                    {r.file_mime === "application/pdf" ? <FileText className="size-4" /> : <Eye className="size-4" />}
                  </button>
                  <button onClick={() => remove(r.id)} className="p-1.5 rounded hover:bg-muted text-destructive"><Trash2 className="size-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
