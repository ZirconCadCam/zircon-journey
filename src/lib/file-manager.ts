/**
 * File Manager — unified device storage layer.
 *
 *  - On the Android (Capacitor) app: writes into the public Documents folder
 *    under "حالات مركز زركون/..." via @capacitor/filesystem (see native-fs.ts).
 *  - On the web: persists a user-chosen folder via the File System Access API
 *    and IndexedDB, falling back to a normal browser download when unsupported.
 */
import {
  isNativeApp,
  saveBlobNative,
  readBlobNative,
  getNativeUri,
  openNativeUri,
  saveAndOpenNative,
  checkNativePermission,
  requestNativePermission,
  ensureBaseStructure,
} from "@/lib/native-fs";
import type { CaseFileLocation } from "@/lib/case-folders";

export const CENTER_FOLDER_NAME = "مركز زركون CAD/CAM";

const DB_NAME = "zircon-cadcam-fm";
const STORE = "handles";
const KEY = "center-dir";

function isSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T = any>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result as T);
    r.onerror = () => reject(r.error);
  });
}
async function idbSet(key: string, value: any): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbDel(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function ensurePermission(handle: any, mode: "read" | "readwrite" = "readwrite"): Promise<boolean> {
  try {
    if ((await handle.queryPermission?.({ mode })) === "granted") return true;
    return (await handle.requestPermission?.({ mode })) === "granted";
  } catch {
    return false;
  }
}

/** Prompt the user once to pick a base folder; we then create the center subfolder inside. */
export async function pickCenterFolder(): Promise<boolean> {
  if (!isSupported()) return false;
  try {
    const base: any = await (window as any).showDirectoryPicker({ mode: "readwrite" });
    const center = await base.getDirectoryHandle(CENTER_FOLDER_NAME, { create: true });
    await idbSet(KEY, center);
    return true;
  } catch {
    return false;
  }
}

export async function getCenterFolder(): Promise<FileSystemDirectoryHandle | null> {
  const handle: any = await idbGet(KEY);
  if (!handle) return null;
  if (!(await ensurePermission(handle))) return null;
  return handle as FileSystemDirectoryHandle;
}

export async function clearCenterFolder(): Promise<void> {
  await idbDel(KEY);
}

export function fileManagerSupported(): boolean {
  return isSupported();
}

/* ---------------------------------------------------------------------------
 * Device-folder access status + permission helpers (Task 1)
 * ------------------------------------------------------------------------- */

export type CenterStatus = "unsupported" | "none" | "denied" | "ready";

/**
 * Report whether we can actually read/write the device center folder:
 *  - "unsupported": browser lacks the File System Access API
 *  - "none": API supported but no folder linked yet
 *  - "denied": a folder is linked but permission isn't granted
 *  - "ready": linked and permission granted
 */
export async function getCenterFolderStatus(): Promise<CenterStatus> {
  if (await isNativeApp()) {
    const p = await checkNativePermission();
    return p === "granted" ? "ready" : p === "denied" ? "denied" : "none";
  }
  if (!isSupported()) return "unsupported";
  const handle: any = await idbGet(KEY);
  if (!handle) return "none";
  try {
    const perm = await handle.queryPermission?.({ mode: "readwrite" });
    return perm === "granted" ? "ready" : "denied";
  } catch {
    return "denied";
  }
}

/** Re-request permission (or prompt to pick a folder if none linked yet). */
export async function requestCenterPermission(): Promise<boolean> {
  if (await isNativeApp()) {
    const ok = await requestNativePermission();
    if (ok) await ensureBaseStructure();
    return ok;
  }
  const handle: any = await idbGet(KEY);
  if (!handle) return pickCenterFolder();
  return ensurePermission(handle, "readwrite");
}

/* ---------------------------------------------------------------------------
 * Cache stats + clearing (Task 2)
 * ------------------------------------------------------------------------- */

export interface CacheStats {
  supported: boolean;
  linked: boolean;
  totalBytes: number;
  fileCount: number;
  types: { ext: string; count: number; bytes: number }[];
}

/** Walk the center folder and summarise total size + stored file types. */
export async function getCacheStats(): Promise<CacheStats> {
  const base: CacheStats = { supported: isSupported(), linked: false, totalBytes: 0, fileCount: 0, types: [] };
  if (!isSupported()) return base;
  const dir: any = await getCenterFolder();
  if (!dir) return base;

  const byExt = new Map<string, { count: number; bytes: number }>();
  let total = 0, count = 0;

  async function walk(handle: any) {
    for await (const [name, entry] of handle.entries()) {
      if (entry.kind === "file") {
        try {
          const f = await entry.getFile();
          total += f.size; count++;
          const ext = (name.match(/\.([a-zA-Z0-9]+)$/)?.[1] || "أخرى").toLowerCase();
          const cur = byExt.get(ext) || { count: 0, bytes: 0 };
          cur.count++; cur.bytes += f.size;
          byExt.set(ext, cur);
        } catch { /* skip unreadable */ }
      } else if (entry.kind === "directory") {
        await walk(entry);
      }
    }
  }
  try { await walk(dir); } catch { /* ignore */ }

  const types = [...byExt.entries()]
    .map(([ext, v]) => ({ ext, ...v }))
    .sort((a, b) => b.bytes - a.bytes);
  return { supported: true, linked: true, totalBytes: total, fileCount: count, types };
}

/** Delete every file/subfolder inside the center folder (keeps the link). */
export async function clearCenterCache(): Promise<{ removed: number }> {
  if (!isSupported()) return { removed: 0 };
  const dir: any = await getCenterFolder();
  if (!dir) return { removed: 0 };
  const entries: { name: string; kind: string }[] = [];
  try {
    for await (const [name, entry] of dir.entries()) entries.push({ name, kind: entry.kind });
  } catch { return { removed: 0 }; }
  let removed = 0;
  for (const e of entries) {
    try {
      await dir.removeEntry(e.name, { recursive: e.kind === "directory" });
      removed++;
    } catch { /* keep going */ }
  }
  return { removed };
}

/** Human-readable byte size. */
export function formatBytes(n: number): string {
  if (!n) return "0 ب";
  if (n < 1024) return `${n} ب`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} ك.ب`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} م.ب`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} ج.ب`;
}

/* ---------------------------------------------------------------------------
 * Automatic caching of received case files (Task 3)
 * ------------------------------------------------------------------------- */

/**
 * Silently store a received file into the device center folder when (and only
 * when) the folder is linked and permission is granted. Skips work if the file
 * is already cached. Never prompts the user and never throws.
 */
export async function autoCacheFile(
  remoteUrl: string,
  filename: string,
  subfolder: string,
): Promise<boolean> {
  if (!isSupported()) return false;
  if ((await getCenterFolderStatus()) !== "ready") return false;
  try {
    const existing = await readFromCenter(filename, subfolder);
    if (existing) return true;
    const res = await fetch(remoteUrl);
    if (!res.ok) return false;
    const blob = await res.blob();
    const r = await saveToCenter(blob, filename, subfolder);
    return r.saved && !r.fallback;
  } catch {
    return false;
  }
}

/** Fetch a remote URL straight to a blob URL (no device caching). */
export async function fetchRemoteBlobUrl(
  remoteUrl: string,
): Promise<{ url: string; revoke?: () => void }> {
  try {
    const res = await fetch(remoteUrl);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const blob = await res.blob();
    const u = URL.createObjectURL(blob);
    return { url: u, revoke: () => URL.revokeObjectURL(u) };
  } catch {
    return { url: remoteUrl };
  }
}

/**
 * Save a Blob to the chosen center folder (creates a subfolder if provided).
 * Returns true on success. If no folder is set or browser unsupported,
 * falls back to a normal download.
 */
export async function saveToCenter(
  blob: Blob,
  filename: string,
  subfolder?: string,
  location?: CaseFileLocation,
): Promise<{ saved: boolean; fallback: boolean; path?: string; uri?: string }> {
  // Native Android app: write into the taxonomy folders on the device.
  if (await isNativeApp()) {
    const loc: CaseFileLocation = location ?? { role: "admin", caseCode: subfolder };
    const r = await saveBlobNative(blob, filename, loc);
    if (r.saved) return { saved: true, fallback: false, path: r.path, uri: r.uri };
    fallbackDownload(blob, filename);
    return { saved: true, fallback: true };
  }
  if (!isSupported()) {
    fallbackDownload(blob, filename);
    return { saved: true, fallback: true };
  }
  let dir = await getCenterFolder();
  if (!dir) {
    const ok = await pickCenterFolder();
    if (!ok) {
      fallbackDownload(blob, filename);
      return { saved: true, fallback: true };
    }
    dir = await getCenterFolder();
    if (!dir) {
      fallbackDownload(blob, filename);
      return { saved: true, fallback: true };
    }
  }
  try {
    let target: any = dir;
    if (subfolder) target = await (target as any).getDirectoryHandle(subfolder, { create: true });
    const fileHandle = await (target as any).getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return { saved: true, fallback: false, path: `${CENTER_FOLDER_NAME}${subfolder ? "/" + subfolder : ""}/${filename}` };
  } catch {
    fallbackDownload(blob, filename);
    return { saved: true, fallback: true };
  }
}

/**
 * Save a case file using the full folder taxonomy (role/doctor/patient/case)
 * and return its native uri when on the device app.
 */
export async function saveCaseFile(
  blob: Blob,
  filename: string,
  location: CaseFileLocation,
): Promise<{ saved: boolean; fallback: boolean; path?: string; uri?: string }> {
  return saveToCenter(blob, filename, location.caseCode, location);
}

/** Open a file with the native viewer on the device; returns false on web. */
export async function openCaseFileNative(
  blob: Blob,
  filename: string,
  location: CaseFileLocation,
  mime?: string | null,
): Promise<boolean> {
  if (!(await isNativeApp())) return false;
  return saveAndOpenNative(blob, filename, location, mime);
}

/**
 * If a file was already saved to the device file manager (at its automatic
 * taxonomy path), open it directly from there instead of downloading again.
 *
 *  - Android (native): resolves the stored file's uri and opens it with the
 *    device's native viewer / image viewer.
 *  - Web (File System Access API): reads the cached file and opens it in a new
 *    browser tab.
 *
 * Returns true when an existing copy was found and opened; false otherwise so
 * the caller can fall back to a fresh download.
 */
export async function openCachedFile(
  filename: string,
  location: CaseFileLocation,
  mime?: string | null,
  webSubfolder?: string,
): Promise<boolean> {
  try {
    if (await isNativeApp()) {
      const uri = await getNativeUri(filename, location);
      if (!uri) return false;
      return await openNativeUri(uri, mime);
    }
    if (!isSupported()) return false;
    // transferDownload saves web copies under the "ملفات" subfolder by default.
    const blob = await readFromCenter(filename, webSubfolder ?? "ملفات");
    if (!blob) return false;
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  } catch {
    return false;
  }
}

function fallbackDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Fetch a remote URL into the center folder. */
export async function downloadUrlToCenter(url: string, filename: string, subfolder?: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const blob = await res.blob();
  return saveToCenter(blob, filename, subfolder);
}

/**
 * Try to read a previously-saved file from the chosen center folder
 * (acting as a local cache). Returns the Blob if present, else null.
 */
export async function readFromCenter(filename: string, subfolder?: string): Promise<Blob | null> {
  if (!isSupported()) return null;
  const dir = await getCenterFolder();
  if (!dir) return null;
  try {
    let target: any = dir;
    if (subfolder) target = await (target as any).getDirectoryHandle(subfolder, { create: false });
    const fh = await (target as any).getFileHandle(filename, { create: false });
    const file = await fh.getFile();
    return file as Blob;
  } catch {
    return null;
  }
}

/**
 * Get a blob URL for a file: read from the device file-manager cache if it
 * exists there, otherwise fetch from the remote URL and (optionally) save
 * a copy into the cache for next time. Falls back to returning the remote
 * URL when the File System Access API is unavailable.
 */
export async function getCachedOrFetchBlobUrl(
  remoteUrl: string,
  filename: string,
  subfolder: string = "ملفات",
  cacheRemote: boolean = true,
): Promise<{ url: string; cached: boolean; revoke?: () => void }> {
  const cached = await readFromCenter(filename, subfolder);
  if (cached) {
    const u = URL.createObjectURL(cached);
    return { url: u, cached: true, revoke: () => URL.revokeObjectURL(u) };
  }
  try {
    const res = await fetch(remoteUrl);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const blob = await res.blob();
    if (cacheRemote) { try { await saveToCenter(blob, filename, subfolder); } catch {} }
    const u = URL.createObjectURL(blob);
    return { url: u, cached: false, revoke: () => URL.revokeObjectURL(u) };
  } catch {
    return { url: remoteUrl, cached: false };
  }
}
