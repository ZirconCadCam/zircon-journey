/**
 * Persists, per device, which case ZIP files have already been downloaded and
 * are ready to re-open from the device file manager. Stored in localStorage so
 * the state survives page refreshes and logout/login on the same device.
 */

export interface ZipDownloadEntry {
  fileName: string;
  mime?: string | null;
  /** Native (Capacitor) file URI when available, for direct re-open. */
  nativeUri?: string | null;
  ts: number;
}

type Store = Record<string, ZipDownloadEntry>;

const keyFor = (actor: string) => `zip-download-state:${actor}`;

function read(actor: string): Store {
  try {
    const raw = localStorage.getItem(keyFor(actor));
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function write(actor: string, store: Store) {
  try {
    localStorage.setItem(keyFor(actor), JSON.stringify(store));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

/** Load the full map of downloaded ZIPs for an actor on this device. */
export function loadZipDownloads(actor: string): Store {
  return read(actor);
}

/** Mark a case's ZIP as downloaded and ready to open. */
export function markZipDownloaded(
  actor: string,
  caseId: string,
  entry: Omit<ZipDownloadEntry, "ts">,
): void {
  const store = read(actor);
  store[caseId] = { ...entry, ts: Date.now() };
  write(actor, store);
}

/** Remove a case's saved download state (e.g. if re-open fails). */
export function clearZipDownloaded(actor: string, caseId: string): void {
  const store = read(actor);
  if (store[caseId]) {
    delete store[caseId];
    write(actor, store);
  }
}
