import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Download, Calendar as CalendarIcon, Clock, Wrench, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { getStage, deriveStageKey } from "@/lib/case-stages";
import { teethOf as teethOfRow } from "@/lib/report-build";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

type ReportKey = "pending" | "uninstalled" | "completed";

interface Row {
  id: string;
  case_code: string;
  patient_name: string;
  created_at: string;
  updated_at: string;
  [k: string]: any;
}

const REPORTS: { key: ReportKey; label: string; icon: any; desc: string }[] = [
  { key: "pending",     label: "حالات الزركون المعلقة",   icon: Clock,         desc: "تم نحت المؤقت ولم يكتمل نحت الدائم" },
  { key: "uninstalled", label: "حالات الزركون غير المركبة", icon: Wrench,        desc: "تم نحت الدائم ولم يتم التركيب" },
  { key: "completed",   label: "الزركون المكتمل",          icon: CheckCircle2,  desc: "حالات تم تركيبها للمريض" },
];

function inRange(iso: string, from: string, to: string): boolean {
  if (!from && !to) return true;
  const t = new Date(iso).getTime();
  if (from && t < new Date(from + "T00:00:00").getTime()) return false;
  if (to && t > new Date(to + "T23:59:59").getTime()) return false;
  return true;
}

function matchesReport(row: Row, key: ReportKey): boolean {
  const stage = deriveStageKey(row as any);
  if (key === "completed") return stage === "installed" || stage === "final_archived" || !!row.permanent_installed_by_doctor;
  if (key === "uninstalled") {
    // permanent fabricated, not yet installed
    const fabricated = !!row.permanent_fabrication_done;
    const installed = !!row.permanent_installed_by_doctor || stage === "installed" || stage === "final_archived";
    return fabricated && !installed;
  }
  // pending: temp carved, but permanent not yet carved
  const tempCarved =
    !!row.fabrication_done ||
    !!row.tech_data_sent_to_secretary ||
    !!row.shipped_to_doctor ||
    !!row.temporary_delivered ||
    row.doctor_decision === "approved" ||
    row.doctor_decision === "revision" ||
    !!row.revision_design_done ||
    !!row.revision_approved_by_tech;
  const permCarved = !!row.permanent_fabrication_done;
  return tempCarved && !permCarved;
}

