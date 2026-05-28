/**
 * File Manager — persists a user-chosen device folder ("مركز زركون CAD/CAM")
 * via the File System Access API and IndexedDB to store the directory handle.
 *
 * Falls back gracefully on browsers that do not support the API
 * (Safari/Firefox) — saveToCenter() will trigger a normal browser download.
 */

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

/**
 * Save a Blob to the chosen center folder (creates a subfolder if provided).
 * Returns true on success. If no folder is set or browser unsupported,
 * falls back to a normal download.
 */
export async function saveToCenter(
  blob: Blob,
  filename: string,
  subfolder?: string,
): Promise<{ saved: boolean; fallback: boolean; path?: string }> {
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
