import { parseTrustedStorageUrl, validateStorageObject } from "./storage-destination";

// Shared by staff screens and permanent deletion; never imported by components.
export async function visibleRevisionRounds(db: any, slots: number[] | null) {
  let cases = db.from("slot_cases").select("id").is("trashed_at", null);
  if (slots) cases = cases.in("doctor_slot", slots);
  const active = await cases;
  if (active.error) throw new Error(active.error.message);
  const ids = (active.data ?? []).map((row: { id: string }) => row.id);
  if (!ids.length) return [];
  const rounds = await db.from("case_revision_rounds").select("*")
    .in("case_id", ids).order("requested_at", { ascending: false });
  if (rounds.error) throw new Error(rounds.error.message);
  return rounds.data ?? [];
}

/** Keep all references until storage cleanup succeeds so failures can be retried. */
export async function deleteCaseRecords(db: any, ids: string[], storageOrigin: string) {
  const [cases, rounds] = await Promise.all([
    db.from("slot_cases").select("*").in("id", ids),
    db.from("case_revision_rounds").select("rar_path,html_path").in("case_id", ids),
  ]);
  if (cases.error || rounds.error) throw new Error(cases.error?.message ?? rounds.error.message);
  const objects = new Map<string, Set<string>>();
  const add = (value: unknown, fallbackBucket: string) => {
    if (typeof value !== "string" || !value) return;
    const object = /^https?:\/\//i.test(value)
      ? parseTrustedStorageUrl(value, storageOrigin)
      : validateStorageObject(fallbackBucket, value);
    const paths = objects.get(object.bucket) ?? new Set<string>();
    paths.add(object.path);
    objects.set(object.bucket, paths);
  };
  for (const row of cases.data ?? []) {
    add(row.scan_path, "case-files");
    for (const field of ["revision_design_file_path", "design_html_path", "extra_zip_path",
      "before_photo_path", "after_photo_path", "archive_receipt_path"]) add(row[field], "chat-attachments");
    for (const image of Array.isArray(row.notes_images) ? row.notes_images : []) {
      add(typeof image === "string" ? image : image?.path ?? image?.url, "chat-attachments");
    }
  }
  for (const round of rounds.data ?? []) {
    add(round.rar_path, "chat-attachments");
    add(round.html_path, "chat-attachments");
  }
  for (const [bucket, paths] of objects) {
    const result = await db.storage.from(bucket).remove([...paths]);
    if (result.error) throw new Error(result.error.message);
  }
  // These logs do not have a cascading parent relationship.
  for (const table of ["case_revision_rounds", "file_activity"]) {
    const result = await db.from(table).delete().in("case_id", ids);
    if (result.error) throw new Error(result.error.message);
  }
  const result = await db.from("slot_cases").delete().in("id", ids);
  if (result.error) throw new Error(result.error.message);
}