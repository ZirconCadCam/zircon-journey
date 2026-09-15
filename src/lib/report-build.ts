/**
 * Pure helpers shared by the doctor "الكشوفات" panel and the monthly
 * Telegram report job. No Supabase / browser imports — safe on the server.
 */

export type ReportKey = "pending" | "uninstalled" | "completed";

export const REPORT_LABELS: Record<ReportKey, string> = {
  pending: "حالات الزركون المعلقة",
  uninstalled: "حالات الزركون غير المركبة",
  completed: "الزركون المكتمل",
};

export interface ReportRow {
  id?: string;
  case_code?: string | null;
  patient_name?: string | null;
  created_at?: string;
  teeth_count?: string | null;
  tooth_number?: string | null;
  [k: string]: any;
}

/** Number of teeth in a case: explicit count, else parsed FDI tooth numbers. */
export function teethOf(r: ReportRow): number {
  const n = parseInt(String(r.teeth_count ?? ""), 10);
  if (!isNaN(n) && n > 0) return n;
  const tn = String(r.tooth_number ?? "");
  if (!tn) return 0;
  return tn.split(/[،,\s]+/).filter((s) => /^[1-4][1-8]$/.test(s)).length;
}

export function sumTeeth(rows: ReportRow[]): number {
  return rows.reduce((s, r) => s + teethOf(r), 0);
}

export function matchesReportRow(row: ReportRow, key: ReportKey): boolean {
  const installed =
    !!row.permanent_installed_by_doctor || !!row.final_archived;
  if (key === "completed") return installed;
  if (key === "uninstalled") return !!row.permanent_fabrication_done && !installed;
  const tempCarved =
    !!row.fabrication_done ||
    !!row.tech_data_sent_to_secretary ||
    !!row.shipped_to_doctor ||
    !!row.temporary_delivered ||
    row.doctor_decision === "approved" ||
    row.doctor_decision === "revision" ||
    !!row.revision_design_done ||
    !!row.revision_approved_by_tech;
  return tempCarved && !row.permanent_fabrication_done;
}

const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

export function arabicMonth(month1: number, year: number): string {
  return `${AR_MONTHS[month1 - 1] ?? month1} ${year}`;
}

/** Self-contained RTL HTML document for one doctor's monthly statement. */
export function buildMonthlyReportHtml(opts: {
  doctorName: string;
  branch?: string | null;
  monthLabel: string;
  groups: { key: ReportKey; rows: ReportRow[] }[];
}): string {
  const esc = (s: unknown) =>
    String(s ?? "").replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
    );
  const branch = opts.branch === "ibb" ? "فرع إب" : opts.branch === "sanaa" ? "فرع صنعاء" : "";

  const tables = opts.groups
    .map(({ key, rows }) => {
      const total = sumTeeth(rows);
      const body = rows.length
        ? rows
            .map(
              (r, i) => `<tr>
        <td>${i + 1}</td>
        <td>${esc(r.patient_name)}</td>
        <td class="mono">${esc(r.case_code)}</td>
        <td class="b">${teethOf(r) || "—"}</td>
        <td>${r.created_at ? new Date(r.created_at).toLocaleDateString("ar-EG") : ""}</td>
      </tr>`,
            )
            .join("")
        : `<tr><td colspan="5" class="empty">لا توجد حالات</td></tr>`;
      return `<section>
      <h2>${esc(REPORT_LABELS[key])}</h2>
      <table>
        <thead><tr><th>#</th><th>اسم المريض</th><th>رقم الحالة</th><th>عدد الأسنان</th><th>التاريخ</th></tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><td colspan="3">المجموع — ${rows.length} حالة</td><td colspan="2">${total} سِنّ</td></tr></tfoot>
      </table>
    </section>`;
    })
    .join("");

  const grand = sumTeeth(opts.groups.flatMap((g) => g.rows));
  const cases = opts.groups.reduce((s, g) => s + g.rows.length, 0);

  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>كشف ${esc(opts.doctorName)} - ${esc(opts.monthLabel)}</title>
