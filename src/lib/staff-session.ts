/**
 * Durable, per-device staff session storage.
 *
 * Keeps a role signed in across app restarts without re-entering a password,
 * while enforcing a configurable session lifetime. Each successful entry stores
 * a session record with an expiry; every time the app is reopened and the
 * session is still valid, the expiry is extended (sliding window) so active
 * users are never logged out mid-use, but abandoned sessions eventually lapse.
 */

/** Default session lifetime: 30 days of inactivity before a fresh login. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface SessionRecord {
  /** Role the session belongs to. */
  role: string;
  /** Epoch ms when the session was first created. */
  createdAt: number;
  /** Epoch ms after which the session is no longer valid. */
  expiresAt: number;
  /** Schema version, for safe future migrations. */
  v: 1;
}

const keyFor = (role: string) => `zircon_session_${role}`;

function safeParse(raw: string | null): SessionRecord | null {
  if (!raw) return null;
  try {
    const rec = JSON.parse(raw) as SessionRecord;
    if (rec && rec.v === 1 && typeof rec.expiresAt === "number") return rec;
    return null;
  } catch {
    return null;
  }
}

/** Persist (or refresh) a session for a role with a sliding expiry. */
export function saveStaffSession(role: string, ttlMs: number = SESSION_TTL_MS): void {
  if (typeof window === "undefined") return;
  const existing = safeParse(localStorage.getItem(keyFor(role)));
  const now = Date.now();
  const rec: SessionRecord = {
    role,
    createdAt: existing?.createdAt ?? now,
    expiresAt: now + ttlMs,
    v: 1,
  };
  try {
    localStorage.setItem(keyFor(role), JSON.stringify(rec));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

/** Whether a non-expired session exists for the role on this device. */
export function hasValidStaffSession(role: string): boolean {
  if (typeof window === "undefined") return false;
  const rec = safeParse(localStorage.getItem(keyFor(role)));
  if (!rec) return false;
  if (Date.now() >= rec.expiresAt) {
    clearStaffSession(role);
    return false;
  }
  return true;
}

/** Remove a role's stored session (used on logout or expiry). */
export function clearStaffSession(role: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(keyFor(role));
  } catch {
    /* ignore */
  }
}
