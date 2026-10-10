import { supabase } from "@/integrations/supabase/client";

export type RoleKey = "doctor" | "designer" | "technician" | "secretary_sanaa" | "secretary_ibb" | "admin";

export const ROLE_LABEL: Record<RoleKey, string> = {
  doctor: "الطبيب",
  designer: "المصمم",
  technician: "الفني",
  secretary_sanaa: "سكرتارية صنعاء",
  secretary_ibb: "سكرتارية إب",
  admin: "الإدارة",
};

export const ROLE_COLOR: Record<RoleKey, string> = {
  doctor: "gradient-brown text-primary-foreground",
  designer: "bg-gold/90 text-gold-foreground",
  technician: "bg-blue-600 text-white",
  secretary_sanaa: "bg-emerald-600 text-white",
  secretary_ibb: "bg-teal-600 text-white",
  admin: "bg-rose-700 text-white",
};

export const ROLE_BORDER: Record<RoleKey, string> = {
  doctor: "border-primary",
  designer: "border-gold",
  technician: "border-blue-600",
  secretary_sanaa: "border-emerald-600",
  secretary_ibb: "border-teal-600",
  admin: "border-rose-700",
};

export const STAFF_ROLES: RoleKey[] = ["designer", "technician", "admin"];

// Hardcoded gate passwords for staff portals (consistent with doctor portal pattern).
export const STAFF_PASSWORDS: Record<Exclude<RoleKey, "doctor">, string> = {
  designer: "mcadcam",
  technician: "fcadcam",
  secretary_sanaa: "sanaacadcam",
  secretary_ibb: "ibbcadcam",
  admin: "ZirconCadCam1979",
};

export interface ChatConversation {
  id: string;
  doctor_slot: number;
  participants: RoleKey[];
  title: string | null;
  archived: boolean;
  created_by: string;
  last_message_at: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender: RoleKey;
  sender_name: string | null;
  content: string;
  message_type: "text" | "file" | "audio";
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  attachment_mime: string | null;
  read_by: RoleKey[];
  created_at: string;
}

export const ATTACHMENTS_BUCKET = "chat-attachments";

/** Generate a short-lived signed URL just-in-time for download/preview. */
export async function getSignedUrl(path: string, seconds = 300): Promise<string | null> {
  const { signPrivateUrl } = await import("@/lib/secure-storage");
  return signPrivateUrl(ATTACHMENTS_BUCKET, path, seconds);
}

export function summarizeParticipants(participants: RoleKey[]): string {
  return participants.map(p => ROLE_LABEL[p]).join(" • ");
}
