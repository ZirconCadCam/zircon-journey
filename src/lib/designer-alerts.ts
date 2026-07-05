/**
 * Designer-side "doctor case update" alert tracking.
 *
 * The designer portal needs a professional, persistent notification layer that
 * lights up (audio + visual + badges) whenever a DOCTOR creates or edits a
 * case. This module owns the durable "seen" bookkeeping so the alert badges
 * survive refreshes / re-logins and only clear when the designer actually looks
 * at the case.
 *
 * A "signature" is a stable string built ONLY from doctor-owned fields (patient
 * data, notes, attached scan, attached images…). This way the designer's own
 * workflow actions (marking a design done, sending the .rar, etc.) never make a
 * case look "updated by the doctor".
 */

const KEY = "zircon_designer_seen_v2";

export interface SeenMap {
  [caseId: string]: string;
}

export interface SignatureInput {
  id: string;
  created_at?: string | null;
  patient_name?: string | null;
  patient_phone?: string | null;
  patient_age?: number | null;
  patient_gender?: string | null;
  tooth_number?: string | null;
  teeth_count?: string | null;
  shade?: string | null;
  case_type?: string | null;
  notes?: string | null;
  scan_path?: string | null;
  notes_images?: { url: string; name: string }[] | null;
}

/** Build a stable signature from the doctor-editable fields of a case. */
export function caseSignature(c: SignatureInput): string {
  const imgs = Array.isArray(c.notes_images)
    ? c.notes_images.map((i) => i?.url ?? i?.name ?? "").join(",")
    : "";
  return [
    c.created_at ?? "",
    c.patient_name ?? "",
    c.patient_phone ?? "",
    c.patient_age ?? "",
    c.patient_gender ?? "",
    c.tooth_number ?? "",
    c.teeth_count ?? "",
    c.shade ?? "",
    c.case_type ?? "",
    (c.notes ?? "").trim(),
    c.scan_path ?? "",
    imgs,
  ].join("|");
}

export function loadSeen(): SeenMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SeenMap) : {};
  } catch {
    return {};
  }
}

export function saveSeen(map: SeenMap): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* noop */
  }
}

/** True once a baseline has been stored (i.e. the designer has used the app). */
export function hasBaseline(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(KEY) != null;
}
