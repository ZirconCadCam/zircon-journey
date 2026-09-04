import { supabase } from "@/integrations/supabase/client";

/** One recorded revision round for a case (doctor request + designer response). */
export interface RevisionRound {
  id: string;
  case_id: string;
  case_code: string | null;
  patient_name: string | null;
  doctor_slot: number | null;
  doctor_name: string | null;
  round: number;
  doctor_notes: string | null;
  shade: string | null;
  requested_at: string;
  rar_path: string | null;
  rar_name: string | null;
  rar_sent_at: string | null;
  html_path: string | null;
  html_name: string | null;
  html_sent_at: string | null;
}

const db = () => (supabase as any).from("case_revision_rounds");

/** Open a new revision round when the doctor requests changes. */
export async function openRevisionRound(input: {
  caseId: string;
  caseCode?: string | null;
  patientName?: string | null;
  doctorSlot?: number | null;
  doctorName?: string | null;
  notes?: string | null;
  shade?: string | null;
}): Promise<void> {
  try {
    const { count } = await db()
      .select("id", { count: "exact", head: true })
      .eq("case_id", input.caseId);
    await db().insert({
      case_id: input.caseId,
      case_code: input.caseCode ?? null,
      patient_name: input.patientName ?? null,
      doctor_slot: input.doctorSlot ?? null,
      doctor_name: input.doctorName ?? null,
      round: (count ?? 0) + 1,
      doctor_notes: input.notes ?? null,
      shade: input.shade ?? null,
    });
  } catch { /* tracking must never block the workflow */ }
}

/** Attach the designer's response (modified .rar or .html) to the latest round. */
export async function attachToLatestRound(
  caseId: string,
  patch: { rar_path?: string; rar_name?: string; html_path?: string; html_name?: string },
): Promise<void> {
  try {
    const { data } = await db()
      .select("id")
      .eq("case_id", caseId)
      .order("round", { ascending: false })
      .limit(1);
    const id = (data ?? [])[0]?.id as string | undefined;
    if (!id) return;
    const now = new Date().toISOString();
    await db().update({
      ...patch,
      ...(patch.rar_path ? { rar_sent_at: now } : {}),
      ...(patch.html_path ? { html_sent_at: now } : {}),
    }).eq("id", id);
  } catch { /* ignore */ }
}

/** All recorded rounds, newest first. */
export async function listRevisionRounds(): Promise<RevisionRound[]> {
  const { data } = await db()
    .select("*")
    .order("requested_at", { ascending: false });
  return (data ?? []) as RevisionRound[];
}
