/** Server-side health probes for the admin status panel. */
import { createServerFn } from "@tanstack/react-start";

export type ProbeState = "ok" | "down" | "unknown";
export interface Probe { key: string; state: ProbeState; ms: number | null; detail: string | null }

async function timed(key: string, fn: () => Promise<void>, timeoutMs = 6000): Promise<Probe> {
  const t0 = Date.now();
  try {
    await Promise.race([
      fn(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("انتهت مهلة الاستجابة")), timeoutMs)),
    ]);
    return { key, state: "ok", ms: Date.now() - t0, detail: null };
  } catch (e: any) {
    return { key, state: "down", ms: Date.now() - t0, detail: String(e?.message ?? e).slice(0, 200) };
  }
}

export const getSystemStatus = createServerFn({ method: "GET" }).handler(async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  const headers = { apikey: key ?? "", Authorization: `Bearer ${key ?? ""}` };
  const ok = async (r: Response) => { if (r.status >= 500) throw new Error(`HTTP ${r.status}`); };

  const probes = await Promise.all([
    timed("database", async () => ok(await fetch(`${url}/rest/v1/slot_cases?select=id&limit=1`, { headers }))),
    timed("auth", async () => ok(await fetch(`${url}/auth/v1/health`, { headers }))),
    timed("storage", async () => ok(await fetch(`${url}/storage/v1/bucket/doctor-files`, { headers }))),
    timed("telegram", async () => {
      const tok = process.env.TELEGRAM_BOT_TOKEN;
      if (!tok) throw new Error("مفتاح البوت غير مضبوط");
      const r = await fetch(`https://api.telegram.org/bot${tok}/getMe`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    }),
  ]);
  return { checkedAt: new Date().toISOString(), probes };
});
