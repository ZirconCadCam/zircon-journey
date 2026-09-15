import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const schema = z.object({
  deviceId: z.string().min(4).max(120),
  userAgent: z.string().max(500).optional(),
  platform: z.string().max(120).optional(),
  role: z.string().max(60).optional(),
  path: z.string().max(300).optional(),
});

/**
 * Records the visiting device (id + browser info + network address taken from
 * the request headers) and returns whether the administration blocked it.
 */
export const registerDevice = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let ip: string | null = null;
    try {
      const h = getRequest().headers;
      ip =
        h.get("cf-connecting-ip") ??
        h.get("x-real-ip") ??
        h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        null;
    } catch {
      ip = null;
    }
    const { data: blocked, error } = await supabaseAdmin.rpc("register_device", {
      p_device_id: data.deviceId,
      p_user_agent: data.userAgent ?? undefined,
      p_platform: data.platform ?? undefined,
      p_ip: ip ?? undefined,
      p_role: data.role ?? undefined,
      p_path: data.path ?? undefined,
    });
    if (error) return { blocked: false, ip: null as string | null };
    return { blocked: Boolean(blocked), ip };
  });
