/**
 * Signed staff tickets (server only).
 *
 * Staff sign in with shared role passwords (no personal accounts). After the
 * server verifies a password it issues a short-lived HMAC-signed ticket
 * `{ r: role, s?: doctorSlot, e: expiresAtMs }`. Every protected server call
 * reads the tickets the browser attaches (header `x-staff-tickets`) and acts
 * with the most privileged valid one. Uses Web Crypto so it runs on workerd.
 */
import { getRequestHeader } from "@tanstack/react-start/server";

export type StaffRole = "admin" | "designer" | "technician" | "doctor";
export interface StaffActor {
  role: StaffRole;
  /** Doctor slot when role === "doctor". */
  slot: number | null;
}

/** Ticket lifetime: 30 days, matching the existing on-device session. */
export const TICKET_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ROLES: StaffRole[] = ["admin", "designer", "technician", "doctor"];
const RANK: Record<StaffRole, number> = { admin: 4, technician: 3, designer: 2, doctor: 1 };

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function key(): Promise<CryptoKey> {
  const secret = process.env["STAFF_TICKET_SECRET"];
  if (!secret || secret.length < 32) throw new Error("STAFF_TICKET_SECRET غير مُهيّأ.");
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signTicket(actor: StaffActor): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ r: actor.role, s: actor.slot, e: Date.now() + TICKET_TTL_MS })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(), enc.encode(payload)));
  return `${payload}.${b64url(sig)}`;
}

export async function verifyTicket(token: string): Promise<StaffActor | null> {
  if (typeof token !== "string" || token.length > 600) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(), fromB64url(sig), enc.encode(payload));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as { r: string; s: number | null; e: number };
    if (!ROLES.includes(p.r as StaffRole) || typeof p.e !== "number" || p.e < Date.now()) return null;
    if (p.r === "doctor" && !(Number.isInteger(p.s) && (p.s as number) > 0)) return null;
    return { role: p.r as StaffRole, slot: p.r === "doctor" ? (p.s as number) : null };
  } catch {
    return null;
  }
}

/** All valid actors from the request's attached tickets, most privileged first. */
export async function getStaffActors(): Promise<StaffActor[]> {
  const raw = getRequestHeader("x-staff-tickets");
  if (!raw) return [];
  let list: unknown;
  try { list = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(list)) return [];
  const out: StaffActor[] = [];
  for (const t of list.slice(0, 20)) {
    const a = await verifyTicket(String(t));
    if (a) out.push(a);
  }
  return out.sort((a, b) => RANK[b.role] - RANK[a.role]);
}

export class StaffAuthError extends Error {
  constructor(msg = "STAFF_AUTH_REQUIRED") { super(msg); }
}

/** Most privileged actor, or throw when none is signed in. */
export async function requireStaff(allowed?: StaffRole[]): Promise<StaffActor> {
  const actors = await getStaffActors();
  const a = allowed ? actors.find((x) => allowed.includes(x.role)) : actors[0];
  if (!a) throw new StaffAuthError();
  return a;
}

/** Doctor slots this caller may act for; null means every slot (staff). */
export async function allowedSlots(): Promise<{ actor: StaffActor; slots: number[] | null }> {
  const actors = await getStaffActors();
  if (!actors.length) throw new StaffAuthError();
  if (actors[0].role !== "doctor") return { actor: actors[0], slots: null };
  return { actor: actors[0], slots: actors.map((a) => a.slot as number) };
}
