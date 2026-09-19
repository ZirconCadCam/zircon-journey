import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Camera, Loader2, Check, Sparkles, BellRing } from "lucide-react";
import { ROLE_LABEL, type RoleKey } from "@/lib/chat";
import { ImageLightbox } from "@/components/image-lightbox";
import { signPrivateUrl } from "@/lib/secure-storage";

export interface PhotoAlertCase {
  id: string;
  case_code: string;
  patient_name: string;
  doctor_slot: number;
  final_archived?: boolean | null;
  before_photo_path?: string | null;
  before_photo_name?: string | null;
  before_photo_sent_at?: string | null;
  after_photo_path?: string | null;
  after_photo_name?: string | null;
  after_photo_sent_at?: string | null;
}

type Phase = "before" | "after";

/** Resolve the branch secretary role for the case's doctor. */
async function branchSecretary(slot: number): Promise<RoleKey | null> {
  const { data } = await supabase.from("doctor_profiles")
    .select("branch").eq("slot", slot).maybeSingle();
  const branch = (data as { branch?: string | null } | null)?.branch;
  if (branch === "sanaa") return "secretary_sanaa";
  if (branch === "ibb") return "secretary_ibb";
  return null;
}

/** Find (or create) the doctor↔secretary conversation for this doctor slot. */
async function ensureSecretaryConv(slot: number, secretary: RoleKey, doctorName: string): Promise<string | null> {
  const { data: existing } = await supabase.from("chat_conversations")
    .select("id,participants").eq("doctor_slot", slot);
  const conv = (existing ?? []).find((x: any) =>
    Array.isArray(x.participants) && x.participants.length === 2
    && x.participants.includes("doctor") && x.participants.includes(secretary)
  ) as { id: string } | undefined;
  if (conv) return conv.id;
  const { data: created } = await supabase.from("chat_conversations")
    .insert({
      doctor_slot: slot,
      participants: ["doctor", secretary],
      title: `حالات ${doctorName} — ${ROLE_LABEL[secretary]}`,
      created_by: "doctor",
    }).select("id").single();
  return created?.id ?? null;
}

/**
 * Doctor-facing reminder + sender for the patient's clinical photos:
 *  • "before" photo (pre-treatment) — requested as soon as the case exists.
 *  • "after"  photo (post-treatment) — requested once the case is finally archived.
 * Both are uploaded and delivered straight to the branch secretary's chat.
 */
export function PatientPhotoAlerts({ c, actorName, doctorName }: {
  c: PhotoAlertCase; actorName: string; doctorName: string;
}) {
  const archived = !!c.final_archived;
  const beforeSent = !!c.before_photo_sent_at;
  const afterSent = !!c.after_photo_sent_at;

  const needBefore = !beforeSent;
  const needAfter = archived && !afterSent;
  if (!needBefore && !needAfter && !beforeSent && !afterSent) return null;

  return (
    <div className="space-y-2">
      {needBefore && <PhotoAlertCard c={c} phase="before" actorName={actorName} doctorName={doctorName} />}
      {beforeSent && <SentBadge c={c} phase="before" />}
      {needAfter && <PhotoAlertCard c={c} phase="after" actorName={actorName} doctorName={doctorName} />}
      {afterSent && <SentBadge c={c} phase="after" />}
    </div>
  );
}

const LABEL: Record<Phase, string> = {
  before: "صورة حالة أسنان المريض قبل التجميل",
  after: "صورة حالة المريض بعد التجميل",
};

