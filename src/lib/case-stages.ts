import { supabase } from "@/integrations/supabase/client";
import type { RoleKey } from "@/lib/chat";

export type CaseStage =
  | "new" | "designer" | "design_done"
  | "technician" | "fab_done" | "delivered";

export interface StageInfo {
  key: CaseStage;
  label: string;
  percent: number;
  ownerRole: RoleKey | null;
}

export const STAGES: StageInfo[] = [
  { key: "new",         label: "حالة جديدة",   percent: 8,   ownerRole: "designer" },
  { key: "designer",    label: "قيد التصميم",  percent: 25,  ownerRole: "designer" },
  { key: "design_done", label: "تم التصميم",   percent: 45,  ownerRole: "designer" },
  { key: "technician",  label: "قيد التصنيع",  percent: 65,  ownerRole: "technician" },
  { key: "fab_done",    label: "تم التصنيع",   percent: 85,  ownerRole: "technician" },
  { key: "delivered",   label: "تم الترحيل",   percent: 100, ownerRole: null },
];

export function getStage(key: string | null | undefined): StageInfo {
  return STAGES.find(s => s.key === key) ?? STAGES[0];
}

export function nextStage(key: string | null | undefined): StageInfo | null {
  const i = STAGES.findIndex(s => s.key === key);
  if (i < 0 || i >= STAGES.length - 1) return null;
  return STAGES[i + 1];
}

/** Derive the visible stage from boolean flags on a case row. */
export function deriveStageKey(c: {
  status?: string | null;
  design_done?: boolean | null;
  design_file_sent?: boolean | null;
  design_html_sent?: boolean | null;
  design_received_by_tech?: boolean | null;
  fabrication_done?: boolean | null;
  fabrication_file_sent?: boolean | null;
  tech_data_sent_to_secretary?: boolean | null;
  shipped_to_doctor?: boolean | null;
}): CaseStage {
  if (c.shipped_to_doctor) return "delivered";
  if (c.fabrication_done || c.tech_data_sent_to_secretary) return "fab_done";
  if (c.design_received_by_tech) return "technician";
  if (c.design_done && c.design_file_sent && c.design_html_sent) return "design_done";
  if (c.status === "new" && !c.design_done) return "new";
  return "designer";
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
