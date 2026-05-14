import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Stethoscope, FileText, Download, Share2, Loader2,
  ScanLine, User, Phone, Hash, Palette, ClipboardList, Calendar,
  Archive, Trash2,
} from "lucide-react";

/** Inject hex overrides for our oklch CSS variables into html2canvas's cloned doc. */
const H2C_ONCLONE = (doc: Document) => {
  const css = doc.createElement("style");
  css.textContent = `:root, html, body, * {
    --background:#ffffff; --foreground:#1a1a1a;
    --card:#ffffff; --card-foreground:#1a1a1a;
    --popover:#ffffff; --popover-foreground:#1a1a1a;
    --primary:#5b3a14; --primary-foreground:#ffffff;
    --secondary:#f5f0e0; --secondary-foreground:#1a1a1a;
    --muted:#f5f0e0; --muted-foreground:#777777;
    --accent:#b8893a; --accent-foreground:#ffffff;
    --destructive:#c0392b; --destructive-foreground:#ffffff;
    --border:#e2d4b1; --input:#e2d4b1; --ring:#b8893a;
    --gold:#b8893a; --gold-foreground:#ffffff;
    --sidebar:#ffffff; --sidebar-foreground:#1a1a1a;
    --sidebar-primary:#5b3a14; --sidebar-primary-foreground:#ffffff;
    --sidebar-accent:#f5f0e0; --sidebar-accent-foreground:#1a1a1a;
    --sidebar-border:#e2d4b1; --sidebar-ring:#b8893a;
    --chart-1:#b8893a; --chart-2:#5b3a14; --chart-3:#777777; --chart-4:#e2d4b1; --chart-5:#faf6ee;
  }
  html, body { background:#ffffff !important; color:#1a1a1a !important; }`;
  doc.head.appendChild(css);
};
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { saveToCenter, downloadUrlToCenter, fileManagerSupported, CENTER_FOLDER_NAME } from "@/lib/file-manager";

interface Doctor { slot: number; name: string; branch: string | null; active: boolean }
interface Case {
  id: string;
  case_code: string;
  doctor_slot: number;
  patient_name: string;
  patient_phone: string | null;
  patient_age: number | null;
  patient_gender: string | null;
  tooth_number: string | null;
  teeth_count: string | null;
  shade: string | null;
  case_type: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  scan_path: string | null;
  scan_name: string | null;
  scan_size: number | null;
  scan_mime: string | null;
  design_done: boolean | null;
  design_file_sent: boolean | null;
  fabrication_done: boolean | null;
  fabrication_file_sent: boolean | null;
}

import { CaseWorkflowControls } from "@/components/case-workflow-controls";
import { deriveStageKey, getStage } from "@/lib/case-stages";
import type { RoleKey } from "@/lib/chat";
import { ROLE_LABEL } from "@/lib/chat";

interface DesignerCasesProps {
  /** Which actor view: designer (default) or technician */
  actor?: "designer" | "technician";
  /** When actor === technician, the secretary branch role to send to */
  technicianTarget?: RoleKey;
  actorName?: string;
}

