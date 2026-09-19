import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, X, Camera, Send, Archive, ImageIcon, Clock, Check, AlertTriangle } from "lucide-react";
import { ROLE_LABEL, type RoleKey } from "@/lib/chat";
import { ImageLightbox } from "@/components/image-lightbox";
import { signPrivateUrl } from "@/lib/secure-storage";

export interface ArchiveReceiptCase {
  id: string;
  case_code: string;
  patient_name: string;
  doctor_slot: number;
  archive_receipt_path?: string | null;
  archive_receipt_name?: string | null;
  archive_receipt_sent_at?: string | null;
  archive_request_note?: string | null;
  archive_approval?: string | null;
  archive_reviewed_at?: string | null;
  archive_reviewed_by?: string | null;
  archive_reject_reason?: string | null;
}

/** Find (or create) a two-party conversation for this doctor slot. */
async function ensureConv(slot: number, target: RoleKey, doctorName: string): Promise<string | null> {
  const { data: existing } = await supabase.from("chat_conversations")
    .select("id,participants").eq("doctor_slot", slot);
  const conv = (existing ?? []).find((x: any) =>
    Array.isArray(x.participants) && x.participants.length === 2
    && x.participants.includes("doctor") && x.participants.includes(target)
  ) as { id: string } | undefined;
  if (conv) return conv.id;
  const { data: created } = await supabase.from("chat_conversations")
    .insert({
      doctor_slot: slot,
      participants: ["doctor", target],
      title: `حالات ${doctorName} — ${ROLE_LABEL[target]}`,
      created_by: "doctor",
    }).select("id").single();
  return created?.id ?? null;
}

/**
 * Doctor-facing editor opened when confirming the permanent install:
 * the patient's account receipt photo (سند حساب المريض) is uploaded and sent to
 * the administration, which then approves or rejects the archiving request.
 */
export function ArchiveReceiptEditor({ c, actorName, doctorName, onClose, onSent }: {
  c: ArchiveReceiptCase; actorName: string; doctorName: string;
  onClose: () => void; onSent?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [remaining, setRemaining] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pick(f: File | undefined | null) {
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("الرجاء اختيار صورة سند الحساب"); return; }
    setFile(f);
  }

  async function submit() {
    if (busy) return;
    if (!file) { toast.error("أرفق صورة سند حساب المريض أولاً"); return; }
    setBusy(true);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${c.doctor_slot}/archive-receipts/${c.case_code}-${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage.from("chat-attachments")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const now = new Date().toISOString();
      const { error } = await supabase.from("slot_cases").update({
        permanent_installed_by_doctor: true,
        permanent_delivered_to_doctor: true,
        perm_ship_read_at: now,
        archive_receipt_path: path,
        archive_receipt_name: file.name,
        archive_receipt_mime: file.type,
        archive_receipt_size: file.size,
        archive_receipt_sent_at: now,
        archive_request_note: note.trim() || null,
        remaining_amount: remaining.trim() === "" ? null : Number(remaining),
        archive_approval: "pending",
        archive_reviewed_at: null,
        archive_reviewed_by: null,
        archive_reject_reason: null,
      } as any).eq("id", c.id);
      if (error) throw error;

      const conv = await ensureConv(c.doctor_slot, "admin", doctorName);
      if (conv) {
        await supabase.from("chat_messages").insert({
          conversation_id: conv, sender: "doctor", sender_name: actorName,
          content: `🗂️ طلب أرشفة الحالة ${c.case_code} — المريض: ${c.patient_name}\n🦷 تم تركيب الأسنان الدائمة.\n🧾 مرفق: صورة سند حساب المريض${note.trim() ? `\n📝 ${note.trim()}` : ""}\nبانتظار موافقة الإدارة على الأرشفة.`,
          message_type: "image",
          attachment_path: path,
          attachment_name: file.name,
          attachment_mime: file.type,
          attachment_size: file.size,
        });
      }

      // Mirror the receipt image to the clinic's Telegram group.
      {
        const { queueTelegram } = await import("@/lib/telegram-outbox");
        void queueTelegram(
          `🧾 إرسال تلقائي — سند حساب المريض\n──────────────\n👤 المريض: ${c.patient_name}\n🔖 رقم الحالة: ${c.case_code}\n🩺 الطبيب: ${doctorName}\n📤 المصدر: ${actorName}\n📁 الملف: ${file.name}`,
          [{ bucket: "chat-attachments", path, filename: file.name }],
        );
      }

      toast.success("✅ تم إرسال طلب الأرشفة مع سند الحساب إلى الإدارة");
      onSent?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "فشل إرسال طلب الأرشفة");
    }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto overscroll-contain rounded-2xl bg-card border border-border p-5 shadow-luxury">
        <div className="flex items-center justify-between mb-3">
          <div className="font-bold flex items-center gap-2">
            <Archive className="size-4 text-gold" /> طلب أرشفة الحالة
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted"><X className="size-4" /></button>
        </div>

        <div className="rounded-lg border border-amber-500/50 bg-amber-50/60 p-2.5 text-[11px] font-bold text-amber-900">
          لإتمام أرشفة الحالة {c.case_code} ({c.patient_name}) أرفق صورة <b>سند حساب المريض</b>؛
          سيتم إرسالها إلى الإدارة لاعتماد الأرشفة.
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
          className={`mt-3 rounded-xl border border-dashed p-3 text-center transition ${drag ? "border-gold bg-gold/10" : "border-input bg-background"}`}
        >
          {preview ? (
            <img src={preview} alt="سند الحساب" className="mx-auto max-h-56 rounded-lg object-contain border border-border" />
          ) : (
            <div className="text-[11px] text-muted-foreground flex flex-col items-center gap-2 py-3">
              <ImageIcon className="size-6 text-gold" />
              اسحب صورة سند الحساب هنا أو اخترها من الجهاز / الكاميرا
            </div>
          )}
          <input ref={inputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; pick(f); }} />
          <button type="button" onClick={() => inputRef.current?.click()}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gold/60 bg-gold/5 px-3 py-2 text-xs font-bold hover:bg-gold/10">
            <Camera className="size-3.5" /> {file ? "تغيير الصورة" : "اختيار صورة سند الحساب"}
          </button>
        </div>

        <div className="mt-3">
          <label className="text-[11px] font-bold mb-1 block">المبلغ المتبقي على المريض</label>
          <input value={remaining} onChange={(e) => setRemaining(e.target.value)} inputMode="decimal" placeholder="0"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-mono outline-none focus:border-gold" />
        </div>

        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
          placeholder="ملاحظة للإدارة (اختياري)…"
          className="mt-3 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs outline-none focus:border-gold resize-y" />

        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <button onClick={onClose} disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold hover:border-gold">
            <X className="size-3.5" /> إلغاء
          </button>
          <button onClick={submit} disabled={busy || !file}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 text-white px-3 py-2 text-xs font-bold shadow disabled:opacity-60">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            إرسال الطلب للإدارة
          </button>
        </div>
      </div>
    </div>
  );
}

