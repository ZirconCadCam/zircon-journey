import { supabase } from "@/integrations/supabase/client";

export const DOCTOR_PASSWORD_REQUIRED = "doctor_password_required";

/** Read a boolean app flag (defaults to true when missing/unreachable). */
export async function getAppFlag(key: string, fallback = true): Promise<boolean> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("bool_value")
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return fallback;
  return Boolean((data as { bool_value: boolean }).bool_value);
}

/**
 * Change a boolean app flag. Restricted to the administration:
 * either a signed-in user with the admin role, or a caller that proves
 * knowledge of the admin password. Any other caller is rejected server-side.
 */
export async function setAppFlag(
  key: string,
  value: boolean,
  adminPassword?: string,
): Promise<string | null> {
  const { error } = await supabase.rpc("set_app_flag", {
    p_key: key,
    p_value: value,
    ...(adminPassword ? { p_admin_password: adminPassword } : {}),
  });
  return error ? error.message : null;
}


