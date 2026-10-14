/**
 * Client-side consumption tracker + tool switches.
 *
 * Every request this device sends to the backend (database reads/writes,
 * storage, live channels, server functions) is classified into a "tool" and
 * logged locally. Admins can review it, set importance levels, a daily
 * budget, and switch individual tools off.
 */
import { useEffect, useState } from "react";

export type Section = "admin" | "designer" | "technician" | "doctor" | "system";
export type Kind = "db_read" | "db_write" | "storage" | "realtime" | "server" | "telegram";
export type Importance = "critical" | "high" | "medium" | "low";

export interface ToolDef {
  id: string;
  name: string;
  section: Section;
  kind: Kind;
  /** Tables / paths that belong to this tool. */
  match: RegExp;
  defaultImportance: Importance;
  /** Can be switched off without breaking core flow. */
  switchable: boolean;
}

export const SECTION_LABELS: Record<Section, string> = {
  admin: "الإدارة", designer: "المصمم", technician: "الفني", doctor: "الطبيب", system: "النظام",
};
export const KIND_LABELS: Record<Kind, string> = {
  db_read: "قراءة بيانات", db_write: "كتابة بيانات", storage: "ملفات وتخزين",
  realtime: "اتصال لحظي", server: "دوال الخادم", telegram: "تلجرام",
};
export const IMPORTANCE_LABELS: Record<Importance, string> = {
  critical: "حرجة", high: "عالية", medium: "متوسطة", low: "منخفضة",
};
/** Relative credit weight of one request of each kind. */
export const KIND_WEIGHT: Record<Kind, number> = {
  db_read: 1, db_write: 2, storage: 4, realtime: 3, server: 2, telegram: 3,
};

export const TOOLS: ToolDef[] = [
  { id: "cases", name: "الحالات وسير العمل", section: "doctor", kind: "db_read", match: /slot_cases|case_stage|cases\b/, defaultImportance: "critical", switchable: false },
  { id: "case_files", name: "رفع وتحميل ملفات الحالات", section: "designer", kind: "storage", match: /case-files|resumable/, defaultImportance: "critical", switchable: false },
  { id: "chat", name: "المحادثات والمرفقات", section: "designer", kind: "realtime", match: /chat|messages|chat-attachments/, defaultImportance: "high", switchable: true },
  { id: "notifications", name: "الإشعارات اللحظية", section: "system", kind: "realtime", match: /notification|push_|realtime/, defaultImportance: "high", switchable: true },
  { id: "voice", name: "التنبيه الصوتي للإدارة", section: "admin", kind: "server", match: /\/api\/tts/, defaultImportance: "low", switchable: true },
  { id: "accounting", name: "الحسابات وتقاريرها", section: "admin", kind: "db_read", match: /accounting|settlement|withdrawal|price/, defaultImportance: "medium", switchable: true },
  { id: "reports", name: "الكشوفات الشهرية", section: "admin", kind: "db_read", match: /report/, defaultImportance: "medium", switchable: true },
  { id: "revisions", name: "جولات التعديل والمتابعة", section: "technician", kind: "db_read", match: /revision/, defaultImportance: "medium", switchable: true },
  { id: "activity", name: "سجل نشاط الملفات", section: "designer", kind: "db_write", match: /file_activity|activity/, defaultImportance: "low", switchable: true },
  { id: "avatars", name: "الصور الشخصية", section: "system", kind: "storage", match: /avatar/, defaultImportance: "low", switchable: true },
  { id: "telegram", name: "إرسال تلجرام", section: "system", kind: "telegram", match: /telegram/, defaultImportance: "high", switchable: true },
  { id: "settings", name: "الإعدادات والأطباء", section: "admin", kind: "db_read", match: /app_settings|doctor_profiles|doctor_secrets|set_app_flag/, defaultImportance: "critical", switchable: false },
  { id: "other", name: "أخرى", section: "system", kind: "db_read", match: /.*/, defaultImportance: "medium", switchable: false },
];

export interface UsageEvent { t: number; tool: string; kind: Kind; method: string; ok: boolean; }

const LOG_KEY = "zircon_usage_log";
const CFG_KEY = "zircon_usage_cfg";
const MAX_EVENTS = 5000;
const RETAIN_MS = 31 * 24 * 3600_000;

