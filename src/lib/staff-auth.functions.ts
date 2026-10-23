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

/** Current staff passwords from the database (no client-side defaults). */
async function staffPasswords(): Promise<Partial<Record<PortalRole, string>>> {
  const db = await admin();
  const { data } = await db.from("staff_secrets").select("role,password");
  const map: Partial<Record<PortalRole, string>> = {};
  for (const r of (data ?? []) as { role: string; password: string }[]) {
    if (PORTAL_ROLES.includes(r.role as PortalRole) && r.password) map[r.role as PortalRole] = r.password;
  }
  return map;
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
    const pw = data.password.trim();
    if (data.slot === undefined) {
      const map = await staffPasswords();
      const order: PortalRole[] = data.role ? [data.role] : PORTAL_ROLES;
      for (const role of order) {
        if (map[role] && map[role] === pw) {
          return { ok: true as const, role, slot: null as number | null, name: null as string | null, ticket: await signTicket({ role, slot: null }) };
        }
      }
      if (data.role) return { ok: false as const, error: "كلمة المرور غير صحيحة" };
    }
    const db = await admin();
    const { data: secrets } = await db.from("doctor_secrets").select("slot,password").eq("password", pw).limit(5);
    const hit = ((secrets ?? []) as { slot: number }[]).find((s) => data.slot === undefined || s.slot === data.slot);
    if (!hit) return { ok: false as const, error: "كلمة المرور غير صحيحة" };
    const { data: prof } = await db.from("doctor_profiles").select("slot,name,active").eq("slot", hit.slot).maybeSingle();
    if (!prof) return { ok: false as const, error: "كلمة المرور غير صحيحة" };
    if (!prof.active) return { ok: false as const, error: "هذه الخانة غير مفعّلة. تواصل مع الإدارة." };
    return { ok: true as const, role: "doctor" as const, slot: prof.slot as number, name: prof.name as string, ticket: await signTicket({ role: "doctor", slot: prof.slot }) };
  });

/** Check the admin password without issuing a ticket (confirmation dialogs). */
export const verifyAdminPassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ password: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const map = await staffPasswords();
    return { ok: !!map.admin && map.admin === data.password.trim() };
  });

async function requireAdmin() {
  const { requireStaff } = await import("./staff-ticket.server");
  await requireStaff(["admin"]);
}

export const listPasswords = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdmin();
  const db = await admin();
  const [s, d] = await Promise.all([
    db.from("staff_secrets").select("role,password,updated_at").order("role"),
    db.from("doctor_profiles").select("slot,name,active").order("slot"),
  ]);
  const { data: ds } = await db.from("doctor_secrets").select("slot,password");
  const pwBySlot = new Map(((ds ?? []) as { slot: number; password: string }[]).map((r) => [r.slot, r.password]));
  return {
    staff: (s.data ?? []) as { role: string; password: string; updated_at: string }[],
    doctors: ((d.data ?? []) as { slot: number; name: string; active: boolean }[]).map((r) => ({ ...r, password: pwBySlot.get(r.slot) ?? null })),
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