export function DoctorReportsPanel({ doctor }: { doctor: { slot: number; name: string; branch: string | null } }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<ReportKey>("pending");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const tableRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("slot_cases").select("*")
      .eq("doctor_slot", doctor.slot)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data as Row[]) ?? []);
    setLoading(false);
  }, [doctor.slot]);

  useEffect(() => {
    load();
    // Live updates removed to save database usage — data loads on open.
  }, [doctor.slot, load]);

  const filtered = useMemo(() => {
    return rows.filter(r => matchesReport(r, active) && inRange(r.created_at, from, to));
  }, [rows, active, from, to]);

  const teethOf = (r: Row): number => teethOfRow(r);

  const totalTeeth = useMemo(() => filtered.reduce((s, r) => s + teethOf(r), 0), [filtered]);

  const counts = useMemo(() => ({
    pending:     rows.filter(r => matchesReport(r, "pending")).length,
    uninstalled: rows.filter(r => matchesReport(r, "uninstalled")).length,
    completed:   rows.filter(r => matchesReport(r, "completed")).length,
  }), [rows]);

  async function exportPdf() {
    if (!tableRef.current) return;
    if (filtered.length === 0) { toast.error("لا توجد بيانات للتصدير"); return; }
    const node = tableRef.current;
    try {
      toast.info("جارٍ إنشاء PDF...");
      const canvas = await html2canvas(node, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const imgW = pageW - margin * 2;
      const imgH = (canvas.height * imgW) / canvas.width;
      let heightLeft = imgH;
      let y = margin;
      pdf.addImage(img, "PNG", margin, y, imgW, imgH);
      heightLeft -= (pageH - margin * 2);
      while (heightLeft > 0) {
        pdf.addPage();
        y = margin - (imgH - heightLeft);
        pdf.addImage(img, "PNG", margin, y, imgW, imgH);
        heightLeft -= (pageH - margin * 2);
      }
      const reportLabel = REPORTS.find(r => r.key === active)?.label || "كشف";
      const stamp = new Date().toISOString().slice(0, 10);
      pdf.save(`${reportLabel} - ${doctor.name} - ${stamp}.pdf`);
      toast.success("تم تصدير الكشف بنجاح");
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر إنشاء PDF");
    }
  }

  const activeMeta = REPORTS.find(r => r.key === active)!;

  return (
    <div className="space-y-4">
      {/* Report selector cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {REPORTS.map(r => {
          const Icon = r.icon;
          const count = counts[r.key];
          const isActive = active === r.key;
          return (
            <button key={r.key} onClick={() => setActive(r.key)}
              className={`text-start rounded-2xl border p-4 transition shadow-luxury ${isActive
                ? "border-gold bg-gradient-to-br from-gold/15 to-transparent"
                : "border-border bg-card hover:border-gold/50"}`}>
              <div className="flex items-center justify-between">
                <span className={`size-10 rounded-xl grid place-items-center ${isActive ? "gradient-gold text-gold-foreground" : "bg-muted text-foreground"}`}>
                  <Icon className="size-5" />
                </span>
                <span className={`text-2xl font-extrabold ${isActive ? "text-gold" : "text-foreground"}`}>{count}</span>
              </div>
              <div className="mt-3 font-bold text-sm">{r.label}</div>
              <div className="text-[11px] text-muted-foreground mt-1">{r.desc}</div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="rounded-2xl bg-card border border-border p-4 shadow-luxury flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-[11px] font-bold text-muted-foreground mb-1">من تاريخ</label>
          <div className="relative">
            <CalendarIcon className="absolute end-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-gold" />
          </div>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-[11px] font-bold text-muted-foreground mb-1">إلى تاريخ</label>
          <div className="relative">
            <CalendarIcon className="absolute end-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-gold" />
          </div>
        </div>
        {(from || to) && (
          <button onClick={() => { setFrom(""); setTo(""); }}
            className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold hover:border-gold">
            مسح
          </button>
        )}
        <button onClick={exportPdf}
          className="ms-auto inline-flex items-center gap-2 rounded-xl gradient-brown px-4 py-2 text-sm font-bold shadow-luxury">
          <Download className="size-4" /> تصدير PDF
        </button>
      </div>

      {/* Table (also used as PDF source) */}
      <div ref={tableRef} className="rounded-2xl bg-card border border-border shadow-luxury overflow-hidden">
        <div className="p-4 border-b border-border bg-gradient-to-l from-gold/10 to-transparent">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-bold text-base">{activeMeta.label}</h3>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                الطبيب: {doctor.name}
                {doctor.branch ? ` • ${doctor.branch === "ibb" ? "فرع إب" : "فرع صنعاء"}` : ""}
                {(from || to) && ` • ${from || "البداية"} → ${to || "اليوم"}`}
              </div>
            </div>
            <span className="rounded-full gradient-gold text-gold-foreground text-xs font-bold px-3 py-1 shadow-gold">
              {filtered.length} حالة
            </span>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-muted-foreground text-sm">جارِ التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            <FileText className="size-10 mx-auto mb-3 opacity-40" />
            لا توجد حالات مطابقة في هذا الكشف.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-muted-foreground">
                <tr>
                  <th className="text-start px-4 py-2.5 font-bold">#</th>
                  <th className="text-start px-4 py-2.5 font-bold">اسم المريض</th>
                  <th className="text-start px-4 py-2.5 font-bold">رقم الحالة</th>
                  <th className="text-start px-4 py-2.5 font-bold">عدد الأسنان</th>
                  <th className="text-start px-4 py-2.5 font-bold">التاريخ</th>
                  <th className="text-start px-4 py-2.5 font-bold">الحالة الحالية</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const stage = getStage(deriveStageKey(r as any));
                  return (
                    <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-2.5 text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-2.5 font-bold">{r.patient_name}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{r.case_code}</td>
                      <td className="px-4 py-2.5 font-bold">{teethOf(r) || "—"}</td>
                      <td className="px-4 py-2.5 text-xs">{new Date(r.created_at).toLocaleDateString("ar")}</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-block rounded-full bg-gold/15 text-gold text-[11px] font-bold px-2.5 py-0.5">
                          {stage.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gold/40 bg-gold/10 font-bold">
                  <td className="px-4 py-2.5" colSpan={2}>المجموع</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{filtered.length} حالة</td>
                  <td className="px-4 py-2.5 text-gold">{totalTeeth} سِنّ</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
