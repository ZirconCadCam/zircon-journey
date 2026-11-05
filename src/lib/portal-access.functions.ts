/**
 * Admin switch: open doctor/designer/technician pages without a password.
 * The server issues the signed ticket only while the switch is off; tickets
 * opened this way stop working once the password is required again.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { PORTAL_KEYS, settingKey, type PortalKey } from "./portal-access";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function readPasswordRequired(): Promise<Record<PortalKey, { required: boolean; updatedAt: number }>> {
  const { data } = await (await db()).from("app_settings").select("key,bool_value,updated_at").in("key", PORTAL_KEYS.map(settingKey));
  const out = {} as Record<PortalKey, { required: boolean; updatedAt: number }>;
  for (const k of PORTAL_KEYS) {
    const row = (data ?? []).find((r) => r.key === settingKey(k));
    out[k] = { required: row ? row.bool_value !== false : true, updatedAt: row ? Date.parse(row.updated_at) : 0 };
  }
  return out;
}

export const getPortalPasswordSettings = createServerFn({ method: "POST" }).handler(async () => {
  const s = await readPasswordRequired();
  return { doctor: s.doctor.required, designer: s.designer.required, technician: s.technician.required };
});

export const setPortalPasswordRequired = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ portal: z.enum(PORTAL_KEYS), required: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    const { requireStaff } = await import("./staff-ticket.server");
    await requireStaff(["admin"]);
    const { error } = await (await db()).from("app_settings").upsert(
      { key: settingKey(data.portal), bool_value: data.required, updated_at: new Date().toISOString() }, { onConflict: "key" });
    return { ok: !error, error: error?.message ?? null };
  });

/** Issue a ticket without a password, only while that page's password is off. */
export const openWithoutPassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ portal: z.enum(PORTAL_KEYS), slot: z.number().int().positive().optional() }).parse(d))
  .handler(async ({ data }) => {
    const s = await readPasswordRequired();
    if (s[data.portal].required) return { ok: false as const };
    const client = await db();
    if (data.portal === "doctor") {
      if (!data.slot) return { ok: false as const };
      const { data: p } = await client.from("doctor_profiles").select("active").eq("slot", data.slot).maybeSingle();
      if (!p?.active) return { ok: false as const };
    }
    const { signTicket } = await import("./staff-ticket.server");
    const slot = data.portal === "doctor" ? data.slot! : null;
    return { ok: true as const, ticket: await signTicket({ role: data.portal, slot }, { open: true }) };
  });
