import { useEffect, useMemo, useState } from "react";
import { DoctorAvatar } from "@/components/doctor-avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2, User, Stethoscope, Calendar, Search, FileArchive, FileText,
  Download, FileDown, Filter, PackageCheck, Send,
} from "lucide-react";
import { queueTelegram } from "@/lib/telegram-outbox";

import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableFooter,
} from "@/components/ui/table";
import { getSignedUrl } from "@/lib/chat";
import { deriveStageKey } from "@/lib/case-stages";
import { fileManagerSupported, openCachedFile } from "@/lib/file-manager";
import { transferDownload } from "@/lib/transfer-manager";
import type { CaseFileLocation } from "@/lib/case-folders";
import { printHtmlDocument } from "@/lib/print-report";

interface Doctor { slot: number; name: string; branch: string | null }
interface Case {
  id: string;
  case_code: string;
  doctor_slot: number;
  patient_name: string;
  tooth_number: string | null;
  teeth_count: string | null;
  case_type: string | null;
  created_at: string;
  fabrication_done: boolean | null;
  temporary_delivered: boolean | null;
  shipped_to_doctor: boolean | null;
  tech_data_sent_to_secretary: boolean | null;
  doctor_decision: string | null;
  permanent_fabrication_done: boolean | null;
  final_archived: boolean | null;
  revision_design_file_path?: string | null;
  revision_design_file_name?: string | null;
  [k: string]: any;
}

function branchLabel(b: string | null | undefined) {
  return b === "sanaa" ? "صنعاء" : b === "ibb" ? "إب" : "—";
}

function teethCount(c: Case): number {
  const n = Number((c.teeth_count || "").replace(/[^\d]/g, ""));
  if (!Number.isNaN(n) && n > 0) return n;
  if (c.tooth_number) return c.tooth_number.split(/[,\s]+/).filter(Boolean).length;
  return 0;
}

/** Temporary carved but zircon (permanent) not yet carved, and not archived. */
function isPendingZircon(c: Case): boolean {
  if (c.final_archived) return false;
  if (c.permanent_fabrication_done) return false;
  const tempCarved =
    !!c.fabrication_done || !!c.temporary_delivered || !!c.shipped_to_doctor ||
    !!c.tech_data_sent_to_secretary ||
    deriveStageKey(c) === "doctor_review" || c.doctor_decision === "approved";
  return tempCarved;
}

/** Cycle finished — completed / archived. */
function isCompletedZircon(c: Case): boolean {
  return !!c.final_archived;
}

