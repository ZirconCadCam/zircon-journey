import { useEffect, useMemo, useState } from "react";
import { DoctorAvatar } from "@/components/doctor-avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2, User, Stethoscope, Calendar, Hash, ClipboardList, Archive,
  RotateCcw, Download, Search, FileArchive, FileText, Filter, FileDown,
} from "lucide-react";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableFooter,
} from "@/components/ui/table";
import { getSignedUrl } from "@/lib/chat";
import { fileManagerSupported } from "@/lib/file-manager";
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
  shade: string | null;
  created_at: string;
  design_done: boolean | null;
  design_file_sent: boolean | null;
  final_archived?: boolean | null;
  revision_design_file_path?: string | null;
  revision_design_file_name?: string | null;
}

/** A completed design = the designer sent the .rar file for the case. */
const isCompleted = (c: Case) => !!c.design_file_sent;

function branchLabel(b: string | null | undefined) {
  return b === "sanaa" ? "صنعاء" : b === "ibb" ? "إب" : "—";
}

function teethCount(c: Case): number {
  const n = Number((c.teeth_count || "").replace(/[^\d]/g, ""));
  if (!Number.isNaN(n) && n > 0) return n;
  if (c.tooth_number) return c.tooth_number.split(/[,\s]+/).filter(Boolean).length;
  return 0;
}

