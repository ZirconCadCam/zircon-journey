import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Sparkles, Upload, FileText, X, Loader2, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

const patientSchema = z.object({
  patient_name: z.string().trim()
    .min(2, "اسم المريض يجب أن لا يقل عن حرفين")
    .max(80, "اسم المريض طويل جداً (الحد الأقصى 80 حرف)")
    .regex(/^[\p{L}\s'.\-]+$/u, "اسم المريض يحتوي على رموز غير مسموحة"),
  patient_phone: z.string().trim().optional().refine(
    (v) => !v || /^[0-9+\-\s]{7,15}$/.test(v),
    "رقم الهاتف غير صالح (7-15 رقماً)"
  ),
  patient_age: z.string().optional().refine(
    (v) => !v || (/^\d+$/.test(v) && Number(v) >= 0 && Number(v) <= 120),
    "العمر يجب أن يكون رقماً بين 0 و 120"
  ),
  tooth_number: z.string().trim().optional().refine(
    (v) => !v || /^([1-4][1-8])(\s*[,،\-]\s*[1-4][1-8])*$/.test(v),
    "رقم السن غير صالح (نظام FDI: 11-48، يمكن الفصل بفاصلة)"
  ),
});

export const Route = createFileRoute("/doctors_/$slot/new-case")({
  component: NewSlotCase,
});

interface Doctor { slot: number; name: string; branch: string | null; active: boolean }

const SHADES = ["A1","A2","A3","A3.5","A4","B1","B2","B3","B4","C1","C2","C3","C4","D2","D3","D4","BL1","BL2","BL3","BL4"];
const CASE_TYPES = ["تاج زيركون","فينير","جسر","حشوة","زرعة","تقويم رقمي","أخرى"];

function NewSlotCase() {
  const { slot } = Route.useParams();
  const nav = useNavigate();
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [scan, setScan] = useState<File | null>(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [form, setForm] = useState({
    patient_name: "", patient_phone: "", patient_age: "", patient_gender: "",
    tooth_number: "", shade: "A2", case_type: "تاج زيركون", notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const sessionOk =
      typeof window !== "undefined" &&
      (localStorage.getItem(`zircon_doctor_${slot}_authed`) === "1" ||
        localStorage.getItem("zircon_admin_all") === "1" ||
        ["doctor","designer","technician","secretary","admin"].some(r =>
          localStorage.getItem(`zircon_${r}_session`) === "1"));
    if (!sessionOk) { nav({ to: "/login" }); return; }
    (async () => {
      const { data } = await supabase.from("doctor_profiles").select("*").eq("slot", Number(slot)).maybeSingle();
      setDoctor(data as Doctor);
      setAuthChecked(true);
    })();
  }, [slot, nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = patientSchema.safeParse({
      patient_name: form.patient_name,
      patient_phone: form.patient_phone,
      patient_age: form.patient_age,
      tooth_number: form.tooth_number,
    });
    if (!parsed.success) {
      const fieldErrs: Record<string, string> = {};
      parsed.error.issues.forEach(i => { fieldErrs[i.path[0] as string] = i.message; });
      setErrors(fieldErrs);
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      let scan_path: string | null = null;
      let scan_name: string | null = null;
      let scan_size: number | null = null;
      let scan_mime: string | null = null;

      if (scan) {
        const ext = (scan.name.match(/\.([a-zA-Z0-9]+)$/)?.[1] || "bin").toLowerCase();
        const safeBase = scan.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 40) || "scan";
        const rand = Math.random().toString(36).slice(2, 8);
        const path = `${slot}/scans/${Date.now()}-${rand}-${safeBase}.${ext}`;

        // Resumable TUS upload with live progress
        setScanProgress(1);
        const { startResumableUpload } = await import("@/lib/resumable-upload");
        await new Promise<void>((resolve, reject) => {
          startResumableUpload({
            bucket: "doctor-files",
            path,
            file: scan,
            onProgress: (pct) => setScanProgress(Math.max(1, pct)),
            onSuccess: () => resolve(),
            onError: (err) => reject(err),
          }).catch(reject);
        });
        setScanProgress(100);

        const { data: pub } = supabase.storage.from("doctor-files").getPublicUrl(path);
        scan_path = pub.publicUrl;
        scan_name = scan.name;
        scan_size = scan.size;
        scan_mime = scan.type || null;

        // Mirror the scan into the doctor's files list as well
        await supabase.from("doctor_files").insert({
          doctor_slot: Number(slot),
          file_name: scan.name, file_path: path,
          public_url: pub.publicUrl, size_bytes: scan.size,
          uploaded_by: "doctor",
        });
      }

      const { data: inserted, error } = await supabase.from("slot_cases").insert({
        doctor_slot: Number(slot),
        patient_name: form.patient_name.trim(),
        patient_phone: form.patient_phone.trim() || null,
        patient_age: form.patient_age ? Number(form.patient_age) : null,
        patient_gender: form.patient_gender || null,
        tooth_number: form.tooth_number.trim() || null,
        shade: form.shade || null,
        case_type: form.case_type || null,
        notes: form.notes.trim() || null,
        scan_path, scan_name, scan_size, scan_mime,
        // After saving and notifying the designer, the case is automatically
        // shown as "قيد التصميم" (designer stage) on the doctor's portal.
        status: "designer",
      }).select("id, case_code").single();
      if (error) throw error;

      // Auto-handoff: send the full case payload to the designer via chat.
      try {
        const { notifyRoleAboutCase, getStage, nextStage, localNotify } = await import("@/lib/case-stages");
        const next = nextStage("new") ?? getStage("new");
        if (next.ownerRole) {
          const lines = [
            `📋 ${next.label}`,
            `رمز الحالة: ${inserted!.case_code}`,
            `المريض: ${form.patient_name.trim()}`,
            form.patient_age ? `العمر: ${form.patient_age}` : null,
            form.patient_gender ? `الجنس: ${form.patient_gender === "male" ? "ذكر" : "أنثى"}` : null,
            form.patient_phone ? `الهاتف: ${form.patient_phone.trim()}` : null,
            form.tooth_number ? `رقم السن: ${form.tooth_number.trim()}` : null,
            `اللون: ${form.shade}`,
            `نوع الحالة: ${form.case_type}`,
            form.notes.trim() ? `ملاحظات: ${form.notes.trim()}` : null,
            scan_path ? `📎 المسح مرفق أدناه — يمكن تحميله مباشرة` : null,
            `— ${doctor!.name}`,
          ].filter(Boolean).join("\n");
          await notifyRoleAboutCase({
            doctorSlot: Number(slot),
            doctorName: doctor!.name,
            targetRole: next.ownerRole,
            caseCode: inserted!.case_code,
            patientName: form.patient_name.trim(),
            stageLabel: `إحالة جديدة — ${next.label}`,
            body: lines,
            attachment: scan_path && scan_name ? {
              path: scan_path,
              name: scan_name,
              mime: scan_mime,
              size: scan_size,
            } : null,
          });
        }
        localNotify("Zircon Journey — تم إنشاء حالة", `${form.patient_name.trim()} • ${inserted!.case_code}`);
      } catch { /* notification failures shouldn't block save */ }

      toast.success("تم إنشاء الحالة وإرسال تفاصيلها للمصمم");
      nav({ to: "/doctors/$slot", params: { slot } });
    } catch (err: any) {
      toast.error(err.message || "فشل إنشاء الحالة");
    } finally { setSubmitting(false); }
  }

  if (!authChecked) return <div className="min-h-screen grid place-items-center text-muted-foreground">جارِ التحميل...</div>;
  if (!doctor) return <div className="min-h-screen grid place-items-center text-muted-foreground">الخانة غير موجودة</div>;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between gap-4 px-6 py-3">
          <Link to="/doctors/$slot" params={{ slot }} className="flex items-center gap-3">
            <div className="size-10 rounded-xl gradient-gold grid place-items-center shadow-gold">
              <Sparkles className="size-5" />
            </div>
            <div className="hidden sm:block">
              <div className="font-display font-bold leading-none">حالة جديدة</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{doctor.name}</div>
            </div>
          </Link>
          <Link to="/doctors/$slot" params={{ slot }}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-bold hover:border-gold transition">
            <ArrowRight className="size-4" /> الرجوع
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-8">
        <div className="rounded-3xl gradient-brown text-primary-foreground p-6 sm:p-8 shadow-luxury mb-6">
          <div className="text-xs opacity-80">إنشاء حالة جديدة لـ</div>
          <div className="text-2xl font-extrabold mt-1">{doctor.name}</div>
          <div className="text-xs opacity-80 mt-1">
            {doctor.branch === "sanaa" ? "فرع صنعاء" : doctor.branch === "ibb" ? "فرع إب" : ""}
          </div>
        </div>

        <form onSubmit={submit} className="grid lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 rounded-2xl bg-card border border-border p-6 shadow-luxury space-y-5">
            <div>
              <h2 className="text-lg font-bold mb-1">بيانات المريض</h2>
              <p className="text-xs text-muted-foreground">جميع الحقول المعلَّمة بنجمة مطلوبة.</p>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="اسم المريض" required error={errors.patient_name}>
                <input className="zinput" value={form.patient_name} maxLength={80}
                  onChange={e=>setForm({...form,patient_name:e.target.value})} required />
              </Field>
              <Field label="رقم الهاتف" error={errors.patient_phone}>
                <input dir="ltr" className="zinput" value={form.patient_phone} maxLength={15}
                  onChange={e=>setForm({...form,patient_phone:e.target.value})} placeholder="7xxxxxxxx" />
              </Field>
              <Field label="العمر" error={errors.patient_age}>
                <input type="number" min={0} max={120} className="zinput" value={form.patient_age}
                  onChange={e=>setForm({...form,patient_age:e.target.value})} />
              </Field>
              <Field label="الجنس">
                <select className="zinput" value={form.patient_gender}
                  onChange={e=>setForm({...form,patient_gender:e.target.value})}>
                  <option value="">— اختر —</option>
                  <option value="male">ذكر</option>
                  <option value="female">أنثى</option>
                </select>
              </Field>
            </div>

            <div className="border-t border-border pt-5">
              <h2 className="text-lg font-bold mb-3">تفاصيل الحالة</h2>
              <div className="grid md:grid-cols-3 gap-4">
                <Field label="رقم السن (FDI)" error={errors.tooth_number}>
                  <input className="zinput" value={form.tooth_number}
                    onChange={e=>setForm({...form,tooth_number:e.target.value})} placeholder="مثال: 11, 24, 36" />
                </Field>
                <Field label="اللون (Shade)">
                  <select className="zinput" value={form.shade}
                    onChange={e=>setForm({...form,shade:e.target.value})}>
                    {SHADES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="نوع الحالة">
                  <select className="zinput" value={form.case_type}
                    onChange={e=>setForm({...form,case_type:e.target.value})}>
                    {CASE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="ملاحظات إضافية" className="mt-4">
                <textarea rows={4} className="zinput resize-none" value={form.notes}
                  onChange={e=>setForm({...form,notes:e.target.value})}
                  placeholder="أي ملاحظات سريرية، تعليمات للمختبر، أو متطلبات خاصة..." />
              </Field>
            </div>
          </section>

          <aside className="rounded-2xl bg-card border border-border p-6 shadow-luxury space-y-4 self-start sticky top-20">
            <div className="flex items-center gap-2">
              <ScanLine className="size-5 text-gold" />
              <h2 className="text-lg font-bold">المسح ثلاثي الأبعاد الأولي</h2>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              ارفع ملف المسح الأولي (.stl, .obj, .ply, .3mf, .dcm أو ملف مضغوط).
              يمكنك تخطي هذه الخطوة وإضافة المسح لاحقاً من صفحة الملفات.
            </p>

            {!scan ? (
              <label className="block cursor-pointer rounded-xl border-2 border-dashed border-border hover:border-gold transition p-6 text-center">
                <Upload className="size-7 mx-auto mb-2 text-muted-foreground" />
                <div className="text-sm font-bold">اختر ملف المسح</div>
                <div className="text-[11px] text-muted-foreground mt-1">أو اسحبه هنا</div>
                <input ref={fileInput} type="file" className="hidden"
                  accept=".stl,.obj,.ply,.3mf,.dcm,.zip,.rar,model/*"
                  onChange={e => { const f = e.target.files?.[0]; if (f) setScan(f); }} />
              </label>
            ) : (
              <div className="rounded-xl border border-border p-3 bg-muted/30 flex items-stretch gap-3">
                {/* Vertical progress bar (fills bottom→top while uploading) */}
                {submitting && (
                  <div
                    className="relative w-3 rounded-full bg-muted/60 overflow-hidden shrink-0"
                    role="progressbar"
                    aria-valuenow={scanProgress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="تقدم رفع المسح"
                  >
                    <div
                      className="absolute inset-x-0 bottom-0 gradient-gold transition-all duration-200"
                      style={{ height: `${scanProgress}%` }}
                    />
                  </div>
                )}

                <div className="size-10 rounded-lg gradient-gold grid place-items-center shrink-0 self-center">
                  <FileText className="size-5 text-gold-foreground" />
                </div>
                <div className="min-w-0 flex-1 self-center">
                  <div className="text-sm font-bold truncate">{scan.name}</div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                    <span>{(scan.size/1024/1024).toFixed(2)} MB</span>
                    {submitting && (
                      <span className="text-gold font-bold">• {scanProgress}% جارِ الرفع…</span>
                    )}
                  </div>
                </div>
                {!submitting && (
                  <button type="button" onClick={() => { setScan(null); setScanProgress(0); if (fileInput.current) fileInput.current.value=""; }}
                    className="rounded-lg border border-border p-1.5 hover:bg-destructive hover:text-destructive-foreground self-center" aria-label="إزالة">
                    <X className="size-4" />
                  </button>
                )}
              </div>
            )}

            <button type="submit" disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl gradient-brown py-3 font-bold shadow-luxury disabled:opacity-60">
              {submitting ? <><Loader2 className="size-4 animate-spin" /> جارِ الحفظ...</> : "حفظ الحالة"}
            </button>
            <Link to="/doctors/$slot" params={{ slot }}
              className="block text-center text-xs text-muted-foreground hover:text-foreground">
              إلغاء والعودة
            </Link>
          </aside>
        </form>
      </main>

      <style>{`
        .zinput { width:100%; border:1px solid hsl(var(--input)); background:hsl(var(--background));
          border-radius: 0.75rem; padding: 0.65rem 0.85rem; font-size: 0.875rem; outline:none; transition: border-color .15s; }
        .zinput:focus { border-color: hsl(var(--gold, 45 80% 55%)); }
      `}</style>
    </div>
  );
}

function Field({ label, required, children, className, error }:
  { label: string; required?: boolean; children: React.ReactNode; className?: string; error?: string }) {
  return (
    <label className={`block ${className ?? ""}`}>
      <div className="text-xs font-bold text-muted-foreground mb-1.5">
        {label} {required && <span className="text-destructive">*</span>}
      </div>
      {children}
      {error && <div className="text-[11px] text-destructive mt-1 font-medium">{error}</div>}
    </label>
  );
}
