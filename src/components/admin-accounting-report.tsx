import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { teethOf } from "@/lib/report-build";
import { printHtmlDocument } from "@/lib/print-report";
import {
  FileSpreadsheet, Loader2, RefreshCw, Printer, Stethoscope, MonitorCog, Wrench,
} from "lucide-react";
import { listPointWithdrawals } from "@/lib/secure-ops.functions";


/* ------------------------------ helpers ------------------------------ */

const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

interface Doctor { slot: number; name: string; branch: string | null }

interface Row {
  id: string;
  doctor_slot: number;
  patient_name: string;
  patient_phone: string | null;
  teeth_count: string | null;
  tooth_number: string | null;
  created_at: string;
  updated_at: string;
  archived: boolean;
  final_archived: boolean;
  archive_reviewed_at: string | null;
  archive_approval: string | null;
  remaining_amount: number | null;
  design_done: boolean;
  design_delivered_at: string | null;
  design_sent_at: string | null;
  permanent_fabrication_done: boolean;
  perm_sent_at: string | null;
}

const SELECT =
  "id,doctor_slot,patient_name,patient_phone,teeth_count,tooth_number,created_at,updated_at," +
  "archived,final_archived,archive_reviewed_at,archive_approval,remaining_amount," +
  "design_done,design_delivered_at,design_sent_at,permanent_fabrication_done,perm_sent_at";

const norm = (s: unknown) =>
  String(s ?? "").replace(/[\u064B-\u0652\u200f\u200e]/g, "").replace(/[إأآا]/g, "ا").replace(/\s+/g, " ").trim();
const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const isSpecialName = (s: unknown) => /(تعديل|اعادة|اعاده)/.test(norm(s));