<style>
body{font-family:'Segoe UI',Tahoma,sans-serif;background:#faf8f5;color:#221c14;margin:0;padding:24px}
h1{font-size:20px;margin:0 0 4px}.sub{color:#7a6a55;font-size:13px;margin-bottom:20px}
section{background:#fff;border:1px solid #e6ddcd;border-radius:14px;padding:14px;margin-bottom:18px}
h2{font-size:15px;margin:0 0 10px;color:#8a6a20}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:7px 9px;text-align:right;border-bottom:1px solid #f0e9dc}
thead th{background:#f6f0e4;color:#6b5a42}
tfoot td{background:#fbf3de;font-weight:700;border-top:2px solid #d9b96b}
.mono{font-family:monospace;font-size:12px}.b{font-weight:700}.empty{text-align:center;color:#9a8f7d;padding:18px}
.grand{background:#221c14;color:#f6e7c1;border-radius:14px;padding:14px;font-weight:700;display:flex;justify-content:space-between}
</style></head><body>
<h1>الكشف الشهري — ${esc(opts.doctorName)}</h1>
<div class="sub">${esc(opts.monthLabel)}${branch ? " • " + branch : ""} • مركز زركون CAD/CAM</div>
${tables}
<div class="grand"><span>إجمالي الشهر: ${cases} حالة</span><span>مجموع الأسنان: ${grand} سِنّ</span></div>
</body></html>`;
}

/* ============================================================
 * كشوفات المصمم والفني (شهرية، تجميع كل الأطباء)
 * ============================================================ */

export type StaffReportKey =
  | "designer_pending"
  | "designer_done"
  | "designer_revision"
  | "tech_pending"
  | "tech_temp"
  | "tech_permanent";

export const STAFF_REPORT_LABELS: Record<StaffReportKey, string> = {
  designer_pending: "تصاميم قيد التنفيذ",
  designer_done: "تصاميم مكتملة ومُرسلة",
  designer_revision: "تصاميم بعد التعديل",
  tech_pending: "حالات في انتظار النحت",
  tech_temp: "نحت مؤقت مكتمل",
  tech_permanent: "نحت دائم مكتمل",
};

export const DESIGNER_KEYS: StaffReportKey[] = [
  "designer_pending",
  "designer_done",
  "designer_revision",
];
export const TECHNICIAN_KEYS: StaffReportKey[] = [
  "tech_pending",
  "tech_temp",
  "tech_permanent",
];

export function matchesStaffRow(row: ReportRow, key: StaffReportKey): boolean {
  switch (key) {
    case "designer_pending":
      return !row.design_done;
    case "designer_done":
      return !!row.design_done;
    case "designer_revision":
      return !!row.revision_design_done;
    case "tech_pending":
      return !!row.design_done && !row.fabrication_done;
    case "tech_temp":
      return !!row.fabrication_done;
    case "tech_permanent":
      return !!row.permanent_fabrication_done;
  }
}

/** Self-contained RTL HTML statement for the designer or the technician. */
export function buildStaffReportHtml(opts: {
  staffTitle: string;
  monthLabel: string;
  groups: { key: StaffReportKey; rows: ReportRow[] }[];
  doctorNameOf?: (row: ReportRow) => string;
}): string {
  const esc = (s: unknown) =>
    String(s ?? "").replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
    );
  const docOf = opts.doctorNameOf ?? (() => "");

  const tables = opts.groups
    .map(({ key, rows }) => {
      const total = sumTeeth(rows);
      const body = rows.length
        ? rows
            .map(
              (r, i) => `<tr>
        <td>${i + 1}</td>
        <td>${esc(r.patient_name)}</td>
        <td class="mono">${esc(r.case_code)}</td>
        <td>${esc(docOf(r))}</td>
        <td class="b">${teethOf(r) || "—"}</td>
        <td>${r.created_at ? new Date(r.created_at).toLocaleDateString("ar-EG") : ""}</td>
      </tr>`,
            )
            .join("")
        : `<tr><td colspan="6" class="empty">لا توجد حالات</td></tr>`;
      return `<section>
      <h2>${esc(STAFF_REPORT_LABELS[key])}</h2>
      <table>
        <thead><tr><th>#</th><th>اسم المريض</th><th>رقم الحالة</th><th>الطبيب</th><th>عدد الأسنان</th><th>التاريخ</th></tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><td colspan="4">المجموع — ${rows.length} حالة</td><td colspan="2">${total} سِنّ</td></tr></tfoot>
      </table>
    </section>`;
    })
    .join("");

  const grand = sumTeeth(opts.groups.flatMap((g) => g.rows));
  const cases = opts.groups.reduce((s, g) => s + g.rows.length, 0);

  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>كشف ${esc(opts.staffTitle)} - ${esc(opts.monthLabel)}</title>
<style>
body{font-family:'Segoe UI',Tahoma,sans-serif;background:#faf8f5;color:#221c14;margin:0;padding:24px}
h1{font-size:20px;margin:0 0 4px}.sub{color:#7a6a55;font-size:13px;margin-bottom:20px}
section{background:#fff;border:1px solid #e6ddcd;border-radius:14px;padding:14px;margin-bottom:18px}
h2{font-size:15px;margin:0 0 10px;color:#8a6a20}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{padding:7px 9px;text-align:right;border-bottom:1px solid #f0e9dc}
thead th{background:#f6f0e4;color:#6b5a42}
tfoot td{background:#fbf3de;font-weight:700;border-top:2px solid #d9b96b}
.mono{font-family:monospace;font-size:12px}.b{font-weight:700}.empty{text-align:center;color:#9a8f7d;padding:18px}
.grand{background:#221c14;color:#f6e7c1;border-radius:14px;padding:14px;font-weight:700;display:flex;justify-content:space-between}
</style></head><body>
<h1>الكشف الشهري — ${esc(opts.staffTitle)}</h1>
<div class="sub">${esc(opts.monthLabel)} • مركز زركون CAD/CAM</div>
${tables}
<div class="grand"><span>إجمالي الشهر: ${cases} حالة</span><span>مجموع الأسنان: ${grand} سِنّ</span></div>
</body></html>`;
}
