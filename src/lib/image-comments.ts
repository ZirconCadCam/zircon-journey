import { supabase } from "@/integrations/supabase/client";
import type { RoleKey } from "@/lib/chat";

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
  const prefix = `[${opts.caseCode}]`;
  const { data: existing } = await supabase.from("chat_conversations")
    .select("id,participants,title").eq("doctor_slot", opts.doctorSlot);
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
        doctor_slot: opts.doctorSlot,
        participants: ["doctor", "designer", "technician"],
        title: `${prefix} ${opts.patientName}`,
        created_by: opts.authorRole,
      }).select("id").single();
    convId = created?.id;
  }
  if (!convId) return;

  await supabase.from("chat_messages").insert({
    conversation_id: convId,
    sender: opts.authorRole,
    sender_name: opts.authorName,
    content: `💬 تعليق على صورة (${opts.imageName}) — الحالة ${opts.caseCode}\n${opts.comment}`,
    message_type: "text",
  });
}
