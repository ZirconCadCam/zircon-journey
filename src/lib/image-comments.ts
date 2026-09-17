import { supabase } from "@/integrations/supabase/client";
import { ATTACHMENTS_BUCKET, type RoleKey } from "@/lib/chat";

/** A comment left by a team member (designer/technician) on an image the
 *  doctor attached to a case. Comments are stored on the case row and also
 *  mirrored into the per-case chat so they reach the doctor as a reply. */
export interface NoteImageComment {
  image_url: string;
  author_role: string;
  author_name: string;
  comment: string;
  created_at: string;
}

/** Append a comment to a case's notes_image_comments array (read-modify-write). */
export async function addImageComment(
  caseId: string,
  entry: NoteImageComment,
): Promise<NoteImageComment[]> {
  const { data } = await supabase.from("slot_cases")
    .select("notes_image_comments").eq("id", caseId).maybeSingle();
  const prev = Array.isArray((data as any)?.notes_image_comments)
    ? ((data as any).notes_image_comments as NoteImageComment[])
    : [];
  const next = [...prev, entry];
  const { error } = await supabase.from("slot_cases")
    .update({ notes_image_comments: next as any }).eq("id", caseId);
  if (error) throw error;
  return next;
}

/** Post the image comment into the case-scoped doctor↔designer↔technician
 *  conversation (title starts with `[case_code]`) so the doctor receives it
 *  as a reply/notification tied to the image. */
export async function postImageCommentToChat(opts: {
  doctorSlot: number;
  caseCode: string;
  patientName: string;
  authorRole: RoleKey;
  authorName: string;
  imageName: string;
  comment: string;
}): Promise<void> {
  const convId = await resolveCaseConversation(opts.doctorSlot, opts.caseCode, opts.patientName, opts.authorRole);
  if (!convId) return;

  await supabase.from("chat_messages").insert({
    conversation_id: convId,
    sender: opts.authorRole,
    sender_name: opts.authorName,
    content: `💬 تعليق على صورة (${opts.imageName}) — الحالة ${opts.caseCode}\n${opts.comment}`,
    message_type: "text",
  });
}

/** Find (or create) the case-scoped doctor↔designer↔technician conversation. */
async function resolveCaseConversation(
  doctorSlot: number,
  caseCode: string,
  patientName: string,
  authorRole: RoleKey,
): Promise<string | undefined> {
  const prefix = `[${caseCode}]`;
  const { data: existing } = await supabase.from("chat_conversations")
    .select("id,participants,title").eq("doctor_slot", doctorSlot);
  let convId = (existing ?? []).find((x: any) =>
    Array.isArray(x.participants)
    && x.participants.includes("doctor")
    && x.participants.includes("designer")
    && x.participants.includes("technician")
    && typeof x.title === "string" && x.title.startsWith(prefix),
  )?.id as string | undefined;

  if (!convId) {
    const { data: created } = await supabase.from("chat_conversations")
      .insert({
        doctor_slot: doctorSlot,
        participants: ["doctor", "designer", "technician"],
        title: `${prefix} ${patientName}`,
        created_by: authorRole,
      }).select("id").single();
    convId = created?.id;
  }
  return convId;
}

/** Upload a recorded voice clip and post it to the case chat so the doctor
 *  receives it as a voice reply tied to the image. */
export async function postImageVoiceToChat(opts: {
  doctorSlot: number;
  caseCode: string;
  patientName: string;
  authorRole: RoleKey;
  authorName: string;
  imageName: string;
  blob: Blob;
  durationSec?: number;
}): Promise<void> {
  const convId = await resolveCaseConversation(opts.doctorSlot, opts.caseCode, opts.patientName, opts.authorRole);
  if (!convId) throw new Error("no conversation");

  const fileName = `voice-${Date.now()}.webm`;
  const path = `${opts.doctorSlot}/${convId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${fileName}`;
  const { error: upErr } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(path, opts.blob, { contentType: opts.blob.type || "audio/webm", upsert: false });
  if (upErr) throw upErr;

  const secs = opts.durationSec ? ` (${opts.durationSec}s)` : "";
  const { error } = await supabase.from("chat_messages").insert({
    conversation_id: convId,
    sender: opts.authorRole,
    sender_name: opts.authorName,
    content: `🎤 تسجيل صوتي على صورة (${opts.imageName}) — الحالة ${opts.caseCode}${secs}`,
    message_type: "audio",
    attachment_path: path,
    attachment_name: fileName,
    attachment_mime: opts.blob.type || "audio/webm",
    attachment_size: opts.blob.size,
  });
  if (error) throw error;

  // Mirror the voice note to the clinic's Telegram group.
  const { queueTelegram } = await import("@/lib/telegram-outbox");
  void queueTelegram(
    `🎤 إرسال تلقائي — تسجيل صوتي على صورة\n──────────────\n👤 المريض: ${opts.patientName}\n🔖 رقم الحالة: ${opts.caseCode}\n📤 المصدر: ${opts.authorName}\n📁 الملف: ${fileName}`,
    [{ bucket: ATTACHMENTS_BUCKET, path, filename: fileName }],
  );
}
