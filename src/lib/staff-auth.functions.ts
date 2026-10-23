/**
 * Server-side staff sign-in and password management.
 *
 * Passwords never reach the browser: the server compares them and returns a
 * signed ticket (see staff-ticket.server.ts). Password lists and changes
 * require an admin ticket.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type PortalRole = "admin" | "designer" | "technician";
const PORTAL_ROLES: PortalRole[] = ["admin", "designer", "technician"];

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Sign in with a single password: admin → staff roles → doctor. */
export const signInWithPassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      password: z.string().min(1).max(200),
      /** Restrict to one portal role (staff page gate). */
      role: z.enum(["admin", "designer", "technician"]).optional(),
      /** Restrict to one doctor (doctor page gate). */
      slot: z.number().int().positive().optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { signTicket } = await import("./staff-ticket.server");
    const db = await admin();
    const { data: matches, error } = await db.rpc("verify_portal_password", {
      p_password: data.password.trim(), p_role: data.role ?? null, p_slot: data.slot ?? null,
    });
    const match = matches?.[0];
    if (error || !match) return { ok: false as const, error: "كلمة المرور غير صحيحة أو الصفحة غير مفعّلة" };
    const role = match.role as "admin" | "designer" | "technician" | "doctor";
    return { ok: true as const, role, slot: match.slot, name: match.name,
      ticket: await signTicket({ role, slot: match.slot }) };

  });

/** Check the admin password without issuing a ticket (confirmation dialogs). */
export const verifyAdminPassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ password: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: matches } = await db.rpc("verify_portal_password", { p_password: data.password.trim(), p_role: "admin" });
    return { ok: matches?.[0]?.role === "admin" };
  });

async function requireAdmin() {
  const { requireStaff } = await import("./staff-ticket.server");
  await requireStaff(["admin"]);
}

export const listPasswords = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdmin();
  const db = await admin();
  const [s, d] = await Promise.all([
    db.from("staff_secrets").select("role,password_hash,updated_at").order("role"),
    db.from("doctor_profiles").select("slot,name,active").order("slot"),
  ]);
  const { data: ds } = await db.from("doctor_secrets").select("slot,password_hash");
  const configured = new Set((ds ?? []).filter(r => !!r.password_hash).map(r => r.slot));
  return {
    staff: (s.data ?? []).map(r => ({ role: r.role, configured: !!r.password_hash, updated_at: r.updated_at })),
    doctors: ((d.data ?? []) as { slot: number; name: string; active: boolean }[]).map((r) => ({ ...r, configured: configured.has(r.slot) })),
  };
});

export const setStaffPassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ role: z.enum(["admin", "designer", "technician"]), password: z.string().trim().min(4).max(200) }).parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    const db = await admin();
    const { error } = await db.from("staff_secrets").upsert({ role: data.role, password: data.password, updated_at: new Date().toISOString() }, { onConflict: "role" });
    return { ok: !error, error: error?.message ?? null };
  });

export const setDoctorPassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ slot: z.number().int().positive(), password: z.string().trim().min(4).max(200) }).parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    const db = await admin();
    const { error } = await db.from("doctor_secrets").upsert({ slot: data.slot, password: data.password, updated_at: new Date().toISOString() }, { onConflict: "slot" });
    return { ok: !error, error: error?.message ?? null };
  });

export const saveDoctorProfile = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ slot: z.number().int().positive(), name: z.string().trim().min(1).max(200), branch: z.string().max(50).nullable(), active: z.boolean() }).parse(d),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const db = await admin();
    const { error } = await db.from("doctor_profiles").upsert({ slot: data.slot, name: data.name, branch: data.branch, active: data.active, updated_at: new Date().toISOString() }, { onConflict: "slot" });
    return { ok: !error, error: error?.message ?? null };
  });