export function DesignerCases({ actor = "designer", technicianTarget, actorName }: DesignerCasesProps = {}) {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [filterSlot, setFilterSlot] = useState<number | "all">("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: docs }, { data: cs }] = await Promise.all([
        supabase.from("doctor_profiles").select("slot,name,branch,active").order("slot"),
        supabase.from("slot_cases").select("*").eq("archived", false).order("created_at", { ascending: false }),
      ]);
      setDoctors(((docs ?? []) as Doctor[]).filter(d => d.active));
      setCases((cs ?? []) as Case[]);
      setLoading(false);
    })();

    const ch = supabase.channel("designer-cases-stream")
      .on("postgres_changes", { event: "*", schema: "public", table: "slot_cases" }, async () => {
        const { data: cs } = await supabase.from("slot_cases").select("*").eq("archived", false).order("created_at", { ascending: false });
        setCases((cs ?? []) as Case[]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = useMemo(() => {
    if (filterSlot === "all") return cases;
    return cases.filter(c => c.doctor_slot === filterSlot);
  }, [cases, filterSlot]);

  const doctorMap = useMemo(() => {
    const m = new Map<number, Doctor>();
    doctors.forEach(d => m.set(d.slot, d));
    return m;
  }, [doctors]);

  const grouped = useMemo(() => {
    const counts = new Map<number, number>();
    cases.forEach(c => counts.set(c.doctor_slot, (counts.get(c.doctor_slot) ?? 0) + 1));
    return counts;
  }, [cases]);

  // Compute the "pending file" gate: if this actor already checked a case
  // but didn't yet send the .rar file, block ticking new ones.
  const pendingCaseCode = useMemo(() => {
    if (actor === "designer") {
      const p = cases.find(c => c.design_done && !c.design_file_sent);
      return p?.case_code ?? null;
    }
    const p = cases.find(c => c.fabrication_done && !c.fabrication_file_sent);
    return p?.case_code ?? null;
  }, [cases, actor]);

  // Filter cases the technician should see: those that have been handed off
  // (design_file_sent === true) and not yet finalized.
  const visibleForActor = useMemo(() => {
    if (actor === "technician") {
      return filtered.filter(c => c.design_file_sent && !c.fabrication_file_sent);
    }
    return filtered;
  }, [filtered, actor]);

  async function downloadScan(c: Case) {
    setBusyId(c.id);
    try {
      const doctor = doctorMap.get(c.doctor_slot);
      const branchAr = doctor?.branch === "sanaa" ? "صنعاء" : doctor?.branch === "ibb" ? "إب" : "—";
      const dateStr = new Date(c.created_at).toISOString().slice(0, 10);
      const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "_").trim();
      const filename = `${safe(c.patient_name)} - ${branchAr} - ${safe(doctor?.name ?? `Slot ${c.doctor_slot}`)} - ${dateStr}.pdf`;

      // Build hidden Arabic-friendly node including the scan image when available
      const isImage = !!c.scan_mime?.startsWith("image/");
      const node = document.createElement("div");
      node.style.cssText = "position:fixed;left:-99999px;top:0;width:794px;padding:36px;background:#fff;color:#1a1a1a;font-family:'Cairo','Tajawal','Segoe UI',sans-serif;direction:rtl;text-align:right;line-height:1.7;";
      node.innerHTML = `
        <div style="border-bottom:3px solid #b8893a;padding-bottom:14px;margin-bottom:18px;">
          <div style="font-size:22px;font-weight:800;color:#5b3a14;">Zircon Journey — تفاصيل الحالة</div>
          <div style="font-size:12px;color:#777;margin-top:4px;">${new Date().toLocaleString("ar-EG")}</div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          ${row("رمز الحالة", c.case_code)}
          ${row("الطبيب المعالج", doctor?.name ?? `Slot ${c.doctor_slot}`)}
          ${row("الفرع", branchAr)}
          ${row("الحالة", getStage(deriveStageKey(c)).label)}
          ${row("تاريخ الإنشاء", new Date(c.created_at).toLocaleString("ar-EG"))}
        </table>
        <div style="margin-top:18px;padding:12px;background:#faf6ee;border-right:4px solid #b8893a;">
          <div style="font-weight:800;color:#5b3a14;margin-bottom:6px;">بيانات المريض</div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            ${row("الاسم", c.patient_name)}
            ${row("الهاتف", c.patient_phone || "—")}
            ${row("العمر", c.patient_age?.toString() || "—")}
            ${row("الجنس", c.patient_gender === "male" ? "ذكر" : c.patient_gender === "female" ? "أنثى" : "—")}
          </table>
        </div>
        <div style="margin-top:14px;padding:12px;background:#f5f0e0;border-right:4px solid #b8893a;">
          <div style="font-weight:800;color:#5b3a14;margin-bottom:6px;">تفاصيل الحالة</div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            ${row("نوع الحالة", c.case_type || "—")}
            ${row("رقم السن (FDI)", c.tooth_number || "—")}
            ${row("اللون", c.shade || "—")}
          </table>
        </div>
        ${c.notes ? `
        <div style="margin-top:14px;padding:12px;background:#fff;border:1px solid #e2d4b1;">
          <div style="font-weight:800;color:#5b3a14;margin-bottom:6px;">ملاحظات</div>
          <div style="white-space:pre-wrap;font-size:13px;">${escapeHtml(c.notes)}</div>
        </div>` : ""}
        ${c.scan_path ? `
        <div style="margin-top:14px;padding:12px;background:#fff;border:1px dashed #b8893a;">
          <div style="font-weight:800;color:#5b3a14;margin-bottom:8px;">📎 المسح ثلاثي الأبعاد</div>
          ${isImage ? `<img src="${c.scan_path}" crossorigin="anonymous" style="max-width:100%;max-height:520px;display:block;margin:0 auto;border:1px solid #e2d4b1;border-radius:6px;" />`
            : `<div style="font-size:12px;">الاسم: ${escapeHtml(c.scan_name || "—")}</div>
               ${c.scan_size ? `<div style="font-size:12px;">الحجم: ${(c.scan_size/1024/1024).toFixed(2)} MB</div>` : ""}`}
        </div>` : `<div style="margin-top:14px;padding:12px;background:#fff;border:1px dashed #ccc;color:#999;font-size:12px;">لا يوجد ملف مسح مرفق</div>`}
        <div style="margin-top:24px;text-align:center;font-size:11px;color:#999;border-top:1px solid #eee;padding-top:10px;">
          Zircon CAD/CAM — تقرير حالة آلي
        </div>
      `;
      document.body.appendChild(node);

      // Wait for the embedded image to load (or fail) before rasterizing
      const img = node.querySelector("img");
      if (img && !(img as HTMLImageElement).complete) {
        await new Promise<void>(res => {
          (img as HTMLImageElement).onload = () => res();
          (img as HTMLImageElement).onerror = () => res();
        });
      }

      const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true, onclone: H2C_ONCLONE });
      document.body.removeChild(node);

      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      const dataImg = canvas.toDataURL("image/jpeg", 0.92);
      if (imgH <= pageH) {
        pdf.addImage(dataImg, "JPEG", 0, 0, imgW, imgH);
      } else {
        let remaining = imgH; let y = 0;
        while (remaining > 0) {
          pdf.addImage(dataImg, "JPEG", 0, y, imgW, imgH);
          remaining -= pageH;
          if (remaining > 0) { pdf.addPage(); y -= pageH; }
        }
      }
      const blob = pdf.output("blob");

      if (fileManagerSupported()) {
        const r = await saveToCenter(blob, filename, c.case_code);
        if (r.fallback) toast.success("تم تنزيل ملف PDF");
        else toast.success(`تم الحفظ في ${r.path}`);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        toast.success("تم تنزيل ملف PDF");
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "تعذر تنزيل المسح");
    } finally { setBusyId(null); }
  }

  async function downloadPdf(c: Case) {
    setBusyId(c.id);
    try {
      const doctor = doctorMap.get(c.doctor_slot);
      // Build a hidden Arabic-friendly HTML node, render via html2canvas (preserves Arabic glyphs)
      const node = document.createElement("div");
      node.style.cssText = "position:fixed;left:-99999px;top:0;width:794px;padding:36px;background:#fff;color:#1a1a1a;font-family:'Cairo','Tajawal','Segoe UI',sans-serif;direction:rtl;text-align:right;line-height:1.7;";
      node.innerHTML = `
        <div style="border-bottom:3px solid #b8893a;padding-bottom:14px;margin-bottom:18px;">
          <div style="font-size:22px;font-weight:800;color:#5b3a14;">Zircon Journey — تفاصيل الحالة</div>
          <div style="font-size:12px;color:#777;margin-top:4px;">${new Date().toLocaleString("ar-EG")}</div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          ${row("رمز الحالة", c.case_code)}
          ${row("الطبيب المعالج", doctor?.name ?? `Slot ${c.doctor_slot}`)}
          ${row("الفرع", doctor?.branch === "sanaa" ? "صنعاء" : doctor?.branch === "ibb" ? "إب" : "—")}
          ${row("الحالة", getStage(deriveStageKey(c)).label)}
          ${row("تاريخ الإنشاء", new Date(c.created_at).toLocaleString("ar-EG"))}
        </table>
        <div style="margin-top:18px;padding:12px;background:#faf6ee;border-right:4px solid #b8893a;">
          <div style="font-weight:800;color:#5b3a14;margin-bottom:6px;">بيانات المريض</div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            ${row("الاسم", c.patient_name)}
            ${row("الهاتف", c.patient_phone || "—")}
            ${row("العمر", c.patient_age?.toString() || "—")}
            ${row("الجنس", c.patient_gender === "male" ? "ذكر" : c.patient_gender === "female" ? "أنثى" : "—")}
          </table>
        </div>
        <div style="margin-top:14px;padding:12px;background:#f5f0e0;border-right:4px solid #b8893a;">
          <div style="font-weight:800;color:#5b3a14;margin-bottom:6px;">تفاصيل الحالة</div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            ${row("نوع الحالة", c.case_type || "—")}
            ${row("رقم السن (FDI)", c.tooth_number || "—")}
            ${row("اللون", c.shade || "—")}
          </table>
        </div>
        ${c.notes ? `
        <div style="margin-top:14px;padding:12px;background:#fff;border:1px solid #e2d4b1;">
          <div style="font-weight:800;color:#5b3a14;margin-bottom:6px;">ملاحظات</div>
          <div style="white-space:pre-wrap;font-size:13px;">${escapeHtml(c.notes)}</div>
        </div>` : ""}
        ${c.scan_path ? `
        <div style="margin-top:14px;padding:12px;background:#fff;border:1px dashed #b8893a;">
          <div style="font-weight:800;color:#5b3a14;margin-bottom:6px;">📎 المسح ثلاثي الأبعاد</div>
          <div style="font-size:12px;">الاسم: ${escapeHtml(c.scan_name || "—")}</div>
          ${c.scan_size ? `<div style="font-size:12px;">الحجم: ${(c.scan_size/1024/1024).toFixed(2)} MB</div>` : ""}
          <div style="font-size:11px;color:#777;margin-top:4px;direction:ltr;text-align:left;word-break:break-all;">${escapeHtml(c.scan_path)}</div>
        </div>` : ""}
        <div style="margin-top:24px;text-align:center;font-size:11px;color:#999;border-top:1px solid #eee;padding-top:10px;">
          Zircon CAD/CAM — تقرير حالة آلي
        </div>
      `;
      document.body.appendChild(node);
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true, onclone: H2C_ONCLONE });
      document.body.removeChild(node);

      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      const img = canvas.toDataURL("image/jpeg", 0.92);
      if (imgH <= pageH) {
        pdf.addImage(img, "JPEG", 0, 0, imgW, imgH);
      } else {
        // Multi-page
        let remaining = imgH;
        let y = 0;
        while (remaining > 0) {
          pdf.addImage(img, "JPEG", 0, y, imgW, imgH);
          remaining -= pageH;
          if (remaining > 0) { pdf.addPage(); y -= pageH; }
        }
      }
      const blob = pdf.output("blob");
      const filename = `${c.case_code}-${c.patient_name.replace(/[^\p{L}\d_-]+/gu, "_").slice(0, 30)}.pdf`;

      if (fileManagerSupported()) {
        const r = await saveToCenter(blob, filename, c.case_code);
        if (r.fallback) toast.success("تم تنزيل ملف PDF");
        else toast.success(`تم الحفظ في ${r.path}`);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        toast.success("تم تنزيل ملف PDF");
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "تعذر إنشاء PDF");
    } finally { setBusyId(null); }
  }

  async function shareExternal(c: Case) {
    setBusyId(c.id);
    try {
      const doctor = doctorMap.get(c.doctor_slot);
      const summary = [
        `📋 حالة ${c.case_code}`,
        `الطبيب: ${doctor?.name ?? ""}`,
        `المريض: ${c.patient_name}`,
        c.tooth_number ? `السن: ${c.tooth_number}` : null,
        c.shade ? `اللون: ${c.shade}` : null,
        c.case_type ? `النوع: ${c.case_type}` : null,
        c.notes ? `ملاحظات: ${c.notes}` : null,
        c.scan_path ? `📎 المسح: ${c.scan_path}` : null,
      ].filter(Boolean).join("\n");

      // Try sharing the actual scan file when possible
      if (c.scan_path) {
        try {
          const res = await fetch(c.scan_path);
          const blob = await res.blob();
          const file = new File([blob], c.scan_name || `${c.case_code}.bin`, { type: c.scan_mime || blob.type || "application/octet-stream" });
          if ((navigator as any).canShare?.({ files: [file] })) {
            await navigator.share({ title: `حالة ${c.case_code}`, text: summary, files: [file] } as any);
            return;
          }
        } catch { /* fall through */ }
      }

      if (navigator.share) {
        await navigator.share({ title: `حالة ${c.case_code}`, text: summary });
      } else {
        await navigator.clipboard.writeText(summary);
        toast.success("تم نسخ تفاصيل الحالة (مشاركة المتصفح غير مدعومة)");
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") toast.error(e.message || "تعذر المشاركة");
    } finally { setBusyId(null); }
  }

  async function archiveCase(c: Case) {
    if (!confirm(`أرشفة الحالة ${c.case_code}؟ لن تظهر بعدها في القائمة.`)) return;
    setBusyId(c.id);
    const { error } = await supabase.from("slot_cases").update({ archived: true }).eq("id", c.id);
    setBusyId(null);
    if (error) { toast.error("تعذرت الأرشفة"); return; }
    setCases(prev => prev.filter(x => x.id !== c.id));
    toast.success("تم نقل الحالة إلى الأرشيف");
  }

  async function deleteCase(c: Case) {
    if (!confirm(`حذف الحالة ${c.case_code} نهائياً؟ لا يمكن التراجع.`)) return;
    setBusyId(c.id);
    const { error } = await supabase.from("slot_cases").delete().eq("id", c.id);
    setBusyId(null);
    if (error) { toast.error("تعذر الحذف"); return; }
    setCases(prev => prev.filter(x => x.id !== c.id));
    toast.success("تم حذف الحالة");
  }

  if (loading) {
    return <div className="rounded-2xl bg-card border border-border p-12 text-center text-muted-foreground shadow-luxury">
      <Loader2 className="size-6 animate-spin mx-auto mb-2" /> جارِ تحميل الحالات…
    </div>;
  }

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-5">
      {/* Doctor filter sidebar */}
      <aside className="rounded-2xl bg-card border border-border overflow-hidden shadow-luxury self-start">
        <div className="p-4 border-b border-border font-bold text-sm flex items-center gap-2">
          <Stethoscope className="size-4 text-gold" /> فلترة حسب الطبيب
        </div>
        <ul className="divide-y divide-border max-h-[600px] overflow-y-auto">
          <li>
            <button onClick={() => setFilterSlot("all")}
              className={`w-full text-start p-3 flex items-center justify-between transition ${filterSlot === "all" ? "bg-gold/10 border-r-4 border-gold" : "hover:bg-muted/40"}`}>
              <span className="font-bold text-sm">كل الأطباء</span>
              <span className="text-[11px] rounded-full bg-muted px-2 py-0.5 font-bold">{cases.length}</span>
            </button>
          </li>
          {doctors.map(d => {
            const count = grouped.get(d.slot) ?? 0;
            const on = filterSlot === d.slot;
            return (
              <li key={d.slot}>
                <button onClick={() => setFilterSlot(d.slot)}
                  className={`w-full text-start p-3 flex items-center gap-2 transition ${on ? "bg-gold/10 border-r-4 border-gold" : "hover:bg-muted/40"}`}>
                  <div className="size-8 rounded-lg gradient-gold grid place-items-center shrink-0">
                    <span className="font-extrabold text-gold-foreground text-sm">{d.name.replace(/^د\.\s*/, "").charAt(0)}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-xs truncate">{d.name}</div>
                    <div className="text-[10px] text-muted-foreground">{d.branch === "sanaa" ? "صنعاء" : d.branch === "ibb" ? "إب" : ""}</div>
                  </div>
                  {count > 0 && <span className="text-[10px] rounded-full bg-muted px-2 py-0.5 font-bold">{count}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Cases list */}
      <section className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm text-muted-foreground">
            عرض <span className="font-bold text-foreground">{visibleForActor.length}</span> حالة
            {filterSlot !== "all" && doctorMap.get(filterSlot) && <> — {doctorMap.get(filterSlot)!.name}</>}
          </div>
          {fileManagerSupported() && (
            <div className="text-[11px] text-muted-foreground">
              تُحفظ التنزيلات في مجلد <span className="font-bold text-gold">{CENTER_FOLDER_NAME}</span>
            </div>
          )}
        </div>

        {visibleForActor.length === 0 ? (
          <div className="rounded-2xl bg-card border border-border p-12 text-center text-muted-foreground shadow-luxury">
            <ClipboardList className="size-10 mx-auto mb-3 opacity-40" />
            لا توجد حالات لعرضها
          </div>
        ) : (
          <ul className="space-y-3">
            {visibleForActor.map(c => {
              const doctor = doctorMap.get(c.doctor_slot);
              const busy = busyId === c.id;
              return (
                <li key={c.id} className="rounded-2xl bg-card border border-border p-5 shadow-luxury hover:border-gold/60 transition">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs rounded-md bg-muted px-2 py-0.5 font-bold">{c.case_code}</span>
                        <span className="text-[11px] rounded-full gradient-gold text-gold-foreground px-2 py-0.5 font-bold">{getStage(deriveStageKey(c)).label}</span>
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Calendar className="size-3" /> {new Date(c.created_at).toLocaleDateString("ar-EG")}
                        </span>
                      </div>
                      <div className="mt-2 font-extrabold text-lg flex items-center gap-2">
                        <User className="size-4 text-gold" /> {c.patient_name}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Stethoscope className="size-3" /> {doctor?.name ?? `Slot ${c.doctor_slot}`}
                        {doctor?.branch && <> • {doctor.branch === "sanaa" ? "صنعاء" : "إب"}</>}
                      </div>

                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        {c.tooth_number && <Info icon={<Hash className="size-3" />} label="السن" value={c.tooth_number} />}
                        {c.shade && <Info icon={<Palette className="size-3" />} label="اللون" value={c.shade} />}
                        {c.case_type && <Info icon={<ClipboardList className="size-3" />} label="النوع" value={c.case_type} />}
                        {c.patient_phone && <Info icon={<Phone className="size-3" />} label="الهاتف" value={c.patient_phone} />}
                      </div>

                      {c.notes && (
                        <div className="mt-3 text-xs bg-muted/40 rounded-lg p-2.5 whitespace-pre-wrap">
                          {c.notes}
                        </div>
                      )}

                      {c.scan_path && (
                        <div className="mt-3 space-y-2">
                          <div className="inline-flex items-center gap-2 text-xs bg-gold/10 border border-gold/30 rounded-lg px-3 py-1.5">
                            <ScanLine className="size-3.5 text-gold" />
                            <span className="font-bold">المسح ثلاثي الأبعاد:</span>
                            <span className="truncate max-w-[200px]">{c.scan_name}</span>
                            {c.scan_size && <span className="text-muted-foreground">({(c.scan_size/1024/1024).toFixed(1)} MB)</span>}
                          </div>
                          {c.scan_mime?.startsWith("image/") && (
                            <div className="rounded-xl overflow-hidden border border-gold/30 bg-muted/30 max-w-md">
                              <img src={c.scan_path} alt={c.scan_name || "3D scan"} loading="lazy"
                                className="w-full max-h-80 object-contain bg-black/5" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 shrink-0">
                      <button onClick={() => downloadPdf(c)} disabled={busy}
                        className="inline-flex items-center gap-2 rounded-xl gradient-gold text-gold-foreground px-3 py-2 text-xs font-bold shadow-gold disabled:opacity-60 hover:shadow-luxury transition">
                        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
                        تنزيل PDF
                      </button>
                      {c.scan_path && (
                        <button onClick={() => downloadScan(c)} disabled={busy}
                          className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold hover:border-gold transition disabled:opacity-60">
                          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                          تنزيل المسح
                        </button>
                      )}
                      <button onClick={() => shareExternal(c)} disabled={busy}
                        className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold hover:border-gold transition disabled:opacity-60">
                        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Share2 className="size-3.5" />}
                        مشاركة
                      </button>
                      <button onClick={() => archiveCase(c)} disabled={busy}
                        className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold hover:border-gold transition disabled:opacity-60">
                        <Archive className="size-3.5" />
                        أرشفة
                      </button>
                      <button onClick={() => deleteCase(c)} disabled={busy}
                        className="inline-flex items-center gap-2 rounded-xl border border-destructive/40 bg-card text-destructive px-3 py-2 text-xs font-bold hover:bg-destructive hover:text-destructive-foreground transition disabled:opacity-60">
                        <Trash2 className="size-3.5" />
                        حذف
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
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

function row(label: string, value: string) {
  return `<tr><td style="padding:6px 0;color:#777;width:130px;font-weight:600;">${escapeHtml(label)}</td><td style="padding:6px 0;font-weight:700;">${escapeHtml(value)}</td></tr>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}