async function resolveUrl(path: string): Promise<string | null> {
  if (/^https?:\/\//i.test(path)) return path;
  return await getSignedUrl(path, 3600);
}

async function downloadFile(path: string, fileName: string) {
  const url = await resolveUrl(path);
  if (!url) { toast.error("تعذر الوصول للملف"); return; }
  try {
    const { transferDownload } = await import("@/lib/transfer-manager");
    await transferDownload({ url, filename: fileName, saveToCenter: fileManagerSupported() });
  } catch (e: any) {
    toast.error(e.message || "تعذر تنزيل الملف");
  }
}

/* ------------------------------------------------------------------ */
/* Shared data hook                                                    */
/* ------------------------------------------------------------------ */
function useDesignerData() {
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
    const ch = supabase.channel("designer-panels-stream")
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

/* ================================================================== */
/* 1) Archive                                                          */
/* ================================================================== */
export function DesignerArchive() {
  const { cases, doctorMap, loading } = useDesignerData();
  const [busyId, setBusyId] = useState<string | null>(null);

  const archived = useMemo(
    () => cases.filter(isCompleted).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    ),
    [cases],
  );

  async function restore(c: Case) {
    if (!confirm(`استعادة ملف المريض ${c.patient_name}؟ سيعود إلى قائمة الحالات النشطة.`)) return;
    setBusyId(c.id);
    const { error } = await supabase.from("slot_cases")
      .update({ design_done: false, design_file_sent: false }).eq("id", c.id);
    setBusyId(null);
    if (error) { toast.error("تعذرت الاستعادة"); return; }
    toast.success("تمت استعادة ملف المريض إلى القائمة النشطة");
  }

  if (loading) return <LoadingBox />;

  return (
    <section className="space-y-4">
      <div className="text-sm text-muted-foreground">
        المرضى المكتمل تصميم حالاتهم: <span className="font-bold text-foreground">{archived.length}</span>
      </div>
      {archived.length === 0 ? (
        <div className="rounded-2xl bg-card border border-border p-12 text-center text-muted-foreground shadow-luxury">
          <Archive className="size-10 mx-auto mb-3 opacity-40" />
          لا توجد حالات مؤرشفة
        </div>
      ) : (
        <ul className="space-y-3">
          {archived.map(c => {
            const doctor = doctorMap.get(c.doctor_slot);
            const busy = busyId === c.id;
            return (
              <li key={c.id} className="rounded-2xl bg-card border border-border p-5 shadow-luxury hover:border-gold/60 transition">
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs rounded-md bg-muted px-2 py-0.5 font-bold">{c.case_code}</span>
                      <span className="text-[11px] rounded-full bg-emerald-600 text-white px-2 py-0.5 font-bold">تم التصميم</span>
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Calendar className="size-3" /> {new Date(c.created_at).toLocaleDateString("ar-EG")}
                      </span>
                    </div>
                    <div className="mt-2 font-extrabold text-lg flex items-center gap-2">
                      <User className="size-4 text-gold" /> {c.patient_name}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                      <DoctorAvatar name={doctor?.name} className="size-6" />
                      <span>{doctor?.name ?? `Slot ${c.doctor_slot}`}</span>
                      {doctor?.branch && <> • {branchLabel(doctor.branch)}</>}
                    </div>
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                      {c.case_type && <Info icon={<ClipboardList className="size-3" />} label="النوع" value={c.case_type} />}
                      <Info icon={<Hash className="size-3" />} label="عدد الأسنان" value={String(teethCount(c) || "—")} />
                      {c.tooth_number && <Info icon={<Hash className="size-3" />} label="السن" value={c.tooth_number} />}
                    </div>
                  </div>
                  <button
                    onClick={() => restore(c)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gold/60 bg-gold/10 px-3 py-2 text-xs font-bold hover:gradient-gold hover:text-gold-foreground transition disabled:opacity-60 shrink-0"
                    title="إعادة ملف المريض إلى القائمة النشطة"
                  >
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                    استعادة ملف المريض
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ================================================================== */
/* 2) Design Files (.rar)                                              */
/* ================================================================== */
interface DesignFile {
  id: string;
  fileName: string;
  path: string;
  size: number | null;
  patientName: string;
  doctorName: string;
  date: string;
}

export function DesignerDesignFiles() {
  const { cases, doctorMap, loading } = useDesignerData();
  const [files, setFiles] = useState<DesignFile[]>([]);
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
        .select("id, attachment_path, attachment_name, attachment_size, content, created_at, sender, message_type")
        .eq("sender", "designer").eq("message_type", "file")
        .order("created_at", { ascending: false }).limit(500);

      const list: DesignFile[] = [];
      const seen = new Set<string>();

      for (const m of (msgs ?? []) as any[]) {
        if (!m.attachment_path || !/\.rar$/i.test(m.attachment_name || "")) continue;
        const code = ((m.content || "").match(/ZJ-\d{6}-[a-z0-9]{4}/i) || [])[0];
        const c = code ? caseByCode.get(code) : undefined;
        const doctor = c ? doctorMap.get(c.doctor_slot) : undefined;
        seen.add(m.attachment_path);
        list.push({
          id: m.id,
          fileName: m.attachment_name,
          path: m.attachment_path,
          size: m.attachment_size ?? null,
          patientName: c?.patient_name ?? "غير محدد",
          doctorName: doctor?.name ?? "—",
          date: m.created_at,
        });
      }

      // Include revision design files attached directly on the case row.
      for (const c of cases) {
        if (!c.revision_design_file_path || seen.has(c.revision_design_file_path)) continue;
        const doctor = doctorMap.get(c.doctor_slot);
        list.push({
          id: `rev-${c.id}`,
          fileName: c.revision_design_file_name || `${c.case_code}.rar`,
          path: c.revision_design_file_path,
          size: null,
          patientName: c.patient_name,
          doctorName: doctor?.name ?? "—",
          date: c.created_at,
        });
      }

      if (active) { setFiles(list); setLoadingFiles(false); }
    })();
    return () => { active = false; };
  }, [loading, cases, caseByCode, doctorMap]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return files;
    return files.filter(f => f.patientName.toLowerCase().includes(q));
  }, [files, query]);

  async function onDownload(f: DesignFile) {
    setBusy(f.id);
    const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "_").trim();
    await downloadFile(f.path, safe(f.fileName.endsWith(".rar") ? f.fileName : `${f.patientName}.rar`));
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
        ملفات التصميم (RAR): <span className="font-bold text-foreground">{filtered.length}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-card border border-border p-12 text-center text-muted-foreground shadow-luxury">
          <FileArchive className="size-10 mx-auto mb-3 opacity-40" />
          {query ? "لا توجد نتائج مطابقة" : "لا توجد ملفات تصميم"}
        </div>
      ) : (
        <ul className="space-y-2.5">
          {filtered.map(f => (
            <li key={f.id} className="rounded-xl bg-card border border-border p-4 shadow-luxury hover:border-gold/60 transition flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1 flex items-center gap-3">
                <div className="size-10 rounded-lg gradient-gold grid place-items-center shrink-0">
                  <FileArchive className="size-5 text-gold-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm flex items-center gap-2">
                    <User className="size-3.5 text-gold" /> {f.patientName}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">{f.fileName}</div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                    <span className="flex items-center gap-1"><DoctorAvatar name={f.doctorName} className="size-5" /> {f.doctorName}</span>
                    <span className="flex items-center gap-1"><Calendar className="size-3" /> {new Date(f.date).toLocaleDateString("ar-EG")}</span>
                    {f.size && <span>{(f.size / 1024 / 1024).toFixed(1)} MB</span>}
                  </div>
                </div>
              </div>
              <button
                onClick={() => onDownload(f)}
                disabled={busy === f.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gold/60 bg-gold/10 px-3 py-2 text-xs font-bold hover:gradient-gold hover:text-gold-foreground transition disabled:opacity-60 shrink-0"
              >
                {busy === f.id ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                تحميل
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ================================================================== */
/* 3) Reports                                                          */
/* ================================================================== */
function esc(s: string) {
  return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
}

function exportTablePDF(title: string, rows: Case[], doctorMap: Map<number, Doctor>, rangeLabel: string) {
  const totalTeeth = rows.reduce((s, c) => s + teethCount(c), 0);
  const body = rows.map(c => `
    <tr>
      <td>${esc(c.patient_name)}</td>
      <td>${esc(doctorMap.get(c.doctor_slot)?.name ?? `Slot ${c.doctor_slot}`)}</td>
      <td>${esc(c.case_type || "—")}</td>
      <td>${teethCount(c) || "—"}</td>
      <td>${new Date(c.created_at).toLocaleDateString("ar-EG")}</td>
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
      <th>اسم المريض</th><th>الدكتور</th><th>نوع المعالجة</th><th>عدد الأسنان</th><th>التاريخ</th>
    </tr></thead>
    <tbody>${body || `<tr><td colspan="5" style="text-align:center">لا توجد حالات</td></tr>`}</tbody>
    <tfoot><tr>
      <td colspan="3">الإجماليات</td>
      <td>إجمالي الأسنان: ${totalTeeth}</td>
      <td>إجمالي المرضى: ${rows.length}</td>
    </tr></tfoot>
  </table>
  </body></html>`;

  printHtmlDocument(html, title);
}

export function DesignerReports() {
  const { doctors, cases, doctorMap, loading } = useDesignerData();
  const [selectedSlot, setSelectedSlot] = useState<number | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const base = useMemo(
    () => cases.filter(isCompleted).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    ),
    [cases],
  );

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

  return (
    <section className="space-y-5">
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
        title={`الكشف الأول — حالات مكتملة (${selectedSlot === "" ? "اختر دكتوراً" : doctorMap.get(selectedSlot as number)?.name ?? ""})`}
        rows={doctorRows}
        doctorMap={doctorMap}
        rangeLabel={rangeLabel}
        emptyHint={selectedSlot === "" ? "اختر دكتوراً من قائمة التصفية لعرض حالاته" : "لا توجد حالات لهذا الدكتور ضمن النطاق"}
      />

      {/* Report 2: general */}
      <ReportTable
        title="الكشف العام — حالات مكتملة (جميع الدكاترة)"
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
            <TableHead className="text-right">التاريخ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">{emptyHint ?? "لا توجد حالات"}</TableCell>
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
              <TableCell>{new Date(c.created_at).toLocaleDateString("ar-EG")}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={3} className="font-bold text-gold">الإجماليات</TableCell>
            <TableCell className="font-extrabold">إجمالي الأسنان: {totalTeeth}</TableCell>
            <TableCell className="font-extrabold">إجمالي المرضى: {totalPatients}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-muted/40 rounded-lg px-2 py-1.5">
      <span className="text-gold">{icon}</span>
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-bold truncate">{value}</span>
    </div>
  );
}
