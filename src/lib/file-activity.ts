/**
 * Per-case file activity log — records upload/download operations so each case
 * keeps a small history of who moved which file and when.
 */
import { supabase } from "@/integrations/supabase/client";

export type FileAction = "upload" | "download";
export type FileActStatus = "done" | "failed" | "canceled";

export interface FileActivityRow {
  id: string;
  case_id: string;
  action: FileAction;
  file_name: string;
  status: FileActStatus;
  actor: string | null;
  actor_role: string | null;
  size_bytes: number | null;
  created_at: string;
}

/** Insert a file activity record. Never throws — logging must not break flows. */
export async function logFileActivity(input: {
  caseId: string;
  action: FileAction;
  fileName: string;
  status?: FileActStatus;
  actor?: string | null;
  actorRole?: string | null;
  sizeBytes?: number | null;
}): Promise<void> {
  if (!input.caseId) return;
  try {
    await supabase.from("file_activity").insert({
      case_id: input.caseId,
      action: input.action,
      file_name: input.fileName || "ملف",
      status: input.status ?? "done",
      actor: input.actor ?? null,
      actor_role: input.actorRole ?? null,
      size_bytes: input.sizeBytes ?? null,
    });
  } catch {
    /* logging is best-effort */
  }
}

/** Fetch the most recent file operations for a case. */
export async function fetchFileActivity(caseId: string, limit = 30): Promise<FileActivityRow[]> {
  if (!caseId) return [];
  const { data } = await supabase
    .from("file_activity")
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as FileActivityRow[];
}
