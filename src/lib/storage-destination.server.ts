import { parseTrustedStorageUrl } from "./storage-destination";

export function storageOrigin(): string {
  const origin = process.env["SUPABASE_URL"] || import.meta.env.VITE_SUPABASE_URL;
  if (!origin) throw new Error("إعداد التخزين غير موجود");
  return origin;
}

export function assertStorageUrl(value: string) {
  return parseTrustedStorageUrl(value, storageOrigin());
}

/** Never follow redirects to caller-controlled hosts, including on fallback. */
export async function fetchStorageFile(value: string): Promise<Response> {
  assertStorageUrl(value);
  const response = await fetch(value, { redirect: "error", signal: AbortSignal.timeout(60_000) });
  return response;
}