function monthKey(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${AR_MONTHS[Number(m) - 1] ?? m} ${y}`;
}
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("ar-EG") : "—");

function dedupe(rows: Row[]): Row[] {
  const seen = new Map<string, Row>();
  for (const r of rows) {
    const key = `${norm(r.patient_name)}|${digits(r.patient_phone)}`;
    const prev = seen.get(key);
    if (!prev || new Date(r.created_at) < new Date(prev.created_at)) seen.set(key, r);
  }
  return [...seen.values()].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}
function dupPhones(rows: Row[]): Set<string> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const ph = digits(r.patient_phone);
    if (ph) counts.set(ph, (counts.get(ph) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k));
}
const sumTeeth = (rows: Row[]) => rows.reduce((s, r) => s + teethOf(r), 0);
const split = (rows: Row[]) => ({
  normal: rows.filter((r) => !isSpecialName(r.patient_name)),
  special: rows.filter((r) => isSpecialName(r.patient_name)),
});

/** الشهر المنتهي (الشهر السابق للشهر الحالي). */
function lastFinishedMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* ------------------------------- component ------------------------------- */

type Scope = "doctors" | "designer" | "technician";

export function AdminAccountingReport() {
  const [rows, setRows] = useState<Row[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [withdrawals, setWithdrawals] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState<string>(lastFinishedMonth());

  async function load() {
    setLoading(true);
    const [cases, docs, wdRows] = await Promise.all([
      supabase.from("slot_cases").select(SELECT).order("created_at", { ascending: true }),
      supabase.from("doctor_profiles").select("slot,name,branch").order("slot"),
      listPointWithdrawals({ data: {} }).catch(() => [] as any[]),
    ]);
    const wd = { data: wdRows };
    setRows((cases.data ?? []) as unknown as Row[]);
    setDoctors((docs.data ?? []) as Doctor[]);
    const map: Record<number, number> = {};
    for (const w of (wd.data ?? []) as any[]) {
      map[Number(w.doctor_slot)] = (map[Number(w.doctor_slot)] ?? 0) + (Number(w.points) || 0);
    }
    setWithdrawals(map);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const nameOf = (slot: number) => doctors.find((d) => d.slot === slot)?.name ?? `#${slot}`;

  const doctorDateOf = (r: Row) => r.archive_reviewed_at ?? r.updated_at;
  const designerDateOf = (r: Row) => r.design_delivered_at ?? r.design_sent_at ?? r.updated_at;
  const techDateOf = (r: Row) => r.perm_sent_at ?? r.updated_at;

  const doctorRows = useMemo(
    () => dedupe(rows.filter((r) =>
      (r.final_archived || r.archived || r.archive_approval === "approved") &&
      monthKey(doctorDateOf(r)) === month)),
    [rows, month],
  );
  const designerRows = useMemo(
    () => dedupe(rows.filter((r) => r.design_done && monthKey(designerDateOf(r)) === month)),
    [rows, month],
  );
  const techRows = useMemo(
    () => dedupe(rows.filter((r) => r.permanent_fabrication_done && monthKey(techDateOf(r)) === month)),
    [rows, month],
  );

  const months = useMemo(() => {
    const set = new Set<string>([month, lastFinishedMonth()]);
    for (const r of rows) {
      for (const k of [monthKey(doctorDateOf(r)), monthKey(designerDateOf(r)), monthKey(techDateOf(r))]) {
        if (k) set.add(k);
      }
    }
    return [...set].sort().reverse();
  }, [rows, month]);

  const totalWithdrawn = useMemo(
    () => [...new Set(doctorRows.map((r) => r.doctor_slot))]
      .reduce((s, slot) => s + (withdrawals[slot] ?? 0), 0),
    [doctorRows, withdrawals],
  );

  function downloadPdf() {
    printHtmlDocument(
      buildCombinedHtml({
        monthLabel: monthLabel(month),
        doctorRows, designerRows, techRows,
        nameOf, doctorDateOf, designerDateOf, techDateOf,
        withdrawn: totalWithdrawn,
      }),
      `تقرير الحسابات ${monthLabel(month)}`,
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl gradient-brown text-primary-foreground p-6 shadow-luxury flex items-center gap-4 flex-wrap">
        <div className="size-14 rounded-2xl gradient-gold grid place-items-center shadow-gold">
          <FileSpreadsheet className="size-6 text-gold-foreground" />
        </div>
        <div className="min-w-0">
          <div className="text-xs opacity-80">إدارة المركز</div>
          <div className="text-2xl font-extrabold">تقرير الحسابات</div>
          <div className="text-xs opacity-80 mt-1">جداول الأطباء والمصمم والفني للشهر المنتهي مع جداول التعديل/الإعادة</div>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-xs font-bold outline-none"
          >
            {months.map((m) => <option key={m} value={m} className="text-foreground">{monthLabel(m)}</option>)}
          </select>
          <button onClick={load} disabled={loading}
            className="rounded-xl bg-white/10 p-2.5 hover:bg-white/20 disabled:opacity-50" title="تحديث">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          </button>
          <button onClick={downloadPdf} disabled={loading}
            className="rounded-xl gradient-gold text-gold-foreground px-4 py-2.5 text-sm font-bold shadow-gold flex items-center gap-2 disabled:opacity-50">
            <Printer className="size-4" /> تحميل PDF
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl bg-card border border-border p-10 grid place-items-center shadow-luxury">
          <Loader2 className="size-6 animate-spin text-gold" />
        </div>
      ) : (
        <div className="space-y-6">
          <ScopeBlock
            scope="doctors" title="نقاط الأطباء — الحالات المؤرشفة" Icon={Stethoscope}
            rows={doctorRows} nameOf={nameOf} dateOf={doctorDateOf} dateHeader="تاريخ الأرشفة"
            withdrawn={totalWithdrawn}
          />
          <ScopeBlock
            scope="designer" title="حساب المصمم — الحالات المُصمَّمة" Icon={MonitorCog}
            rows={designerRows} nameOf={nameOf} dateOf={designerDateOf} dateHeader="تاريخ التصميم"
          />
          <ScopeBlock
            scope="technician" title="حساب الفني — نحت الزركون الدائم" Icon={Wrench}
            rows={techRows} nameOf={nameOf} dateOf={techDateOf} dateHeader="تاريخ النحت الدائم"
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------ scope block ------------------------------ */

function ScopeBlock({
  scope, title, Icon, rows, nameOf, dateOf, dateHeader, withdrawn,
}: {
  scope: Scope;
  title: string;
  Icon: typeof Stethoscope;
  rows: Row[];
  nameOf: (slot: number) => string;
  dateOf: (r: Row) => string | null;
  dateHeader: string;
  withdrawn?: number;
}) {
  const { normal, special } = split(rows);
  const dup = dupPhones(rows);
  const total = sumTeeth(rows);

  return (
    <div className="rounded-2xl bg-card border border-border p-5 shadow-luxury space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="size-10 rounded-xl bg-gold/10 text-gold grid place-items-center"><Icon className="size-5" /></div>
        <div className="font-bold">{title}</div>
        <div className="ms-auto flex gap-2 text-[11px] font-bold">
          <span className="rounded-full border border-border bg-muted/30 px-3 py-1">{rows.length} حالة</span>
          <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-gold">
            {total} {scope === "doctors" ? "نقطة" : "سِنّ"}
          </span>
          {withdrawn != null && (
            <span className="rounded-full border border-border bg-muted/30 px-3 py-1">
              المسحوبة {withdrawn} • المتبقية {total - withdrawn}
            </span>
          )}
        </div>
      </div>

      <ScopeTable
        caption="الحالات العادية" rows={normal} dup={dup} nameOf={nameOf}
        dateOf={dateOf} dateHeader={dateHeader} scope={scope} mark={false}
      />
      <ScopeTable
        caption="الحالات المعدّلة / الإعادة" rows={special} dup={dup} nameOf={nameOf}
        dateOf={dateOf} dateHeader={dateHeader} scope={scope} mark
      />
    </div>
  );
}

function ScopeTable({
  caption, rows, dup, nameOf, dateOf, dateHeader, scope, mark,
}: {
  caption: string;
  rows: Row[];
  dup: Set<string>;
  nameOf: (slot: number) => string;
  dateOf: (r: Row) => string | null;
  dateHeader: string;
  scope: Scope;
  mark: boolean;
}) {
  const total = sumTeeth(rows);
  const showAmount = scope === "doctors";
  const cols = showAmount ? 7 : 6;
  return (
    <div className="space-y-2">
      <div className={`text-xs font-bold ${mark ? "text-red-600" : "text-muted-foreground"}`}>{caption}</div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="p-2 text-right">#</th>
              <th className="p-2 text-right">اسم المريض</th>
              <th className="p-2 text-right">رقم الهاتف</th>
              <th className="p-2 text-right">الطبيب</th>
              <th className="p-2 text-right">{scope === "doctors" ? "عدد النقاط" : "عدد الأسنان"}</th>
              <th className="p-2 text-right">{dateHeader}</th>
              {showAmount && <th className="p-2 text-right">المبلغ المتبقي</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={cols} className="p-5 text-center text-xs text-muted-foreground">لا توجد حالات</td></tr>
            ) : rows.map((r, i) => (
              <tr key={r.id} className={`border-t border-border ${mark ? "bg-red-500/5" : ""}`}>
                <td className="p-2 text-xs text-muted-foreground">{i + 1}</td>
                <td className={`p-2 font-bold ${mark ? "text-red-600" : ""}`}>{r.patient_name}</td>
                <td className={`p-2 font-mono text-xs ${dup.has(digits(r.patient_phone)) ? "text-red-600 font-bold" : ""}`} dir="ltr">
                  {r.patient_phone || "—"}
                </td>
                <td className="p-2 text-xs">{nameOf(r.doctor_slot)}</td>
                <td className={`p-2 font-extrabold ${mark ? "text-red-600" : "text-gold"}`}>{teethOf(r) || "—"}</td>
                <td className="p-2 text-xs">{fmtDate(dateOf(r))}</td>
                {showAmount && <td className="p-2 font-mono text-xs">{r.remaining_amount ?? "—"}</td>}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gold bg-gold/10 font-extrabold">
              <td className="p-2" colSpan={4}>المجموع — {rows.length} حالة</td>
              <td className="p-2" colSpan={cols - 4}>{total} {scope === "doctors" ? "نقطة" : "سِنّ"}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* --------------------------- printable document --------------------------- */

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

function buildCombinedHtml(opts: {
  monthLabel: string;
  doctorRows: Row[];
  designerRows: Row[];
  techRows: Row[];
  nameOf: (slot: number) => string;
  doctorDateOf: (r: Row) => string | null;
  designerDateOf: (r: Row) => string | null;
  techDateOf: (r: Row) => string | null;
  withdrawn: number;
}): string {
  const section = (
    title: string,
    rows: Row[],
    dateOf: (r: Row) => string | null,
    dateHeader: string,
    unit: string,
    showAmount: boolean,
  ) => {
    const dup = dupPhones(rows);
    const { normal, special } = split(rows);
    const table = (caption: string, list: Row[], mark: boolean) => {
      const t = sumTeeth(list);
      const cols = showAmount ? 7 : 6;
      const body = list.length
        ? list.map((r, i) => `<tr class="${mark ? "rep" : ""}">
        <td>${i + 1}</td>
        <td class="b">${esc(r.patient_name)}</td>
        <td class="mono${dup.has(digits(r.patient_phone)) ? " dup" : ""}" dir="ltr">${esc(r.patient_phone ?? "—")}</td>
        <td>${esc(opts.nameOf(r.doctor_slot))}</td>
        <td class="b">${teethOf(r) || "—"}</td>
        <td>${fmtDate(dateOf(r))}</td>
        ${showAmount ? `<td class="mono">${r.remaining_amount ?? "—"}</td>` : ""}
      </tr>`).join("")
        : `<tr><td colspan="${cols}" class="empty">لا توجد حالات</td></tr>`;
      return `<h3>${esc(caption)}</h3>
  <table>
    <thead><tr><th>#</th><th>اسم المريض</th><th>رقم الهاتف</th><th>الطبيب</th><th>${esc(unit)}</th><th>${esc(dateHeader)}</th>${showAmount ? "<th>المبلغ المتبقي</th>" : ""}</tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr><td colspan="4">المجموع — ${list.length} حالة</td><td colspan="${cols - 4}">${t}</td></tr></tfoot>
  </table>`;
    };
    return `<section>
  <h2>${esc(title)} — ${rows.length} حالة • ${sumTeeth(rows)}</h2>
  ${table("الحالات العادية", normal, false)}
  ${table("الحالات المعدّلة / الإعادة", special, true)}
</section>`;
  };

  const docTotal = sumTeeth(opts.doctorRows);
  const title = `تقرير الحسابات — ${opts.monthLabel}`;
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page{size:A4;margin:12mm}
body{font-family:'Segoe UI',Tahoma,sans-serif;background:#fff;color:#221c14;margin:0;padding:16px}
h1{font-size:20px;margin:0 0 4px}.sub{color:#7a6a55;font-size:12px;margin-bottom:16px}
section{border:1px solid #e6ddcd;border-radius:12px;padding:12px;margin-bottom:16px;page-break-inside:avoid}
h2{font-size:14px;margin:0 0 8px;color:#8a6a20}
h3{font-size:12px;margin:12px 0 6px;color:#6b5a42}
table{width:100%;border-collapse:collapse;font-size:11.5px}
th,td{padding:5px 7px;text-align:right;border-bottom:1px solid #f0e9dc}
thead th{background:#f6f0e4;color:#6b5a42}
tfoot td{background:#fbf3de;font-weight:700;border-top:2px solid #d9b96b}
.mono{font-family:monospace;font-size:11px}.b{font-weight:700}
.dup{color:#c02626;font-weight:700}.rep td{color:#c02626;background:#fdeaea}
.empty{text-align:center;color:#9a8f7d;padding:14px}
.cards{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}
.card{flex:1 1 130px;border:1px solid #e6ddcd;border-radius:10px;padding:10px}
.card .l{font-size:10px;color:#7a6a55}.card .v{font-size:18px;font-weight:800}
</style></head><body>
<h1>${esc(title)}</h1>
<div class="sub">${esc(opts.monthLabel)} • مركز زركون CAD/CAM</div>
<div class="cards">
  <div class="card"><div class="l">نقاط الأطباء</div><div class="v">${docTotal}</div></div>
  <div class="card"><div class="l">النقاط المسحوبة</div><div class="v">${opts.withdrawn}</div></div>
  <div class="card"><div class="l">النقاط المتبقية</div><div class="v">${docTotal - opts.withdrawn}</div></div>
  <div class="card"><div class="l">أسنان المصمم</div><div class="v">${sumTeeth(opts.designerRows)}</div></div>
  <div class="card"><div class="l">أسنان الفني</div><div class="v">${sumTeeth(opts.techRows)}</div></div>
</div>
${section("نقاط الأطباء — الحالات المؤرشفة", opts.doctorRows, opts.doctorDateOf, "تاريخ الأرشفة", "عدد النقاط", true)}
${section("حساب المصمم — الحالات المُصمَّمة", opts.designerRows, opts.designerDateOf, "تاريخ التصميم", "عدد الأسنان", false)}
${section("حساب الفني — نحت الزركون الدائم", opts.techRows, opts.techDateOf, "تاريخ النحت الدائم", "عدد الأسنان", false)}
</body></html>`;
}
