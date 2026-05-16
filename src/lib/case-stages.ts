import { supabase } from "@/integrations/supabase/client";
import type { RoleKey } from "@/lib/chat";

export type CaseStage =
  | "new" | "designer" | "design_done"
  | "technician" | "temp_done" | "temp_shipped"
  | "doctor_review" | "revision" | "revision_done" | "approved"
  | "permanent_fab" | "permanent_done" | "permanent_shipped"
  | "perm_received" | "installed"
  | "final_archived";

export interface StageInfo {
  key: CaseStage;
  label: string;
  percent: number;
  ownerRole: RoleKey | null;
}

export const STAGES: StageInfo[] = [
  { key: "new",               label: "حالة جديدة",         percent: 5,   ownerRole: "designer" },
  { key: "designer",          label: "قيد التصميم",        percent: 12,  ownerRole: "designer" },
  { key: "design_done",       label: "تم التصميم",         percent: 19,  ownerRole: "designer" },
  { key: "technician",        label: "قيد النحت",          percent: 26,  ownerRole: "technician" },
  { key: "temp_done",         label: "تم نحت المؤقت",      percent: 33,  ownerRole: "technician" },
  { key: "temp_shipped",      label: "تم إرسال المؤقت",    percent: 40,  ownerRole: "doctor" },
  { key: "doctor_review",     label: "قيد المراجعة",       percent: 47,  ownerRole: "doctor" },
  { key: "revision",          label: "يتطلب تعديل",        percent: 54,  ownerRole: "designer" },
  { key: "revision_done",     label: "تم اعتماد التعديل",  percent: 61,  ownerRole: "technician" },
  { key: "approved",          label: "اعتماد نهائي",       percent: 61,  ownerRole: "technician" },
  { key: "permanent_fab",     label: "قيد نحت الدائم",     percent: 68,  ownerRole: "technician" },
  { key: "permanent_done",    label: "تم نحت الدائم",      percent: 75,  ownerRole: null },
  { key: "permanent_shipped", label: "تم إرسال الدائم",    percent: 83,  ownerRole: "secretary_sanaa" },
  { key: "perm_received",     label: "تم استلام الدائم",   percent: 91,  ownerRole: "doctor" },
  { key: "installed",         label: "تم التركيب",         percent: 97,  ownerRole: null },
  { key: "final_archived",    label: "مؤرشف نهائياً",      percent: 100, ownerRole: null },
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
  secretary_received?: boolean | null;
  shipped_to_doctor?: boolean | null;
  temporary_delivered?: boolean | null;
  doctor_decision?: string | null;
  revision_design_done?: boolean | null;
  revision_approved_by_tech?: boolean | null;
  permanent_fabrication_done?: boolean | null;
  permanent_shipped_to_secretary?: boolean | null;
  permanent_delivered_to_doctor?: boolean | null;
  permanent_received_by_secretary?: boolean | null;
  permanent_installed_by_doctor?: boolean | null;
  final_archived?: boolean | null;
}): CaseStage {
  if (c.final_archived) return "final_archived";
  if (c.permanent_installed_by_doctor) return "installed";
  if (c.permanent_received_by_secretary) return "perm_received";
  if (c.permanent_delivered_to_doctor) return "permanent_shipped";
  if (c.permanent_shipped_to_secretary) return "permanent_shipped";
  if (c.permanent_fabrication_done) return "permanent_done";
  if (c.revision_approved_by_tech) return "permanent_fab";
  if (c.doctor_decision === "approved") {
    return "approved";
  }
  if (c.revision_design_done) return "revision_done";
  if (c.doctor_decision === "revision") return "revision";
  if (c.temporary_delivered) return "doctor_review";
  if (c.shipped_to_doctor) return "temp_shipped";
  if (c.fabrication_done || c.tech_data_sent_to_secretary) return "temp_done";
  if (c.design_received_by_tech) return "technician";
  if (c.design_done && c.design_file_sent && c.design_html_sent) return "design_done";
  if (c.status === "new" && !c.design_done) return "new";
  return "designer";
}

/**
 * Ensure a chat conversation exists between the doctor and a target role,
 * then post an automated case-handoff message.
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
    path: string;
    name: string;
    mime?: string | null;
    size?: number | null;
  } | null;
}) {
  const { doctorSlot, doctorName, targetRole, caseCode, patientName, stageLabel, body, attachment } = opts;
  const participants: RoleKey[] = ["doctor", targetRole];
  const title = `حالة ${caseCode} — ${doctorName}`;

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
