/**
 * Pure helpers + HTML builders for the monthly *accounting* statements
 * (doctor points, designer, technician) that are sent to the Telegram group
 * at the end of every month. No Supabase / browser imports — server safe.
 *
 * The calculations mirror `src/components/admin-accounting-panel.tsx`.
 */

import { teethOf, type ReportRow } from "@/lib/report-build";

export interface AccRow extends ReportRow {
  id?: string;
  doctor_slot?: number;
  patient_name?: string | null;
  patient_phone?: string | null;
  remaining_amount?: number | null;
  updated_at?: string | null;
  archive_reviewed_at?: string | null;
  archive_approval?: string | null;
  archived?: boolean;
  final_archived?: boolean;
  design_done?: boolean;
  design_delivered_at?: string | null;
  design_sent_at?: string | null;
  permanent_fabrication_done?: boolean;
  perm_sent_at?: string | null;
}

export const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

export const norm = (s: unknown) =>
  String(s ?? "")
    .replace(/[\u064B-\u0652\u200f\u200e]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/\s+/g, " ")
    .trim();
export const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");
export const firstName = (s: unknown) => norm(s).split(" ")[0] ?? "";

const REPEAT_RE = /(اعادة|اعاده)\s*$/;
export const isRepeatName = (s: unknown) => REPEAT_RE.test(norm(s));

/** اسم مريض «معدّل/إعادة»: يحتوي «تعديل» أو إحدى صيغ «إعادة». */
export const isSpecialName = (s: unknown) => {
  const n = norm(s);
  return n.includes("تعديل") || /اعاد[هة]/.test(n);
};

