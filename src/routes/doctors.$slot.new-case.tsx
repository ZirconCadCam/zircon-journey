import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Sparkles, Upload, FileText, X, Loader2, ScanLine } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/doctors/$slot/new-case")({
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

  useEffect(() => {
    const sessionOk =
      typeof window !== "undefined" &&
      (localStorage.getItem(`zircon_doctor_${slot}_authed`) === "1" ||
        localStorage.getItem("zircon_admin_all") === "1" ||
        ["doctor","designer","technician","secretary","admin"].some(r =>
          localStorage.getItem(`zircon_${r}_session`) === "1"));
    if (!sessionOk) { nav({ to: "/doctors/$slot", params: { slot } }); return; }
    (async () => {
      const { data } = await supabase.from("doctor_profiles").select("*").eq("slot", Number(slot)).maybeSingle();
      setDoctor(data as Doctor);
      setAuthChecked(true);
    })();
  }, [slot, nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.patient_name.trim()) { toast.error("اسم المريض مطلوب"); return; }
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
        const { error: upErr } = await supabase.storage.from("doctor-files").upload(path, scan, {
          upsert: false,
          contentType: scan.type || "application/octet-stream",
        });
        if (upErr) throw upErr;
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

      const { error } = await supabase.from("slot_cases").insert({
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
      });
      if (error) throw error;
      toast.success("تم إنشاء الحالة بنجاح");
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
              <Field label="اسم المريض" required>
                <input className="zinput" value={form.patient_name}
                  onChange={e=>setForm({...form,patient_name:e.target.value})} required />
              </Field>
              <Field label="رقم الهاتف">
                <input dir="ltr" className="zinput" value={form.patient_phone}
                  onChange={e=>setForm({...form,patient_phone:e.target.value})} placeholder="7xxxxxxxx" />
              </Field>
              <Field label="العمر">
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
                <Field label="رقم السن">
                  <input className="zinput" value={form.tooth_number}
                    onChange={e=>setForm({...form,tooth_number:e.target.value})} placeholder="مثال: 11, 24..." />
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
              <div className="rounded-xl border border-border p-3 bg-muted/30 flex items-center gap-3">
                <div className="size-10 rounded-lg gradient-gold grid place-items-center shrink-0">
                  <FileText className="size-5 text-gold-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold truncate">{scan.name}</div>
                  <div className="text-[11px] text-muted-foreground">{(scan.size/1024/1024).toFixed(2)} MB</div>
                </div>
                <button type="button" onClick={() => { setScan(null); setScanProgress(0); if (fileInput.current) fileInput.current.value=""; }}
                  className="rounded-lg border border-border p-1.5 hover:bg-destructive hover:text-destructive-foreground" aria-label="إزالة">
                  <X className="size-4" />
                </button>
              </div>
            )}

            {submitting && scan && (
              <div className="rounded-lg bg-muted/40 h-2 overflow-hidden">
                <div className="h-full gradient-gold transition-all" style={{ width: `${scanProgress || 30}%` }} />
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

function Field({ label, required, children, className }:
  { label: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ""}`}>
      <div className="text-xs font-bold text-muted-foreground mb-1.5">
        {label} {required && <span className="text-destructive">*</span>}
      </div>
      {children}
    </label>
  );
}
