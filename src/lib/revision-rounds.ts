import {
  revisionRoundOpen,
  revisionRoundAttach,
  revisionRoundList,
} from "@/lib/secure-ops.functions";

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
    await revisionRoundOpen({ data: input });
  } catch { /* tracking must never block the workflow */ }
}

/** Attach the designer's response (modified .rar or .html) to the latest round. */
export async function attachToLatestRound(
  caseId: string,
  patch: { rar_path?: string; rar_name?: string; html_path?: string; html_name?: string },
): Promise<void> {
  try {
    await revisionRoundAttach({ data: { caseId, patch } });
  } catch { /* ignore */ }
}

/** All recorded rounds, newest first. */
export async function listRevisionRounds(): Promise<RevisionRound[]> {
  try {
    return (await revisionRoundList()) as RevisionRound[];
  } catch {
    return [];
  }
}
