import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Sparkles, Upload, FileText, X, Loader2, ScanLine, Plus, Pause, Play, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { ToothQuadrantPicker } from "@/components/tooth-quadrant-picker";
import type { ResumableHandle } from "@/lib/resumable-upload";

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

const SHADES = ["A1","A2","A3","A3.5","A4","B1","B2","B3","B4","C1","C2","C3","C4","D2","D3","D4","BL1","BL2","BL3","BL4","OM2","OM3","1M1","1M2","2M1","2M2","2M3","2L1.5","2L2.5","2R1.5","2R2.5","3M1","3M2","3M3","3L1.5","3L2.5","3R1.5","3R2.5","4M1","4M2","4M3","4L1.5","4L2.5","4R1.5","4R2.5","5M1","5M2","5M3"];
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
    tooth_number: "", teeth_count: "", shade: "A2", case_type: "تاج زيركون", notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savedOnce, setSavedOnce] = useState(false);
  const [savedSig, setSavedSig] = useState<string | null>(null);
  const uploadHandle = useRef<ResumableHandle | null>(null);
  const uploadCanceled = useRef(false);
  const [uploadPaused, setUploadPaused] = useState(false);
  const [shadeConfirmed, setShadeConfirmed] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // Images attached inside the "ملاحظات إضافية" editor (clinical photos, refs…)
  const [noteImages, setNoteImages] = useState<{ url: string; name: string }[]>([]);
  const [noteImgUploading, setNoteImgUploading] = useState(false);
  const noteImgInput = useRef<HTMLInputElement>(null);

  // Signature of the case data currently in the form (incl. chosen scan).
  // Used to fade the save button once an identical case is already saved.
  const currentSig = JSON.stringify(form) + "|" + (scan ? `${scan.name}:${scan.size}` : "") + "|" + noteImages.map(i => i.url).join(",");
  const alreadySaved = savedOnce && savedSig === currentSig;

  function resetForNewCase() {
    setForm({
      patient_name: "", patient_phone: "", patient_age: "", patient_gender: "",
      tooth_number: "", teeth_count: "", shade: "A2", case_type: "تاج زيركون", notes: "",
    });
    setScan(null);
    setScanProgress(0);
    setNoteImages([]);
    if (noteImgInput.current) noteImgInput.current.value = "";
    setErrors({});
    setSavedOnce(false);
    setSavedSig(null);
    setShadeConfirmed(false);
    if (fileInput.current) fileInput.current.value = "";
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

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

  /**
   * Accept a chosen/dropped scan file, then read the ZIP and auto-fill the
   * form with any patient/case metadata embedded inside it. Fields that can't
   * be found are left untouched and reported via a toast.
   */
  async function handleScanFile(f: File) {
    if (!/\.zip$/i.test(f.name)) { toast.error("الرجاء اختيار ملف بصيغة .zip فقط"); return; }
    setScan(f);
    setSavedOnce(false);
    setSavedSig(null);
    setExtracting(true);
    const tid = toast.loading("جارِ قراءة ملف المسح واستخراج البيانات…");
    try {
      const { extractScanMetadata } = await import("@/lib/scan-extract");
      const { data, found, missing } = await extractScanMetadata(f);
      if (found.length > 0) {
        setForm((prev) => ({
          ...prev,
          patient_name: data.patient_name ?? prev.patient_name,
          patient_phone: data.patient_phone ?? prev.patient_phone,
          patient_age: data.patient_age ?? prev.patient_age,
          patient_gender: data.patient_gender ?? prev.patient_gender,
          tooth_number: data.tooth_number ?? prev.tooth_number,
          teeth_count: data.teeth_count ?? prev.teeth_count,
          shade: data.shade ?? prev.shade,
        }));
        if (data.shade) setShadeConfirmed(false);
        toast.success(`تم استخراج وتعبئة: ${found.join("، ")}`, { id: tid });
        if (missing.length > 0) {
          toast.info(`تعذّر العثور على: ${missing.join("، ")} — الرجاء إدخالها يدوياً`);
        }
      } else {
        toast.warning("لم يتم العثور على بيانات قابلة للاستخراج في ملف المسح — الرجاء تعبئة النموذج يدوياً", { id: tid });
      }
    } catch {
      toast.error("تعذّرت قراءة ملف المسح — الرجاء تعبئة النموذج يدوياً", { id: tid });
    } finally {
      setExtracting(false);
    }
  }

  /** Upload one or more images attached inside the notes editor. */
  async function handleNoteImages(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => /^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|heic|bmp)$/i.test(f.name));
    if (list.length === 0) { toast.error("الرجاء اختيار ملف صورة صالح"); return; }
    setNoteImgUploading(true);
    const tid = toast.loading("جارِ رفع الصورة…");
    try {
      const uploaded: { url: string; name: string }[] = [];
      for (const f of list) {
        const ext = (f.name.match(/\.([a-zA-Z0-9]+)$/)?.[1] || "jpg").toLowerCase();
        const rand = Math.random().toString(36).slice(2, 8);
        const path = `${slot}/note-images/${Date.now()}-${rand}.${ext}`;
        const { error } = await supabase.storage.from("doctor-files").upload(path, f, {
          contentType: f.type || "image/jpeg", upsert: false,
        });
        if (error) throw error;
        const { data: pub } = supabase.storage.from("doctor-files").getPublicUrl(path);
        uploaded.push({ url: pub.publicUrl, name: f.name });
      }
      setNoteImages((prev) => [...prev, ...uploaded]);
      setSavedOnce(false);
      setSavedSig(null);
      // Instant auto-forward of the images to the clinic's Telegram group.
      const { autoSendFilesToTelegram } = await import("@/lib/telegram-auto");
      const { buildCaseCaption } = await import("@/lib/telegram-auto");
      autoSendFilesToTelegram(
        buildCaseCaption({
          icon: "🖼️",
          title: "إرسال تلقائي — صور من الطبيب",
          from: "الطبيب",
          patientName: form.patient_name.trim() || null,
          stageLabel: "حالة جديدة",
          filenames: uploaded.map((u) => u.name),
        }),
        uploaded.map((u) => ({ url: u.url, filename: u.name })),
      );
      toast.success(`تم رفع ${uploaded.length} صورة`, { id: tid });
    } catch {
      toast.error("تعذّر رفع الصورة — حاول مرة أخرى", { id: tid });
    } finally {
      setNoteImgUploading(false);
      if (noteImgInput.current) noteImgInput.current.value = "";
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Prevent re-saving the exact same case data that was already saved/sent.
    if (alreadySaved) {
      toast.info("تم حفظ هذه الحالة وإرسالها مسبقاً. عدّل البيانات أو ابدأ حالة جديدة.");
      return;
    }
    // Require all fields + a .zip scan file
    const required = [
      ["patient_name", form.patient_name, "اسم المريض"],
      ["patient_phone", form.patient_phone, "رقم الهاتف"],
      ["tooth_number", form.tooth_number, "تحديد الأسنان على المخطط"],
      ["teeth_count", form.teeth_count, "عدد الأسنان"],
      ["shade", form.shade, "اللون"],
      ["case_type", form.case_type, "نوع الحالة"],
    ] as const;
    for (const [k, v, label] of required) {
      if (!String(v ?? "").trim()) {
        setErrors({ [k]: `${label} مطلوب` });
        toast.error(`الرجاء تعبئة: ${label}`);
        return;
      }
    }
    if (!scan) {
      toast.error("الرجاء اختيار ملف المسح بصيغة .zip");
      return;
    }
    if (!/\.zip$/i.test(scan.name)) {
      toast.error("ملف المسح يجب أن يكون بصيغة .zip فقط");
      return;
    }
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

        // Resumable TUS upload with live progress + global transfer tracking
        setScanProgress(1);
        setUploadPaused(false);
        uploadCanceled.current = false;
        const { startResumableUpload } = await import("@/lib/resumable-upload");
        const { registerUpload } = await import("@/lib/transfer-manager");
        const tracker = registerUpload(scan.name, {
          pause: () => { uploadHandle.current?.pause(); setUploadPaused(true); tracker.paused(); },
          resume: () => { uploadHandle.current?.resume(); setUploadPaused(false); tracker.resumed(); },
          cancel: () => { uploadCanceled.current = true; uploadHandle.current?.abort(); },
        });
        try {
          await new Promise<void>((resolve, reject) => {
            startResumableUpload({
              bucket: "doctor-files",
              path,
              file: scan,
              onProgress: (pct, loaded, total) => { setScanProgress(Math.max(1, pct)); tracker.update(pct, loaded, total); },
              onSuccess: () => resolve(),
              onError: (err) => reject(err),
            }).then((h) => { uploadHandle.current = h; }).catch(reject);
          });
          tracker.done();
        } catch (e) {
          uploadHandle.current = null;
          if (uploadCanceled.current) { tracker.remove(); throw new Error("تم إلغاء رفع المسح"); }
          tracker.fail();
          throw e;
        }
        uploadHandle.current = null;
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

      // Stable idempotency key for this exact payload — the DB unique index
      // rejects a second insert of the same data even if the UI re-submits.
      let idemHash = 0;
      const idemSrc = `${slot}|${currentSig}`;
      for (let i = 0; i < idemSrc.length; i++) idemHash = (idemHash * 31 + idemSrc.charCodeAt(i)) | 0;
      const idempotency_key = `case:${slot}:${(idemHash >>> 0).toString(36)}`;

      const { data: inserted, error } = await supabase.from("slot_cases").insert({
        doctor_slot: Number(slot),
        patient_name: form.patient_name.trim(),
        patient_phone: form.patient_phone.trim() || null,
        patient_age: form.patient_age ? Number(form.patient_age) : null,
        patient_gender: form.patient_gender || null,
        tooth_number: form.tooth_number.trim() || null,
        teeth_count: form.teeth_count.trim() || null,
        shade: form.shade || null,
        // Shade confirmation is deliberately NOT done at case creation; the
        // doctor confirms the shade once at the "قيد المراجعة" stage.
        shade_confirmed_doctor: false,
        case_type: form.case_type || null,
        notes: form.notes.trim() || null,
        notes_images: noteImages,
        scan_path, scan_name, scan_size, scan_mime,
        idempotency_key,
        // After saving and notifying the designer, the case is automatically
        // shown as "قيد التصميم" (designer stage) on the doctor's portal.
        status: "designer",
      }).select("id, case_code").single();
      if (error) {
        // 23505 = unique violation → this exact case was already saved/sent.
        if ((error as any).code === "23505") {
          setSavedOnce(true);
          setSavedSig(currentSig);
          toast.info("تم حفظ هذه الحالة مسبقاً — لن تُرسل نسخة مكررة");
          setSubmitting(false);
          return;
        }
        throw error;
      }

      // Record the scan upload in the per-case file activity log.
      if (inserted?.id && scan_name) {
        try {
          const { logFileActivity } = await import("@/lib/file-activity");
          await logFileActivity({
            caseId: inserted.id, action: "upload", fileName: scan_name,
            status: "done", actor: "الطبيب", actorRole: "doctor", sizeBytes: scan_size ?? null,
          });
        } catch { /* best-effort */ }
      }

      // Instant auto-notification of every new case to the clinic's Telegram
      // group — always sent, with the 3D-scan ZIP attached when present.
      try {
        const { autoSendFilesToTelegram, buildCaseCaption } = await import("@/lib/telegram-auto");
        const details = [
          form.patient_phone.trim() ? `📞 الهاتف: ${form.patient_phone.trim()}` : null,
          form.patient_age ? `🎂 العمر: ${form.patient_age}` : null,
          form.patient_gender ? `⚧ الجنس: ${form.patient_gender === "male" ? "ذكر" : "أنثى"}` : null,
          form.teeth_count.trim() ? `🦷 عدد الأسنان: ${form.teeth_count.trim()}` : null,
          form.tooth_number.trim() ? `#️⃣ أرقام الأسنان: ${form.tooth_number.trim()}` : null,
          form.case_type ? `🧩 نوع الحالة: ${form.case_type}` : null,
          form.notes.trim() ? `📝 ملاحظات: ${form.notes.trim()}` : null,
        ].filter(Boolean).join("\n");
        const caption = buildCaseCaption({
          icon: "🆕",
          title: "حالة جديدة",
          from: "الطبيب",
          caseCode: inserted?.case_code ?? "-",
          patientName: form.patient_name.trim(),
          doctorName: doctor?.name ?? null,
          stageLabel: "قيد التصميم",
          caseId: inserted?.id ?? null,
          filenames: scan_name ? [scan_name] : [],
        }) + (details ? `\n${details}` : "");
        autoSendFilesToTelegram(
          caption,
          scan_path && scan_name ? [{ url: scan_path, filename: scan_name }] : [],
          form.patient_name.trim() || null,
        );
      } catch { /* Telegram must never block the save */ }






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

      toast.success("تم إنشاء الحالة وإرسال تفاصيلها للمصمم — يمكنك إنشاء حالة أخرى الآن");
      setSavedOnce(true);
      setSavedSig(currentSig);
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
              <Field label="رقم الهاتف" required error={errors.patient_phone}>
                <input dir="ltr" className="zinput" value={form.patient_phone} maxLength={15}
                  onChange={e=>setForm({...form,patient_phone:e.target.value})} placeholder="7xxxxxxxx" required />
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
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <Field label="رقم السن (FDI)" error={errors.tooth_number}>
                    <input className="zinput" value={form.tooth_number}
                      onChange={e=>setForm({...form,tooth_number:e.target.value})} placeholder="مثال: 11، 24، 36" />
                  </Field>
                  <Field label="عدد الأسنان" required>
                    <input className="zinput" value={form.teeth_count}
                      onChange={e=>setForm({...form,teeth_count:e.target.value})} placeholder="مثال: 3" required />
                  </Field>
                  <Field label="اللون (Shade)">
                    <select className="zinput" value={form.shade}
                      onChange={e=>{setForm({...form,shade:e.target.value}); setShadeConfirmed(false);}}>
                      {SHADES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <div className="mt-1.5 text-[11px] font-bold text-muted-foreground">
                      تأكيد اللون يتم لاحقاً في مرحلة «قيد المراجعة».
                    </div>

                  </Field>
                  <Field label="نوع الحالة">
                    <select className="zinput" value={form.case_type}
                      onChange={e=>setForm({...form,case_type:e.target.value})}>
                      {CASE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="تحديد الأسنان على المخطط" required error={errors.tooth_number}>
                  <ToothQuadrantPicker
                    value={form.tooth_number}
                    onChange={(flat) => setForm((f) => ({
                      ...f,
                      tooth_number: flat,
                      teeth_count: flat ? String(flat.split("،").filter(Boolean).length) : "",
                    }))}
                  />
                </Field>
              </div>
              <Field label="ملاحظات إضافية" className="mt-4">
                <textarea rows={4} className="zinput resize-none" value={form.notes}
                  onChange={e=>setForm({...form,notes:e.target.value})}
                  placeholder="أي ملاحظات سريرية، تعليمات للمختبر، أو متطلبات خاصة..." />

                {/* Image attachment tool inside the notes editor */}
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <button type="button" onClick={() => noteImgInput.current?.click()}
                    disabled={noteImgUploading}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-bold hover:border-gold transition disabled:opacity-60">
                    {noteImgUploading
                      ? <><Loader2 className="size-3.5 animate-spin" /> جارِ الرفع…</>
                      : <><ImagePlus className="size-3.5 text-gold" /> إضافة صورة للملاحظات</>}
                  </button>
                  <span className="text-[11px] text-muted-foreground">تظهر للمصمم ضمن بيانات الحالة</span>
                  <input ref={noteImgInput} type="file" accept="image/*" multiple className="hidden"
                    onChange={(e) => { if (e.target.files?.length) handleNoteImages(e.target.files); }} />
                </div>

                {noteImages.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {noteImages.map((img, i) => (
                      <div key={img.url} className="relative group rounded-lg overflow-hidden border border-border">
                        <img src={img.url} alt={img.name} className="w-full h-20 object-cover" />
                        <button type="button"
                          onClick={() => setNoteImages((prev) => prev.filter((_, idx) => idx !== i))}
                          className="absolute top-1 left-1 rounded-md bg-background/80 p-1 opacity-0 group-hover:opacity-100 transition hover:bg-destructive hover:text-destructive-foreground"
                          aria-label="إزالة الصورة">
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Field>
            </div>
          </section>

          <aside className="rounded-2xl bg-card border border-border p-6 shadow-luxury space-y-4 self-start sticky top-20">
            <div className="flex items-center gap-2">
              <ScanLine className="size-5 text-gold" />
              <h2 className="text-lg font-bold">المسح ثلاثي الأبعاد الأولي</h2>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              ارفع ملف المسح الأولي بصيغة <span className="font-bold text-gold">.zip</span> فقط (إلزامي).
            </p>

            {!scan ? (
              <label
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleScanFile(f);
                }}
                className={`block cursor-pointer rounded-xl border-2 border-dashed transition p-6 text-center ${
                  dragOver ? "border-gold bg-gold/10" : "border-border hover:border-gold"
                }`}>
                <Upload className="size-7 mx-auto mb-2 text-muted-foreground" />
                <div className="text-sm font-bold">اختر ملف المسح (.zip)</div>
                <div className="text-[11px] text-muted-foreground mt-1">أو اسحبه هنا — وسنملأ النموذج تلقائياً</div>
                <input ref={fileInput} type="file" className="hidden"
                  accept=".zip,application/zip,application/x-zip-compressed"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleScanFile(f);
                  }} />
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
                    {extracting && (
                      <span className="text-gold font-bold inline-flex items-center gap-1">
                        <Loader2 className="size-3 animate-spin" /> جارِ استخراج البيانات…
                      </span>
                    )}
                    {submitting && (
                      <span className="text-gold font-bold">
                        • {scanProgress}% {uploadPaused ? "متوقف مؤقتاً" : "جارِ الرفع…"}
                      </span>
                    )}
                  </div>
                </div>
                {submitting && uploadHandle.current && (
                  <div className="flex items-center gap-1 self-center shrink-0">
                    {uploadPaused ? (
                      <button type="button" onClick={() => { uploadHandle.current?.resume(); setUploadPaused(false); }}
                        className="rounded-lg border border-border p-1.5 hover:border-gold" aria-label="استئناف الرفع">
                        <Play className="size-4" />
                      </button>
                    ) : (
                      <button type="button" onClick={() => { uploadHandle.current?.pause(); setUploadPaused(true); }}
                        className="rounded-lg border border-border p-1.5 hover:border-gold" aria-label="إيقاف مؤقت">
                        <Pause className="size-4" />
                      </button>
                    )}
                    <button type="button" onClick={() => { uploadCanceled.current = true; uploadHandle.current?.abort(); }}
                      className="rounded-lg border border-border p-1.5 hover:bg-destructive hover:text-destructive-foreground" aria-label="إلغاء الرفع">
                      <X className="size-4" />
                    </button>
                  </div>
                )}
                {!submitting && (
                  <button type="button" onClick={() => { setScan(null); setScanProgress(0); if (fileInput.current) fileInput.current.value=""; }}
                    className="rounded-lg border border-border p-1.5 hover:bg-destructive hover:text-destructive-foreground self-center" aria-label="إزالة">
                    <X className="size-4" />
                  </button>
                )}
              </div>
            )}

            <button type="submit" disabled={submitting || alreadySaved}
              title={alreadySaved ? "تم حفظ هذه الحالة وإرسالها — عدّل البيانات أو ابدأ حالة جديدة" : "حفظ وإرسال الحالة"}
              className={`w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 font-bold shadow-luxury transition ${
                alreadySaved
                  ? "bg-muted text-muted-foreground opacity-50 cursor-not-allowed"
                  : "gradient-brown hover:brightness-105"
              } disabled:opacity-60`}>
              {submitting
                ? <><Loader2 className="size-4 animate-spin" /> جارِ الحفظ...</>
                : alreadySaved
                  ? "تم الحفظ والإرسال ✓"
                  : "حفظ الحالة"}
            </button>

            <button
              type="button"
              onClick={resetForNewCase}
              disabled={!savedOnce || submitting}
              title={savedOnce ? "إنشاء حالة جديدة دون مغادرة الصفحة" : "ستصبح متاحة بعد حفظ الحالة"}
              className={`w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-dashed py-2.5 font-bold transition ${
                savedOnce
                  ? "border-gold text-gold hover:bg-gold/10 cursor-pointer"
                  : "border-border text-muted-foreground opacity-40 cursor-not-allowed"
              }`}
            >
              <Plus className="size-4" /> حالة جديدة
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