export interface UsageConfig {
  disabled: Record<string, boolean>;
  importance: Record<string, Importance>;
  /** Daily weighted-unit budget; 0 = unlimited. */
  dailyBudget: number;
  /** When over budget, pause tools at or below this importance. */
  throttleBelow: Importance;
}
const DEFAULT_CFG: UsageConfig = { disabled: {}, importance: {}, dailyBudget: 0, throttleBelow: "low" };

const isBrowser = () => typeof window !== "undefined";

export function loadConfig(): UsageConfig {
  if (!isBrowser()) return DEFAULT_CFG;
  try { return { ...DEFAULT_CFG, ...JSON.parse(localStorage.getItem(CFG_KEY) || "{}") }; } catch { return DEFAULT_CFG; }
}
export function saveConfig(cfg: UsageConfig) {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  window.dispatchEvent(new Event("zircon-usage-cfg"));
}
export function loadEvents(): UsageEvent[] {
  if (!isBrowser()) return [];
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || "[]"); } catch { return []; }
}
export function clearEvents() { localStorage.removeItem(LOG_KEY); }

export function importanceOf(id: string, cfg = loadConfig()): Importance {
  return cfg.importance[id] ?? TOOLS.find((t) => t.id === id)?.defaultImportance ?? "medium";
}

const RANK: Record<Importance, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export function todayUnits(events = loadEvents()): number {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  return events.filter((e) => e.t >= start.getTime()).reduce((s, e) => s + KIND_WEIGHT[e.kind], 0);
}

/** Is a tool allowed to run right now (manual switch + budget throttle)? */
export function isToolEnabled(id: string): boolean {
  const def = TOOLS.find((t) => t.id === id);
  if (!def || !def.switchable) return true;
  const cfg = loadConfig();
  if (cfg.disabled[id]) return false;
  if (cfg.dailyBudget > 0 && todayUnits() > cfg.dailyBudget) {
    return RANK[importanceOf(id, cfg)] > RANK[cfg.throttleBelow];
  }
  return true;
}

export function useToolEnabled(id: string): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const upd = () => setOn(isToolEnabled(id));
    upd();
    window.addEventListener("zircon-usage-cfg", upd);
    window.addEventListener("storage", upd);
    return () => { window.removeEventListener("zircon-usage-cfg", upd); window.removeEventListener("storage", upd); };
  }, [id]);
  return on;
}

function classify(url: string, method: string): { tool: string; kind: Kind } | null {
  let path = url;
  try { path = new URL(url, location.origin).pathname + new URL(url, location.origin).search; } catch { /* keep */ }
  let kind: Kind;
  if (/supabase\.co\/rest\/v1\//.test(url)) kind = method === "GET" || method === "HEAD" ? "db_read" : "db_write";
  else if (/supabase\.co\/storage\//.test(url)) kind = "storage";
  else if (/supabase\.co\/realtime\//.test(url)) kind = "realtime";
  else if (/_serverFn|\/api\//.test(path)) kind = "server";
  else return null;
  const tool = TOOLS.find((t) => t.match.test(path))?.id ?? "other";
  if (tool === "telegram") kind = "telegram";
  return { tool, kind };
}

let pending: UsageEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
function record(ev: UsageEvent) {
  pending.push(ev);
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const cutoff = Date.now() - RETAIN_MS;
    const all = loadEvents().concat(pending).filter((e) => e.t >= cutoff).slice(-MAX_EVENTS);
    pending = [];
    try { localStorage.setItem(LOG_KEY, JSON.stringify(all)); } catch { /* full */ }
  }, 2000);
}

let installed = false;
/** Wrap window.fetch and WebSocket once to log backend usage on this device. */
export function installUsageTracker() {
  if (!isBrowser() || installed) return;
  installed = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const c = classify(url, method);
    try {
      const res = await orig(input, init);
      if (c) record({ t: Date.now(), ...c, method, ok: res.ok });
      return res;
    } catch (e) {
      if (c) record({ t: Date.now(), ...c, method, ok: false });
      throw e;
    }
  };
  const OrigWS = window.WebSocket;
  window.WebSocket = class extends OrigWS {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      if (/realtime/.test(String(url))) {
        record({ t: Date.now(), tool: "notifications", kind: "realtime", method: "WS", ok: true });
      }
    }
  } as typeof WebSocket;
}
