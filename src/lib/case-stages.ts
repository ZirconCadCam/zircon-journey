import { supabase } from "@/integrations/supabase/client";
import type { RoleKey } from "@/lib/chat";

export type CaseStage = "new" | "designer" | "technician" | "ready" | "delivered";

export interface StageInfo {
  key: CaseStage;
  label: string;
  percent: number;
  /** The role that becomes responsible at this stage (used for routing notifications). */
  ownerRole: RoleKey | null;
}

export const STAGES: StageInfo[] = [
  { key: "new",        label: "حالة جديدة",        percent: 10,  ownerRole: "designer" },
  { key: "designer",   label: "قيد التصميم",       percent: 35,  ownerRole: "designer" },
  { key: "technician", label: "قيد التصنيع",       percent: 60,  ownerRole: "technician" },
  { key: "ready",      label: "جاهزة للتسليم",     percent: 85,  ownerRole: "secretary_sanaa" },
  { key: "delivered",  label: "تم التسليم",        percent: 100, ownerRole: null },
];

export function getStage(key: string | null | undefined): StageInfo {
  return STAGES.find(s => s.key === key) ?? STAGES[0];
}

export function nextStage(key: string | null | undefined): StageInfo | null {
  const i = STAGES.findIndex(s => s.key === key);
  if (i < 0 || i >= STAGES.length - 1) return null;
  return STAGES[i + 1];
}

/**
 * Ensure a chat conversation exists between the doctor and a target role,
 * then post an automated case-handoff message. This piggy-backs on the
 * existing chat-notification system, which beeps + shows toasts + browser
 * notifications to recipients.
 */
export async function notifyRoleAboutCase(opts: {
  doctorSlot: number;
  doctorName: string;
  targetRole: RoleKey;
  caseCode: string;
  patientName: string;
  stageLabel: string;
  body?: string;
  attachment?: {
    path: string;        // public URL or storage path
    name: string;
    mime?: string | null;
    size?: number | null;
  } | null;
}) {
  const { doctorSlot, doctorName, targetRole, caseCode, patientName, stageLabel, body, attachment } = opts;
  const participants: RoleKey[] = ["doctor", targetRole];
  const title = `حالة ${caseCode} — ${doctorName}`;

  // Try to reuse an existing conversation between the doctor and that role.
  const { data: existing } = await supabase.from("chat_conversations")
    .select("id,participants")
    .eq("doctor_slot", doctorSlot);
  let conv = (existing ?? []).find((c: any) =>
    Array.isArray(c.participants) &&
    c.participants.includes("doctor") &&
    c.participants.includes(targetRole) &&
    c.participants.length === 2
  ) as { id: string } | undefined;

  if (!conv) {
    const { data: created, error } = await supabase.from("chat_conversations")
      .insert({ doctor_slot: doctorSlot, participants, title, created_by: "doctor" })
      .select("id").single();
    if (error || !created) return;
    conv = created;
  }

  const content = body
    ?? `📋 ${stageLabel}\nرمز الحالة: ${caseCode}\nالمريض: ${patientName}\nمن: ${doctorName}`;

  await supabase.from("chat_messages").insert({
    conversation_id: conv.id,
    sender: "doctor",
    sender_name: doctorName,
    content,
    message_type: attachment ? "file" : "text",
    attachment_path: attachment?.path ?? null,
    attachment_name: attachment?.name ?? null,
    attachment_mime: attachment?.mime ?? null,
    attachment_size: attachment?.size ?? null,
  });
}

/** Fire a browser-level notification when permission has been granted. */
export function localNotify(title: string, body?: string) {
  try {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body });
    }
  } catch { /* noop */ }
}