/** Month key ("YYYY-MM") of a date in Aden time (UTC+3). */
export function monthKeyAden(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const t = new Date(d.getTime() + 3 * 3600_000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthKeyOf(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("ar-EG") : "—";

/** Dedupe by patient identity (name + phone), keeping the earliest case. */
export function dedupe(rows: AccRow[]): AccRow[] {
  const seen = new Map<string, AccRow>();
  for (const r of rows) {
    const key = `${norm(r.patient_name)}|${digits(r.patient_phone)}`;
    const prev = seen.get(key);
    if (!prev || new Date(r.created_at ?? 0) < new Date(prev.created_at ?? 0)) seen.set(key, r);
  }
  return [...seen.values()].sort(
    (a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime(),
  );
}

export function dupPhones(rows: AccRow[]): Set<string> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const ph = digits(r.patient_phone);
    if (ph) counts.set(ph, (counts.get(ph) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k));
}

export const sumTeethAcc = (rows: AccRow[]) => rows.reduce((s, r) => s + teethOf(r), 0);

/* ------------------------- selection per scope ------------------------- */

export const doctorDateOf = (r: AccRow) => r.archive_reviewed_at ?? r.updated_at ?? r.created_at;
export const designerDateOf = (r: AccRow) =>
  r.design_delivered_at ?? r.design_sent_at ?? r.updated_at ?? r.created_at;
export const technicianDateOf = (r: AccRow) => r.perm_sent_at ?? r.updated_at ?? r.created_at;

export const isArchivedCase = (r: AccRow) =>
  !!r.final_archived || !!r.archived || r.archive_approval === "approved";

/* ------------------------------- HTML -------------------------------- */

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );

const SHELL_CSS = `
body{font-family:'Segoe UI',Tahoma,sans-serif;background:#faf8f5;color:#221c14;margin:0;padding:24px}
h1{font-size:20px;margin:0 0 4px}.sub{color:#7a6a55;font-size:13px;margin-bottom:20px}
section{background:#fff;border:1px solid #e6ddcd;border-radius:14px;padding:14px;margin-bottom:18px}
h2{font-size:15px;margin:0 0 10px;color:#8a6a20}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:7px 9px;text-align:right;border-bottom:1px solid #f0e9dc}
thead th{background:#f6f0e4;color:#6b5a42}
tfoot td{background:#fbf3de;font-weight:700;border-top:2px solid #d9b96b}
.mono{font-family:monospace;font-size:12px}.b{font-weight:700}
.dup{color:#c02626;font-weight:700}.rep{background:#fdeaea}.rep td{color:#c02626}
.empty{text-align:center;color:#9a8f7d;padding:18px}
.cards{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px}
.card{flex:1 1 150px;background:#fff;border:1px solid #e6ddcd;border-radius:12px;padding:12px}
.card .l{font-size:11px;color:#7a6a55}.card .v{font-size:20px;font-weight:800}
.grand{background:#221c14;color:#f6e7c1;border-radius:14px;padding:14px;font-weight:700;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}
`;

function shell(title: string, sub: string, inner: string): string {
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>${esc(title)}</title><style>${SHELL_CSS}</style></head><body>
<h1>${esc(title)}</h1>
<div class="sub">${esc(sub)} • مركز زركون CAD/CAM</div>
${inner}
</body></html>`;
}

/** يفصل الصفوف إلى عادية ومعدّلة/إعادة (بالاسم أو بمعرّفات التكرار الممرّرة). */
function splitSpecial(rows: AccRow[], extraIds?: Set<string>) {
  const normal: AccRow[] = [];
  const special: AccRow[] = [];
  for (const r of rows) {
    if (isSpecialName(r.patient_name) || (extraIds?.has(String(r.id)) ?? false)) special.push(r);
    else normal.push(r);
  }
  return { normal, special };
}

/** جدول نقاط طبيب واحد لشهر محدد — جدولان: عادي + تعديل/إعادة. */
export function buildDoctorPointsHtml(opts: {
  doctorName: string;
  branch?: string | null;
  monthLabel: string;
  rows: AccRow[];
  withdrawn: number;
}): string {
  const dup = dupPhones(opts.rows);
  const { normal, special } = splitSpecial(opts.rows);
  const totalPoints = sumTeethAcc(opts.rows);
  const totalAmount = opts.rows.reduce((s, r) => s + (Number(r.remaining_amount) || 0), 0);

  const table = (title: string, rows: AccRow[]) => {
    const pts = sumTeethAcc(rows);
    const amt = rows.reduce((s, r) => s + (Number(r.remaining_amount) || 0), 0);
    const body = rows.length
      ? rows
          .map((r, i) => {
            const isDup = dup.has(digits(r.patient_phone));
            return `<tr>
        <td>${i + 1}</td>
        <td class="b">${esc(r.patient_name)}</td>
        <td class="mono${isDup ? " dup" : ""}" dir="ltr">${esc(r.patient_phone ?? "—")}</td>
        <td class="b">${teethOf(r) || "—"}</td>
        <td>${fmtDate(doctorDateOf(r))}</td>
        <td class="mono">${r.remaining_amount == null ? "—" : esc(r.remaining_amount)}</td>
      </tr>`;
          })
          .join("")
      : `<tr><td colspan="6" class="empty">لا توجد حالات</td></tr>`;
    return `<section>
  <h2>${esc(title)}</h2>
  <table>
    <thead><tr><th>#</th><th>اسم المريض</th><th>رقم الهاتف</th><th>عدد النقاط</th><th>تاريخ الأرشفة</th><th>المبلغ المتبقي</th></tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr><td colspan="3">المجموع — ${rows.length} حالة</td><td>${pts} نقطة</td><td>—</td><td class="mono">${amt || 0}</td></tr></tfoot>
  </table>
</section>`;
  };

  const branch = opts.branch === "ibb" ? "فرع إب" : opts.branch === "sanaa" ? "فرع صنعاء" : "";
  const inner = `
<div class="cards">
  <div class="card"><div class="l">مجموع النقاط</div><div class="v">${totalPoints}</div></div>
  <div class="card"><div class="l">النقاط المسحوبة</div><div class="v">${opts.withdrawn}</div></div>
  <div class="card"><div class="l">النقاط المتبقية</div><div class="v">${totalPoints - opts.withdrawn}</div></div>
  <div class="card"><div class="l">إجمالي المبالغ المتبقية</div><div class="v">${totalAmount || 0}</div></div>
</div>
${table("الحالات المؤرشفة", normal)}
${table("الحالات المعدّلة / الإعادة", special)}
<div class="grand"><span>عدد الحالات: ${opts.rows.length}</span><span>مجموع النقاط: ${totalPoints}</span><span>المتبقي: ${totalPoints - opts.withdrawn} نقطة</span></div>`;
  return shell(
    `كشف نقاط ${opts.doctorName} — ${opts.monthLabel}`,
    `${opts.monthLabel}${branch ? " • " + branch : ""}`,
    inner,
  );
}

/** جدول حساب المصمم أو الفني لشهر محدد — جدولان: عادي + تعديل/إعادة. */
export function buildStaffAccountingHtml(opts: {
  staffTitle: string;
  monthLabel: string;
  rows: AccRow[];
  doctorNameOf: (r: AccRow) => string;
  dateOf: (r: AccRow) => string | null | undefined;
  dateHeader: string;
  repeatIds?: Set<string>;
}): string {
  const dup = dupPhones(opts.rows);
  const total = sumTeethAcc(opts.rows);
  const { normal, special } = splitSpecial(opts.rows, opts.repeatIds);
  const specialTotal = sumTeethAcc(special);

  const table = (title: string, rows: AccRow[], mark: boolean) => {
    const t = sumTeethAcc(rows);
    const body = rows.length
      ? rows
          .map((r, i) => {
            const isDup = dup.has(digits(r.patient_phone));
            return `<tr class="${mark ? "rep" : ""}">
        <td>${i + 1}</td>
        <td class="b">${esc(r.patient_name)}</td>
        <td class="mono${isDup ? " dup" : ""}" dir="ltr">${esc(r.patient_phone ?? "—")}</td>
        <td>${esc(opts.doctorNameOf(r))}</td>
        <td class="b">${teethOf(r) || "—"}</td>
        <td>${fmtDate(opts.dateOf(r))}</td>
      </tr>`;
          })
          .join("")
      : `<tr><td colspan="6" class="empty">لا توجد حالات</td></tr>`;
    return `<section>
  <h2>${esc(title)}</h2>
  <table>
    <thead><tr><th>#</th><th>اسم المريض</th><th>رقم الهاتف</th><th>الطبيب</th><th>عدد الأسنان</th><th>${esc(opts.dateHeader)}</th></tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr><td colspan="4">المجموع — ${rows.length} حالة</td><td colspan="2">${t} سِنّ</td></tr></tfoot>
  </table>
</section>`;
  };

  const inner = `
<div class="cards">
  <div class="card"><div class="l">عدد الحالات</div><div class="v">${opts.rows.length}</div></div>
  <div class="card"><div class="l">مجموع الأسنان</div><div class="v">${total}</div></div>
  <div class="card"><div class="l">أسنان التعديل/الإعادة</div><div class="v">${specialTotal}</div></div>
</div>
${table(opts.staffTitle, normal, false)}
${table("الحالات المعدّلة / الإعادة", special, true)}
<div class="grand"><span>عدد الحالات: ${opts.rows.length}</span><span>مجموع الأسنان: ${total} سِنّ</span></div>`;
  return shell(`حساب ${opts.staffTitle} — ${opts.monthLabel}`, opts.monthLabel, inner);
}
