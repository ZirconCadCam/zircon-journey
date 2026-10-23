/**
 * Browser-side storage for signed staff tickets issued by the server after a
 * password check. Every server call attaches them (see start.ts middleware).
 */
import { createMiddleware } from "@tanstack/react-start";

const PREFIX = "zircon_ticket_";
const keyFor = (role: string, slot?: number | null) =>
  role === "doctor" ? `${PREFIX}doctor_${slot}` : `${PREFIX}${role}`;

export function saveTicket(role: string, slot: number | null | undefined, ticket: string): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(keyFor(role, slot), ticket); } catch { /* ignore */ }
}

export function hasTicket(role: string, slot?: number | null): boolean {
  if (typeof window === "undefined") return false;
  try { return !!localStorage.getItem(keyFor(role, slot)); } catch { return false; }
}

export function clearTicket(role: string, slot?: number | null): void {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(keyFor(role, slot)); } catch { /* ignore */ }
}

export function clearAllTickets(): void {
  if (typeof window === "undefined") return;
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  } catch { /* ignore */ }
}

export function allTickets(): string[] {
  if (typeof window === "undefined") return [];
  const out: string[] = [];
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(PREFIX)) { const v = localStorage.getItem(k); if (v) out.push(v); }
    }
  } catch { /* ignore */ }
  return out;
}

/** Global function middleware: attach tickets to every server function call. */
export const attachStaffTickets = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const t = allTickets();
  return next({ headers: t.length ? { "x-staff-tickets": JSON.stringify(t) } : {} });
});

/** Called when the server says the ticket is missing/expired: sign in again. */
export function handleStaffAuthRequired(): void {
  if (typeof window === "undefined") return;
  if (sessionStorage.getItem("zircon_reauth") === "1") return;
  // Only bounce people who believe they are signed in; public pages just get the error.
  const signedIn = Object.keys(localStorage).some((k) =>
    k.startsWith("zircon_session_") || k.startsWith("zircon_staff_") || /^zircon_doctor_\d+_authed$/.test(k) || k === "zircon_admin_all");
  if (!signedIn) return;
  sessionStorage.setItem("zircon_reauth", "1");
  clearAllTickets();
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("zircon_session_") || k.startsWith("zircon_staff_") || /^zircon_doctor_\d+_authed$/.test(k) || k === "zircon_admin_all") {
        localStorage.removeItem(k);
      }
    }
  } catch { /* ignore */ }
  window.location.assign("/login");
}

/** Clear the re-auth guard after a successful sign in. */
export function markSignedIn(): void {
  if (typeof window !== "undefined") sessionStorage.removeItem("zircon_reauth");
}
