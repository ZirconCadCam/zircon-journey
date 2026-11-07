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
const PORTAL_PASSWORDS: Record<PortalRole, string> = {
  admin: "ZirconCad.Cam",
  designer: "mcadcam",
  technician: "fcadcam",
};
const passwordInput = z.string().trim().min(1).max(200).refine(value => new TextEncoder().encode(value).length <= 72, "كلمة المرور طويلة جداً");

type SignInResult =
  | { ok: false; error: string }
  | { ok: true; role: "admin" | "designer" | "technician" | "doctor"; slot?: number; name?: string; ticket: string };

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Sign in with a single password: admin → staff roles → doctor. */
export const signInWithPassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      password: passwordInput,
      /** Restrict to one portal role (staff page gate). */
      role: z.enum(["admin", "designer", "technician"]).optional(),
      /** Restrict to one doctor (doctor page gate). */
      slot: z.number().int().positive().optional(),
    }).parse(d),
  )
  .handler(async ({ data }): Promise<SignInResult> => {
    const { signTicket } = await import("./staff-ticket.server");
    const db = await admin();

    if (data.slot) {
      const { data: doctor } = await db
        .from("doctor_profiles")
        .select("slot,name,active")
        .eq("slot", data.slot)
        .maybeSingle();
      if (!doctor?.active || data.password.trim() !== `zircon${data.slot}`) {
        return { ok: false, error: "كلمة المرور غير صحيحة أو الصفحة غير مفعّلة" };
      }
      // Keep the credential row in sync with the deterministic doctor password.
      // Ticket validation uses this row to reject tickets issued before a credential change.
      const { error: credentialError } = await db.from("doctor_secrets").upsert(
        { slot: doctor.slot, password: `zircon${doctor.slot}`, updated_at: new Date().toISOString() },
        { onConflict: "slot" },
      );
      if (credentialError) return { ok: false, error: "تعذر تجهيز جلسة الدخول، حاول مجددًا" };

      const role = "doctor" as const;
      return {
        ok: true,
        role,
        slot: doctor.slot,
        name: doctor.name,
        ticket: await signTicket({ role, slot: doctor.slot }),
      };
    }

    const password = data.password.trim();
    const role = PORTAL_ROLES.find((candidate) => PORTAL_PASSWORDS[candidate] === password);
    if (!role || (data.role && data.role !== role)) {
      return { ok: false, error: "كلمة المرور غير صحيحة أو الصفحة غير مفعّلة" };
    }

    // Keep the credential row present so the signed ticket can be validated
    // immediately, even when an older database has not been seeded yet.
    const { error: credentialError } = await db.from("staff_secrets").upsert(
      { role, password, updated_at: new Date().toISOString() },
      { onConflict: "role" },
    );
    if (credentialError) return { ok: false, error: "تعذر تجهيز جلسة الدخول، حاول مجددًا" };

    return {
      ok: true,
      role,
      ticket: await signTicket({ role, slot: null }),
    };
  });

/** Check the admin password without issuing a ticket (confirmation dialogs). */
export const verifyAdminPassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ password: passwordInput }).parse(d))
  .handler(async ({ data }) => ({ ok: data.password.trim() === PORTAL_PASSWORDS.admin }));

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
  .inputValidator((d: unknown) => z.object({ role: z.enum(["admin", "designer", "technician"]), password: passwordInput.refine(value => value.length >= 4) }).parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    return data.password === PORTAL_PASSWORDS[data.role]
      ? { ok: true, error: null }
      : { ok: false, error: "كلمات مرور الصفحات ثابتة ولا يمكن تغييرها" };
  });

export const setDoctorPassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ slot: z.number().int().positive(), password: passwordInput.refine(value => value.length >= 4) }).parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    return data.password === `zircon${data.slot}`
      ? { ok: true, error: null }
      : { ok: false, error: "كلمات مرور الأطباء ثابتة ولا يمكن تغييرها" };
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

/** Local flags never establish authority; validate the signed role on the server. */
export const validateStaffSession = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ role: z.enum(["admin", "designer", "technician"]) }).parse(input))
  .handler(async ({ data }) => {
    const { requireStaff } = await import("./staff-ticket.server");
    try { await requireStaff(["admin", data.role]); return { ok: true }; }
    catch { return { ok: false }; }
  });
