import { createClient } from "@supabase/supabase-js";
import type { AuthContext } from "@lovable.dev/mcp-js";

type RuntimeGlobals = typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
};

function env(names: string[]): string | undefined {
  const p = (globalThis as RuntimeGlobals).process?.env;
  for (const n of names) {
    const v = p?.[n]?.trim();
    if (v) return v;
  }
  return undefined;
}

export function supabaseForUser(ctx: AuthContext) {
  const token = ctx.getToken();
  if (!token) throw new Error("Authenticated caller required");
  const url = env(["SUPABASE_URL", "VITE_SUPABASE_URL"]);
  const key = env(["SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY"]);
  if (!url || !key) throw new Error("Backend configuration missing");
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Only accounts granted the admin role may use the tools. */
export async function requireAdmin(ctx: AuthContext) {
  const db = supabaseForUser(ctx);
  const uid = ctx.getUserId();
  const { data, error } = await db.rpc("has_role", { _user_id: uid, _role: "admin" } as never);
  if (error || data !== true) {
    throw new Error("هذا الحساب لا يملك صلاحية الإدارة");
  }
  return db;
}