function PhotoAlertCard({ c, phase, actorName, doctorName }: {
  c: PhotoAlertCase; phase: Phase; actorName: string; doctorName: string;
}) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const tone = phase === "before"
    ? "border-sky-500/60 bg-sky-50/70 text-sky-900"
    : "border-emerald-500/60 bg-emerald-50/70 text-emerald-900";
  const btnTone = phase === "before" ? "bg-sky-600" : "bg-emerald-600";

  async function send(file: File) {
    if (!file.type.startsWith("image/")) { toast.error("الرجاء اختيار صورة"); return; }
    setBusy(true);
    try {
      const secretary = await branchSecretary(c.doctor_slot);
      if (!secretary) { toast.error("لم يتم تحديد فرع الطبيب — تواصل مع الإدارة"); setBusy(false); return; }

      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${c.doctor_slot}/patient-photos/${phase}-${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage.from("chat-attachments")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const conv = await ensureSecretaryConv(c.doctor_slot, secretary, doctorName);
      if (!conv) throw new Error("تعذر إنشاء محادثة السكرتارية");

      const head = phase === "before"
        ? "📷 صورة حالة الأسنان قبل التجميل"
        : "✨ صورة حالة المريض بعد التجميل (الحالة مؤرشفة)";
      const { error: msgErr } = await supabase.from("chat_messages").insert({
        conversation_id: conv,
        sender: "doctor",
        sender_name: actorName,
        content: `${head}\nالحالة ${c.case_code} — المريض: ${c.patient_name}`,
        message_type: "image",
        attachment_path: path,
        attachment_name: file.name,
        attachment_mime: file.type,
        attachment_size: file.size,
      });
      if (msgErr) throw msgErr;

      const patch = phase === "before"
        ? { before_photo_path: path, before_photo_name: file.name, before_photo_sent_at: new Date().toISOString() }
        : { after_photo_path: path, after_photo_name: file.name, after_photo_sent_at: new Date().toISOString() };
      const { error } = await supabase.from("slot_cases").update(patch as any).eq("id", c.id);
      if (error) throw error;

      // Auto-forward the photo to the clinic's Telegram group (fire-and-forget).
      try {
        const signedUrl = await signPrivateUrl("chat-attachments", path, 60 * 60 * 24 * 365);
        if (signedUrl) {
          const { autoSendFileToTelegram } = await import("@/lib/telegram-auto");
          autoSendFileToTelegram({
            kind: "image",
            from: `الطبيب (${actorName}) — ${LABEL[phase]}`,
            caseCode: c.case_code, patientName: c.patient_name, caseId: c.id,
            url: signedUrl, filename: file.name,
          });
        }
      } catch { /* telegram failure must not block the flow */ }

      toast.success(`تم إرسال ${LABEL[phase]} إلى ${ROLE_LABEL[secretary]}`);
    } catch (e: any) {
      toast.error(e?.message || "فشل إرسال الصورة");
    }
    setBusy(false);
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault(); setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) void send(f);
      }}
      className={`rounded-xl border p-3 space-y-2 animate-in fade-in ${tone} ${drag ? "ring-2 ring-gold" : ""}`}
    >
      <div className="flex items-center gap-2 text-xs font-bold">
        <span className="relative inline-flex">
          <BellRing className="size-4" />
          <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-destructive animate-ping" />
        </span>
        <span>تنبيه: مطلوب إرسال {LABEL[phase]} إلى سكرتارية المركز</span>
      </div>
      <div className="text-[11px] opacity-80">
        {phase === "before"
          ? "التقط أو اختر صورة توضح حالة أسنان المريض قبل بدء العلاج، وسترسل مباشرة إلى سكرتارية فرعك."
          : "الحالة أُرشفت نهائياً — أرسل صورة النتيجة النهائية للمريض بعد التجميل إلى سكرتارية فرعك."}
      </div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void send(f); }} />
      <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}
        className={`inline-flex items-center gap-2 rounded-lg ${btnTone} text-white px-3 py-2 text-xs font-bold shadow disabled:opacity-60`}>
        {busy ? <Loader2 className="size-3.5 animate-spin" />
          : phase === "before" ? <Camera className="size-3.5" /> : <Sparkles className="size-3.5" />}
        {busy ? "جارٍ الإرسال…" : `إرسال ${LABEL[phase]}`}
      </button>
    </div>
  );
}

function SentBadge({ c, phase }: { c: PhotoAlertCase; phase: Phase }) {
  const path = phase === "before" ? c.before_photo_path : c.after_photo_path;
  const name = (phase === "before" ? c.before_photo_name : c.after_photo_name) || "صورة";
  const at = phase === "before" ? c.before_photo_sent_at : c.after_photo_sent_at;
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!path) return;
      const signed = await signPrivateUrl("chat-attachments", path, 3600);
      if (alive) setUrl(signed);
    })();
    return () => { alive = false; };
  }, [path]);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-emerald-500/50 bg-emerald-50/60 px-2 py-1.5">
      {url && (
        <button type="button" onClick={() => setOpen(true)} className="shrink-0">
          <img src={url} alt={name} className="size-9 rounded-md object-cover border border-border" />
        </button>
      )}
      <div className="text-[11px] font-bold text-emerald-800 flex items-center gap-1">
        <Check className="size-3.5" />
        تم إرسال {LABEL[phase]} للسكرتارية
        {at && <span className="font-mono opacity-70">{new Date(at).toLocaleDateString("ar-EG")}</span>}
      </div>
      {open && url && (
        <ImageLightbox images={[{ url, name }]} index={0} onIndexChange={() => {}} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}
