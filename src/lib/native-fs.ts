/**
 * Native file-system layer (Capacitor / Android).
 *
 * SSR-safe: every Capacitor import is loaded lazily inside async functions so
 * the web/SSR bundle never evaluates native code at import time. On the web
 * `isNativeApp()` resolves false and callers fall back to the File System
 * Access API in `file-manager.ts`.
 *
 * Files are written under the device's public Documents folder so they appear
 * in the phone's file manager under:  Documents/حالات مركز زركون/...
 */
import { ROOT_FOLDER, buildCasePath, baseStructure, type CaseFileLocation } from "@/lib/case-folders";

let nativeChecked = false;
let nativeValue = false;

/** True only inside the Capacitor Android/iOS shell. */
export async function isNativeApp(): Promise<boolean> {
  if (nativeChecked) return nativeValue;
  nativeChecked = true;
  try {
    if (typeof window === "undefined") return (nativeValue = false);
    const { Capacitor } = await import("@capacitor/core");
    nativeValue = Capacitor.isNativePlatform();
  } catch {
    nativeValue = false;
  }
  return nativeValue;
}

/** Synchronous best-effort check (after isNativeApp ran at least once). */
export function isNativeAppSync(): boolean {
  return nativeChecked && nativeValue;
}

async function fs() {
  const mod = await import("@capacitor/filesystem");
  return mod;
}

function rootPath(segments: string[]): string {
  return [ROOT_FOLDER, ...segments].filter(Boolean).join("/");
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const res = reader.result as string;
      const comma = res.indexOf(",");
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    reader.readAsDataURL(blob);
  });
}

/* -------------------------------------------------------------------------- */
/* Permissions                                                                */
/* -------------------------------------------------------------------------- */

export type NativePermState = "granted" | "denied" | "prompt" | "unavailable";

export async function checkNativePermission(): Promise<NativePermState> {
  if (!(await isNativeApp())) return "unavailable";
  try {
    const { Filesystem } = await fs();
    const r = await Filesystem.checkPermissions();
    return (r.publicStorage as NativePermState) ?? "prompt";
  } catch {
    return "prompt";
  }
}

export async function requestNativePermission(): Promise<boolean> {
  if (!(await isNativeApp())) return false;
  try {
    const { Filesystem } = await fs();
    let r = await Filesystem.checkPermissions();
    if (r.publicStorage !== "granted") r = await Filesystem.requestPermissions();
    return r.publicStorage === "granted";
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Folder structure                                                           */
/* -------------------------------------------------------------------------- */

/** Create the root folder and the four role subfolders if missing. */
export async function ensureBaseStructure(): Promise<boolean> {
  if (!(await isNativeApp())) return false;
  try {
    const { Filesystem, Directory } = await fs();
    await Filesystem.mkdir({ path: ROOT_FOLDER, directory: Directory.Documents, recursive: true }).catch(() => {});
    for (const segs of baseStructure()) {
      await Filesystem.mkdir({
        path: rootPath(segs),
        directory: Directory.Documents,
        recursive: true,
      }).catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Write / read / open                                                        */
/* -------------------------------------------------------------------------- */

export interface NativeSaveResult {
  saved: boolean;
  path?: string; // human path under root
  uri?: string; // native uri for opening
}

/** Persist a blob into the taxonomy folder for `loc`. */
export async function saveBlobNative(
  blob: Blob,
  filename: string,
  loc: CaseFileLocation,
): Promise<NativeSaveResult> {
  if (!(await isNativeApp())) return { saved: false };
  try {
    const { Filesystem, Directory } = await fs();
    const folderSegs = buildCasePath(loc);
    const folder = rootPath(folderSegs);
    await Filesystem.mkdir({ path: folder, directory: Directory.Documents, recursive: true }).catch(() => {});
    const path = `${folder}/${filename}`;
    const data = await blobToBase64(blob);
    await Filesystem.writeFile({ path, directory: Directory.Documents, data, recursive: true });
    const uriRes = await Filesystem.getUri({ path, directory: Directory.Documents });
    return { saved: true, path: `${ROOT_FOLDER}/${folderSegs.join("/")}/${filename}`, uri: uriRes.uri };
  } catch {
    return { saved: false };
  }
}

/** Read a stored file back as a Blob (local cache hit), or null if absent. */
export async function readBlobNative(
  filename: string,
  loc: CaseFileLocation,
): Promise<Blob | null> {
  if (!(await isNativeApp())) return null;
  try {
    const { Filesystem, Directory } = await fs();
    const path = `${rootPath(buildCasePath(loc))}/${filename}`;
    const res = await Filesystem.readFile({ path, directory: Directory.Documents });
    const bytes = base64ToBytes(res.data as string);
    return new Blob([bytes.buffer as ArrayBuffer]);
  } catch {
    return null;
  }
}

/** Resolve the native uri of a stored file (for opening), or null. */
export async function getNativeUri(filename: string, loc: CaseFileLocation): Promise<string | null> {
  if (!(await isNativeApp())) return null;
  try {
    const { Filesystem, Directory } = await fs();
    const path = `${rootPath(buildCasePath(loc))}/${filename}`;
    const res = await Filesystem.getUri({ path, directory: Directory.Documents });
    return res.uri || null;
  } catch {
    return null;
  }
}

/** Open a file with the device's native viewer / image viewer. */
export async function openNativeUri(uri: string, mime?: string | null): Promise<boolean> {
  if (!(await isNativeApp())) return false;
  try {
    const { FileOpener } = await import("@capacitor-community/file-opener");
    await FileOpener.open({ filePath: uri, contentType: mime || undefined });
    return true;
  } catch {
    return false;
  }
}

/**
 * Save (if needed) then open a remote file on the device with the native
 * viewer. Used for the "عرض" action so files open with the phone's apps.
 */
export async function saveAndOpenNative(
  blob: Blob,
  filename: string,
  loc: CaseFileLocation,
  mime?: string | null,
): Promise<boolean> {
  const r = await saveBlobNative(blob, filename, loc);
  if (!r.saved || !r.uri) return false;
  return openNativeUri(r.uri, mime);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const len = bin.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
  return out;
}