async function resolveUrl(path: string): Promise<string | null> {
  if (/^https?:\/\//i.test(path)) return path;
  return await getSignedUrl(path, 3600);
}

/* ------------------------------------------------------------------ */
/* Shared data hook                                                    */
/* ------------------------------------------------------------------ */
function useTechnicianData() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [{ data: docs }, { data: cs }] = await Promise.all([
        supabase.from("doctor_profiles").select("slot,name,branch,active").order("slot"),
        supabase.from("slot_cases").select("*").order("created_at", { ascending: false }),
      ]);
      setDoctors((docs ?? []) as Doctor[]);
      setCases((cs ?? []) as Case[]);
      setLoading(false);
    };
    load();
    const ch = supabase.channel("technician-panels-stream")
      .on("postgres_changes", { event: "*", schema: "public", table: "slot_cases" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const doctorMap = useMemo(() => {
    const m = new Map<number, Doctor>();
    doctors.forEach(d => m.set(d.slot, d));
    return m;
  }, [doctors]);

  return { doctors, cases, doctorMap, loading };
}

function LoadingBox() {
  return (
    <div className="rounded-2xl bg-card border border-border p-12 text-center text-muted-foreground shadow-luxury">
      <Loader2 className="size-6 animate-spin mx-auto mb-2" /> جارِ التحميل…
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* PDF export (print-to-PDF, Arabic-safe)                              */
/* ------------------------------------------------------------------ */
function exportTablePDF(title: string, rows: Case[], doctorMap: Map<number, Doctor>, rangeLabel: string) {
  const totalTeeth = rows.reduce((s, c) => s + teethCount(c), 0);
  const body = rows.map(c => `
    <tr>
      <td>${esc(c.patient_name)}</td>
      <td>${esc(doctorMap.get(c.doctor_slot)?.name ?? `Slot ${c.doctor_slot}`)}</td>
      <td>${esc(c.case_type || "—")}</td>
      <td>${teethCount(c) || "—"}</td>
      <td>1</td>
      <td>${new Date(c.created_at).toLocaleDateString("ar-EG")}</td>
      <td>${branchLabel(doctorMap.get(c.doctor_slot)?.branch)}</td>
    </tr>`).join("");

  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
  <title>${esc(title)}</title>
  <style>
    body{font-family:'Segoe UI',Tahoma,sans-serif;padding:24px;color:#1a1a1a}
    h1{font-size:18px;margin:0 0 4px}
    .sub{color:#666;font-size:12px;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th,td{border:1px solid #ccc;padding:6px 8px;text-align:right}
    thead th{background:#c9a84c;color:#1a1a1a}
    tfoot td{font-weight:bold;background:#f3f0e8}
  </style></head><body>
  <h1>${esc(title)}</h1>
  <div class="sub">${esc(rangeLabel)} — تاريخ الطباعة: ${new Date().toLocaleDateString("ar-EG")}</div>
  <table>
    <thead><tr>
      <th>اسم المريض</th><th>الدكتور</th><th>نوع المعالجة</th>
      <th>عدد الأسنان</th><th>عدد الحالات</th><th>التاريخ</th><th>الفرع</th>
    </tr></thead>
    <tbody>${body || `<tr><td colspan="7" style="text-align:center">لا توجد حالات</td></tr>`}</tbody>
    <tfoot><tr>
      <td colspan="3">الإجماليات</td>
      <td>إجمالي الأسنان: ${totalTeeth}</td>
      <td colspan="3">إجمالي المرضى: ${rows.length}</td>
    </tr></tfoot>
  </table>
  </body></html>`;

  printHtmlDocument(html, title);
}

function esc(s: string) {
  return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
}

/* ================================================================== */
/* 1) Reports                                                          */
/* ================================================================== */
export function TechnicianReports() {
  const { doctors, cases, doctorMap, loading } = useTechnicianData();
  const [reportType, setReportType] = useState<"pending" | "completed">("pending");
  const [selectedSlot, setSelectedSlot] = useState<number | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const base = useMemo(() => {
    const f = reportType === "pending" ? isPendingZircon : isCompletedZircon;
    return cases.filter(f);
  }, [cases, reportType]);

  const dateFiltered = useMemo(() => {
    const fromT = from ? new Date(from + "T00:00:00").getTime() : -Infinity;
    const toT = to ? new Date(to + "T23:59:59").getTime() : Infinity;
    return base.filter(c => {
      const t = new Date(c.created_at).getTime();
      return t >= fromT && t <= toT;
    });
  }, [base, from, to]);

  const doctorRows = useMemo(
    () => selectedSlot === "" ? [] : dateFiltered.filter(c => c.doctor_slot === selectedSlot),
    [dateFiltered, selectedSlot],
  );

  const rangeLabel = (from || to)
    ? `النطاق: ${from ? new Date(from).toLocaleDateString("ar-EG") : "البداية"} ← ${to ? new Date(to).toLocaleDateString("ar-EG") : "الآن"}`
    : "النطاق: كل التواريخ";

  if (loading) return <LoadingBox />;

  const typeLabel = reportType === "pending" ? "حالات الزركون المعلقة" : "الزركون المكتمل";

  return (
    <section className="space-y-5">
      {/* Report-type switch */}
      <div className="inline-flex flex-wrap rounded-xl border border-border bg-card p-1 shadow-luxury">
        <button onClick={() => setReportType("pending")}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition ${reportType === "pending" ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"}`}>
          كشف حالات الزركون المعلقة
        </button>
        <button onClick={() => setReportType("completed")}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition ${reportType === "completed" ? "gradient-gold text-gold-foreground shadow-gold" : "hover:bg-muted/40"}`}>
          كشف الزركون المكتمل
        </button>
      </div>

      {/* Filters */}
      <div className="rounded-2xl bg-card border border-border p-4 shadow-luxury flex flex-wrap items-end gap-4">
        <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
          <Filter className="size-4 text-gold" /> التصفية
        </div>
        <label className="text-xs font-bold flex flex-col gap-1">
          من تاريخ
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-gold" />
        </label>
        <label className="text-xs font-bold flex flex-col gap-1">
          إلى تاريخ
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-gold" />
        </label>
        <label className="text-xs font-bold flex flex-col gap-1">
          الدكتور (للكشف الأول)
          <select value={selectedSlot} onChange={e => setSelectedSlot(e.target.value === "" ? "" : Number(e.target.value))}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-gold min-w-[180px]">
            <option value="">— اختر دكتور —</option>
            {doctors.map(d => <option key={d.slot} value={d.slot}>{d.name} ({branchLabel(d.branch)})</option>)}
          </select>
        </label>
        {(from || to) && (
          <button onClick={() => { setFrom(""); setTo(""); }}
            className="rounded-lg border border-border px-3 py-2 text-xs font-bold hover:bg-muted/40 transition">
            مسح التواريخ
          </button>
        )}
      </div>

      {/* Report 1: by selected doctor */}
      <ReportTable
        title={`الكشف الأول — ${typeLabel} (${selectedSlot === "" ? "اختر دكتوراً" : doctorMap.get(selectedSlot as number)?.name ?? ""})`}
        rows={doctorRows}
        doctorMap={doctorMap}
        rangeLabel={rangeLabel}
        emptyHint={selectedSlot === "" ? "اختر دكتوراً من قائمة التصفية لعرض حالاته" : "لا توجد حالات لهذا الدكتور ضمن النطاق"}
      />

      {/* Report 2: general */}
      <ReportTable
        title={`الكشف العام — ${typeLabel} (جميع الدكاترة)`}
        rows={dateFiltered}
        doctorMap={doctorMap}
        rangeLabel={rangeLabel}
      />
    </section>
  );
}

function ReportTable({
  title, rows, doctorMap, rangeLabel, emptyHint,
}: {
  title: string; rows: Case[]; doctorMap: Map<number, Doctor>; rangeLabel: string; emptyHint?: string;
}) {
  const totalTeeth = rows.reduce((s, c) => s + teethCount(c), 0);
  const totalPatients = rows.length;
  return (
    <div className="rounded-2xl bg-card border border-border overflow-hidden shadow-luxury">
      <div className="p-4 border-b border-border font-bold text-sm flex items-center gap-2 flex-wrap">
        <FileText className="size-4 text-gold" /> {title}
        <span className="text-[11px] rounded-full bg-muted px-2 py-0.5 font-bold">{totalPatients} حالة</span>
        <button
          onClick={() => exportTablePDF(title, rows, doctorMap, rangeLabel)}
          disabled={rows.length === 0}
          className="mr-auto inline-flex items-center gap-1.5 rounded-lg border border-gold/60 bg-gold/10 px-3 py-1.5 text-xs font-bold hover:gradient-gold hover:text-gold-foreground transition disabled:opacity-50"
        >
          <FileDown className="size-3.5" /> تصدير PDF
        </button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">اسم المريض</TableHead>
            <TableHead className="text-right">الدكتور</TableHead>
            <TableHead className="text-right">نوع المعالجة</TableHead>
            <TableHead className="text-right">عدد الأسنان</TableHead>
            <TableHead className="text-right">عدد الحالات</TableHead>
            <TableHead className="text-right">التاريخ</TableHead>
            <TableHead className="text-right">الفرع</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                {emptyHint ?? "لا توجد حالات"}
              </TableCell>
            </TableRow>
          ) : rows.map(c => (
            <TableRow key={c.id}>
              <TableCell className="font-bold">{c.patient_name}</TableCell>
              <TableCell className="flex items-center gap-1.5">
                <DoctorAvatar name={doctorMap.get(c.doctor_slot)?.name} className="size-6" />
                {doctorMap.get(c.doctor_slot)?.name ?? `Slot ${c.doctor_slot}`}
              </TableCell>
              <TableCell>{c.case_type || "—"}</TableCell>
              <TableCell>{teethCount(c) || "—"}</TableCell>
              <TableCell>1</TableCell>
              <TableCell>{new Date(c.created_at).toLocaleDateString("ar-EG")}</TableCell>
              <TableCell>{branchLabel(doctorMap.get(c.doctor_slot)?.branch)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={3} className="font-bold text-gold">الإجماليات</TableCell>
            <TableCell className="font-extrabold">إجمالي الأسنان: {totalTeeth}</TableCell>
            <TableCell colSpan={3} className="font-extrabold">إجمالي المرضى: {totalPatients}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

/* ================================================================== */
/* 2) Design Files (.rar) grouped per patient                         */
/* ================================================================== */
interface RarFile { id: string; fileName: string; path: string; size: number | null; label: string; }
interface PatientFolder {
  key: string;
  patientName: string;
  doctorName: string;
  date: string;
  files: RarFile[];
}

export function TechnicianDesignFiles() {
  const { cases, doctorMap, loading } = useTechnicianData();
  const [folders, setFolders] = useState<PatientFolder[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const caseByCode = useMemo(() => {
    const m = new Map<string, Case>();
    cases.forEach(c => m.set(c.case_code, c));
    return m;
  }, [cases]);

  useEffect(() => {
    if (loading) return;
    let active = true;
    (async () => {
      setLoadingFiles(true);
      const { data: msgs } = await supabase.from("chat_messages")
        .select("id, attachment_path, attachment_name, attachment_size, content, created_at, message_type")
        .eq("message_type", "file")
        .order("created_at", { ascending: false }).limit(800);

      // group: case_code -> folder
      const map = new Map<string, PatientFolder>();
      const seen = new Set<string>();

      const ensure = (c: Case | undefined, fallbackName: string) => {
        const code = c?.case_code ?? fallbackName;
        if (!map.has(code)) {
          const doctor = c ? doctorMap.get(c.doctor_slot) : undefined;
          map.set(code, {
            key: code,
            patientName: c?.patient_name ?? "غير محدد",
            doctorName: doctor?.name ?? "—",
            date: c?.created_at ?? new Date().toISOString(),
            files: [],
          });
        }
        return map.get(code)!;
      };

      for (const m of (msgs ?? []) as any[]) {
        if (!m.attachment_path || !/\.rar$/i.test(m.attachment_name || "")) continue;
        if (seen.has(m.attachment_path)) continue;
        seen.add(m.attachment_path);
        const code = ((m.content || "").match(/ZJ-\d{6}-[a-z0-9]{4}/i) || [])[0];
        const c = code ? caseByCode.get(code) : undefined;
        const folder = ensure(c, code || m.attachment_name);
        const isRevision = /تعديل|revision/i.test(m.content || "");
        folder.files.push({
          id: m.id,
          fileName: m.attachment_name,
          path: m.attachment_path,
          size: m.attachment_size ?? null,
          label: isRevision ? "بعد التعديل" : "قبل التعديل",
        });
      }

      // revision design files attached on the case row
      for (const c of cases) {
        if (!c.revision_design_file_path || seen.has(c.revision_design_file_path)) continue;
        seen.add(c.revision_design_file_path);
        const folder = ensure(c, c.case_code);
        folder.files.push({
          id: `rev-${c.id}`,
          fileName: c.revision_design_file_name || `${c.case_code}.rar`,
          path: c.revision_design_file_path,
          size: null,
          label: "بعد التعديل",
        });
      }

      const list = Array.from(map.values())
        .filter(f => f.files.length > 0)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (active) { setFolders(list); setLoadingFiles(false); }
    })();
    return () => { active = false; };
  }, [loading, cases, caseByCode, doctorMap]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return folders;
    return folders.filter(f => f.patientName.toLowerCase().includes(q));
  }, [folders, query]);

  async function onDownload(f: PatientFolder, file: RarFile) {
    setBusy(file.id);
    const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "_").trim();
    const name = file.fileName.endsWith(".rar")
      ? `${safe(f.patientName)} - ${file.label}.rar`
      : `${safe(f.patientName)}.rar`;
    // Device location for the technician (role/doctor/case folder taxonomy).
    const loc: CaseFileLocation = {
      role: "technician",
      doctorName: f.doctorName,
      caseCode: f.key,
    };
    const mime = "application/x-rar-compressed";
    try {
      // 1) If this RAR was already saved to the device file manager, open it
      //    directly from its stored path (no re-download).
      const opened = await openCachedFile(name, loc, mime, "ملفات");
      if (opened) {
        toast.success("تم فتح الملف من مدير ملفات الجهاز");
        setBusy(null);
        return;
      }
      // 2) Otherwise download once, auto-save into the device file manager and
      //    remember its path for next time.
      const url = await resolveUrl(file.path);
      if (!url) { toast.error("تعذر الوصول للملف"); setBusy(null); return; }
      await transferDownload({
        url,
        filename: name,
        mime,
        saveToCenter: fileManagerSupported(),
        subfolder: "ملفات",
        location: loc,
      });
    } catch (e: any) {
      toast.error(e?.message || "تعذر تنزيل الملف");
    }
    setBusy(null);
  }

  if (loading || loadingFiles) return <LoadingBox />;

  return (
    <section className="space-y-4">
      <div className="relative">
        <Search className="size-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="🔎 بحث ذكي باسم المريض…"
          className="w-full rounded-xl border border-input bg-background pr-10 pl-4 py-2.5 text-sm outline-none focus:border-gold"
        />
      </div>

      <div className="text-sm text-muted-foreground">
        ملفات تصميم المرضى: <span className="font-bold text-foreground">{filtered.length}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-card border border-border p-12 text-center text-muted-foreground shadow-luxury">
          <FileArchive className="size-10 mx-auto mb-3 opacity-40" />
          {query ? "لا توجد نتائج مطابقة" : "لا توجد ملفات تصميم"}
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map(f => (
            <li key={f.key} className="rounded-2xl bg-card border border-border p-5 shadow-luxury hover:border-gold/60 transition">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="size-11 rounded-xl gradient-gold grid place-items-center shrink-0">
                  <FileArchive className="size-5 text-gold-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="font-extrabold text-base flex items-center gap-2">
                    <User className="size-4 text-gold" /> {f.patientName}
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-3 mt-0.5">
                    <span className="flex items-center gap-1"><DoctorAvatar name={f.doctorName} className="size-5" /> {f.doctorName}</span>
                    <span className="flex items-center gap-1"><Calendar className="size-3" /> {new Date(f.date).toLocaleDateString("ar-EG")}</span>
                    <span>{f.files.length} ملف</span>
                  </div>
                </div>
              </div>
              <ul className="mt-3 space-y-2 pr-2 border-r-2 border-gold/30">
                {f.files.map(file => (
                  <li key={file.id} className="flex items-center justify-between gap-3 flex-wrap rounded-lg bg-muted/40 px-3 py-2">
                    <div className="min-w-0 flex items-center gap-2">
                      <span className={`text-[10px] rounded-full px-2 py-0.5 font-bold ${file.label === "بعد التعديل" ? "bg-amber-600 text-white" : "bg-emerald-600 text-white"}`}>
                        {file.label}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">{file.fileName}</span>
                      {file.size && <span className="text-[11px] text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</span>}
                    </div>
                    <button
                      onClick={() => onDownload(f, file)}
                      disabled={busy === file.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gold/60 bg-gold/10 px-3 py-1.5 text-xs font-bold hover:gradient-gold hover:text-gold-foreground transition disabled:opacity-60 shrink-0"
                    >
                      {busy === file.id ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                      تحميل
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ================================================================== */
/* 3) Ready zircon list (تم نحت الزركون الدائم)                        */
/* ================================================================== */
export function TechnicianReadyZircon() {
  const { cases, doctorMap, loading } = useTechnicianData();
  const [sending, setSending] = useState(false);

  const rows = useMemo(
    () =>
      cases
        .filter((c) => !!c.permanent_fabrication_done && !c.ready_zircon_sent_at)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [cases],
  );

  const totalTeeth = rows.reduce((s, c) => s + teethCount(c), 0);

  async function sendToTelegram() {
    if (rows.length === 0) return;
    setSending(true);
    try {
      const lines = rows.map(
        (c, i) =>
          `${i + 1}. ${c.patient_name} — ${branchLabel(doctorMap.get(c.doctor_slot)?.branch)} — ${teethCount(c) || "—"} سِنّ`,
      );
      const caption = [
        "🦷 كشف الزركون الجاهز",
        `التاريخ: ${new Date().toLocaleDateString("ar-EG")}`,
        "",
        ...lines,
        "",
        `إجمالي المرضى: ${rows.length}`,
        `إجمالي الأسنان: ${totalTeeth}`,
      ].join("\n");

      // Only clear the list when the message really entered the outbox queue,
      // otherwise the finished cases would disappear without ever being sent.
      const queued = await queueTelegram(caption);
      if (!queued) {
        setSending(false);
        return;
      }

      const now = new Date().toISOString();
      const { error } = await supabase
        .from("slot_cases")
        .update({ ready_zircon_sent_at: now })
        .in("id", rows.map((c) => c.id));
      if (error) throw error;

      toast.success("تم إرسال الكشف إلى جروب تلجرام وبدأ كشف جديد");
    } catch (e: any) {
      toast.error(e?.message || "تعذر إرسال الكشف");
    }
    setSending(false);
  }

  if (loading) return <LoadingBox />;

  return (
    <section className="space-y-4">
      <div className="rounded-2xl bg-card border border-border overflow-hidden shadow-luxury">
        <div className="p-4 border-b border-border font-bold text-sm flex items-center gap-2 flex-wrap">
          <PackageCheck className="size-4 text-gold" /> كشف الزركون الجاهز
          <span className="text-[11px] rounded-full bg-muted px-2 py-0.5 font-bold">{rows.length} حالة</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">اسم المريض</TableHead>
              <TableHead className="text-right">الفرع</TableHead>
              <TableHead className="text-right">عدد الأسنان</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                  لا توجد حالات زركون جاهزة حالياً
                </TableCell>
              </TableRow>
            ) : (
              rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-bold">{c.patient_name}</TableCell>
                  <TableCell>{branchLabel(doctorMap.get(c.doctor_slot)?.branch)}</TableCell>
                  <TableCell>{teethCount(c) || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-bold text-gold">الإجماليات</TableCell>
              <TableCell className="font-extrabold">المرضى: {rows.length}</TableCell>
              <TableCell className="font-extrabold">الأسنان: {totalTeeth}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      <button
        onClick={sendToTelegram}
        disabled={sending || rows.length === 0}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-gold/60 bg-gold/10 px-5 py-3 text-sm font-extrabold hover:gradient-gold hover:text-gold-foreground transition disabled:opacity-50"
      >
        {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        إرسال الكشف إلى جروب تلجرام
      </button>
    </section>
  );
}