/** Doctor-side status badge for the archiving request. */
export function ArchiveRequestStatus({ c }: { c: ArchiveReceiptCase }) {
  const status = c.archive_approval;
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const path = c.archive_receipt_path;

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!path) return;
      const signedUrl = await signPrivateUrl("chat-attachments", path, 3600);
      if (alive) setUrl(signedUrl);
    })();
    return () => { alive = false; };
  }, [path]);

  if (!status) return null;
  const tone = status === "approved" ? "border-emerald-500/60 bg-emerald-50/70 text-emerald-900"
    : status === "rejected" ? "border-rose-500/60 bg-rose-50/70 text-rose-900"
    : "border-amber-500/60 bg-amber-50/70 text-amber-900";
  const label = status === "approved" ? "وافقت الإدارة على الأرشفة"
    : status === "rejected" ? "لم توافق الإدارة على الأرشفة"
    : "بانتظار موافقة الإدارة على الأرشفة";
  const Icon = status === "approved" ? Check : status === "rejected" ? AlertTriangle : Clock;

  return (
    <div className={`rounded-xl border p-2.5 space-y-1.5 ${tone}`}>
      <div className="flex items-center gap-2 text-[11px] font-bold">
        <Icon className="size-3.5" /> {label}
        {c.archive_reviewed_at && <span className="font-mono opacity-70">{new Date(c.archive_reviewed_at).toLocaleString("ar")}</span>}
      </div>
      {status === "rejected" && c.archive_reject_reason && (
        <div className="text-[11px] whitespace-pre-wrap">سبب الرفض: {c.archive_reject_reason}</div>
      )}
      {url && (
        <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 text-[11px] font-bold">
          <img src={url} alt={c.archive_receipt_name ?? "سند الحساب"} className="size-10 rounded-md object-cover border border-border" />
          سند حساب المريض
        </button>
      )}
      {open && url && (
        <ImageLightbox images={[{ url, name: c.archive_receipt_name ?? "سند الحساب" }]} index={0}
          onIndexChange={() => {}} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}
