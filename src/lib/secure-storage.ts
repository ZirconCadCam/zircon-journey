/**
 * Client helpers for the private buckets ("chat-attachments", "case-files").
 *
 * These buckets no longer allow the browser to read or delete objects, so
 * download links and deletions are produced on the server after validation.
 */
import {
  signStoredUrl,
  removeStoredObjects,
  createPrivateUploadUrl,
} from "@/lib/secure-ops.functions";
import { supabase } from "@/integrations/supabase/client";

export type PrivateBucket = "chat-attachments" | "case-files";

/**
 * Upload a file into a private bucket through a server-minted upload ticket.
 * Direct browser uploads are rejected by the storage rules, so we ask the
 * server for a one-time token first and then push the bytes with it.
 */
export async function uploadPrivateFile(
  bucket: PrivateBucket,
  path: string,
  file: File | Blob,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const ticket = await createPrivateUploadUrl({ data: { bucket, path } });
    if (!ticket?.token) return { ok: false, error: ticket?.error ?? "تعذر تهيئة الرفع" };
    const { error } = await supabase.storage.from(bucket).uploadToSignedUrl(path, ticket.token, file);
    return { ok: !error, error: error?.message ?? null };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "تعذر رفع الملف" };
  }
}

/** Short-lived (or long-lived) signed download URL for a private object. */
export async function signPrivateUrl(
  bucket: PrivateBucket,
  path: string,
  seconds = 300,
): Promise<string | null> {
  try {
    const res = await signStoredUrl({ data: { bucket, path, seconds } });
    return res?.url ?? null;
  } catch {
    return null;
  }
}

/** Delete one or more objects from a private bucket. */
export async function removePrivateObjects(
  bucket: PrivateBucket,
  paths: string[],
): Promise<boolean> {
  try {
    const res = await removeStoredObjects({ data: { bucket, paths } });
    return !!res?.ok;
  } catch {
    return false;
  }
}
