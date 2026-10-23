/**
 * Public, non-sensitive reads used before sign-in (login and doctor pickers).
 * The tables themselves are closed to the browser; only these fixed fields
 * are served.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const PUBLIC_FLAGS = ["doctor_password_required"] as const;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const getPublicFlag = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ key: z.enum(PUBLIC_FLAGS) }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: row } = await db.from("app_settings").select("bool_value").eq("key", data.key).maybeSingle();
    return { value: row ? Boolean(row.bool_value) : null };
  });

export const listAvatarOverrides = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data } = await db.from("avatar_overrides").select("subject,image_url");
  return ((data ?? []) as { subject: string; image_url: string }[]).map((r) => ({ subject: r.subject, image_url: r.image_url }));
});
