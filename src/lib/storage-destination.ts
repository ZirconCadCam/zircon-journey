/** File forwarding may only read this application's configured storage. */
export const DELIVERY_BUCKETS = ["chat-attachments", "case-files", "doctor-files", "scans", "design"] as const;

export function validateStorageObject(bucket: string, path: string): { bucket: string; path: string } {
  if (!(DELIVERY_BUCKETS as readonly string[]).includes(bucket) || !path || path.length > 600 ||
    /[\\\u0000-\u001f]/.test(path) || /%(?:2e|2f|5c|00|25)/i.test(path) ||
    path.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("مصدر الملف غير مسموح");
  }
  return { bucket, path };
}

export function parseTrustedStorageUrl(value: string, configuredOrigin: string): { bucket: string; path: string } {
  const url = new URL(value);
  const origin = new URL(configuredOrigin);
  if (url.protocol !== "https:" || origin.protocol !== "https:" || url.origin !== origin.origin || url.username || url.password || url.hash) {
    throw new Error("مصدر الملف غير مسموح");
  }
  const match = url.pathname.match(/^\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/]+)\/(.+)$/);
  if (!match?.[1] || !match[2]) throw new Error("مصدر الملف غير مسموح");
  return validateStorageObject(decodeURIComponent(match[1]), decodeURIComponent(match[2]));
}