import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const subject = z.string().min(1).max(240).regex(/^(?:role:(?:designer|technician)|doctor:.+)$/);
export const assignAvatar = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ subject, imageUrl: z.string().url().max(2000), label: z.string().max(200) }).parse(input))
  .handler(async ({ data }) => {
    const { requireStaff } = await import("./staff-ticket.server");
    await requireStaff(["admin"]);
    const { assertStorageUrl } = await import("./storage-destination.server");
    const source = assertStorageUrl(data.imageUrl);
    if (source.bucket !== "doctor-files" || !source.path.startsWith("avatars/") || !/\.(?:jpe?g|png|webp|gif|avif)$/i.test(source.path)) throw new Error("صورة غير مسموحة");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("set_avatar_override", { p_subject: data.subject, p_image_url: data.imageUrl, p_label: data.label });
    return { error: error ? { message: error.message } : null };
  });

export const removeAvatar = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ subject }).parse(input))
  .handler(async ({ data }) => {
    const { requireStaff } = await import("./staff-ticket.server");
    await requireStaff(["admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("clear_avatar_override", { p_subject: data.subject });
    return { error: error ? { message: error.message } : null };
  });