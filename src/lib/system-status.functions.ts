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
    { const { requireStaff } = await import("./staff-ticket.server"); await requireStaff(["admin"]); }
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

/**
 * Runtime configuration check. Returns only presence/format booleans —
 * never the values themselves.
 */
export interface ConfigItem { name: string; scope: "browser" | "server"; required: boolean; present: boolean; valid: boolean; affects: string }

const CONFIG_SPEC: { name: string; scope: "browser" | "server"; required: boolean; affects: string; check?: (v: string) => boolean }[] = [
  { name: "VITE_SUPABASE_URL", scope: "browser", required: true, affects: "فتح التطبيق وعرض كل البيانات", check: (v) => /^https:\/\//.test(v) },
  { name: "VITE_SUPABASE_PUBLISHABLE_KEY", scope: "browser", required: true, affects: "فتح التطبيق وعرض كل البيانات" },
  { name: "VITE_SUPABASE_PROJECT_ID", scope: "browser", required: false, affects: "معلومة مساعدة فقط" },
  { name: "SUPABASE_URL", scope: "server", required: true, affects: "عمليات الخادم: الأطباء، الحسابات، تلجرام", check: (v) => /^https:\/\//.test(v) },
  { name: "SUPABASE_PUBLISHABLE_KEY", scope: "server", required: true, affects: "قراءة البيانات من الخادم والتقارير" },
  { name: "SUPABASE_SERVICE_ROLE_KEY", scope: "server", required: true, affects: "الرفع، سلة المهملات، طابور تلجرام، إدارة الأطباء" },
  { name: "TELEGRAM_BOT_TOKEN", scope: "server", required: true, affects: "الإرسال إلى جروب تلجرام", check: (v) => /^\d+:[\w-]{20,}$/.test(v) },
  { name: "TELEGRAM_CHAT_ID", scope: "server", required: false, affects: "جروب تلجرام (يُستخدم الافتراضي إن غاب)", check: (v) => /^-\d{6,}$/.test(v) || /^@\w{4,}$/.test(v) },
  { name: "LOVABLE_API_KEY", scope: "server", required: false, affects: "قراءة الفواتير بالذكاء الاصطناعي" },
  { name: "VAPID_PUBLIC_KEY", scope: "server", required: false, affects: "إشعارات الجوال" },
  { name: "VAPID_PRIVATE_KEY", scope: "server", required: false, affects: "إشعارات الجوال" },
  { name: "REPORTS_CRON_KEY", scope: "server", required: false, affects: "التقارير الشهرية التلقائية" },
  { name: "ELEVENLABS_API_KEY", scope: "server", required: false, affects: "التنبيه الصوتي" },
];

export const getConfigCheck = createServerFn({ method: "GET" }).handler(async () => {
    { const { requireStaff } = await import("./staff-ticket.server"); await requireStaff(["admin"]); }
  const browserEnv = import.meta.env as Record<string, string | undefined>;
  const items: ConfigItem[] = CONFIG_SPEC.map((s) => {
    const raw = (s.scope === "browser" ? browserEnv[s.name] ?? process.env[s.name] : process.env[s.name]) ?? "";
    const v = String(raw).trim();
    const present = v.length > 0;
    return { name: s.name, scope: s.scope, required: s.required, affects: s.affects, present, valid: present && (s.check ? s.check(v) : true) };
  });
  return { checkedAt: new Date().toISOString(), items };
});
