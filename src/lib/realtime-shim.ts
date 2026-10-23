/**
 * Live-update shim for tables the browser can no longer read directly.
 *
 * Database change feeds need open read access, which was removed for cases,
 * chat and files. `rt.channel()` keeps the supabase channel API: changes on
 * protected tables are detected by a light poll through the secure server
 * (every ~10s while the tab is visible) and delivered as INSERT/UPDATE
 * payloads; other tables still use the real live feed.
 */
import { supabase } from "@/integrations/supabase/client";
import { sdb } from "./secure-db";

const PROTECTED = new Set(["slot_cases", "chat_conversations", "chat_messages", "doctor_files", "file_activity", "case_revision_rounds"]);
/** Columns that move when a row is created or changed. */
const TS_COLS: Record<string, { created: string; changed: string[] }> = {
  slot_cases: { created: "created_at", changed: ["updated_at"] },
  chat_conversations: { created: "created_at", changed: ["updated_at", "last_message_at"] },
  chat_messages: { created: "created_at", changed: ["edited_at", "read_at", "delivered_at"] },
  doctor_files: { created: "created_at", changed: ["trashed_at"] },
  file_activity: { created: "created_at", changed: [] },
  case_revision_rounds: { created: "requested_at", changed: ["rar_sent_at", "html_sent_at"] },
};
const POLL_MS = 10_000;

type Handler = (payload: { eventType: string; new: any; old: any; table: string }) => void;
interface Sub { event: string; cb: Handler }
interface Poller {
  table: string;
  filter: [string, string] | null;
  since: string | null;
  rows: Map<string, any>;
  subs: Set<Sub>;
  timer: number | null;
  busy: boolean;
}

const pollers = new Map<string, Poller>();

function parseFilter(f?: string): [string, string] | null {
  const m = f?.match(/^([a-z_]+)=eq\.(.+)$/);
  return m ? [m[1], m[2]] : null;
}

function maxTs(row: any, cols: string[]): string | null {
  let best: string | null = null;
  for (const c of cols) { const v = row?.[c]; if (typeof v === "string" && (!best || v > best)) best = v; }
  return best;
}

async function tick(p: Poller) {
  if (p.busy || document.visibilityState !== "visible") return;
  p.busy = true;
  try {
    const ts = TS_COLS[p.table];
    const cols = [ts.created, ...ts.changed];
    if (p.since === null) {
      // Start from the newest timestamp on the server (avoids clock skew).
      let q: any = sdb.from(p.table as any).select(cols.join(",")).order(ts.created, { ascending: false }).limit(1);
      if (p.filter) q = q.eq(p.filter[0], p.filter[1]);
      const { data } = await q;
      const row = (data ?? [])[0];
      p.since = (row && maxTs(row, cols)) || new Date(0).toISOString();
      for (const c of ts.changed) {
        let q2: any = sdb.from(p.table as any).select(c).not(c, "is", null).order(c, { ascending: false }).limit(1);
        if (p.filter) q2 = q2.eq(p.filter[0], p.filter[1]);
        const r2 = await q2;
        const v = (r2.data ?? [])[0]?.[c];
        if (typeof v === "string" && v > (p.since as string)) p.since = v;
      }
      return;
    }
    const since = p.since;
    let q: any = sdb.from(p.table as any).select("*").or(cols.map((c) => `${c}.gt.${since}`).join(",")).limit(200);
    if (p.filter) q = q.eq(p.filter[0], p.filter[1]);
    const { data, error } = await q;
    if (error || !data?.length) return;
    for (const row of data as any[]) {
      const t = maxTs(row, cols);
      if (t && t > (p.since as string)) p.since = t;
      const prev = p.rows.get(row.id);
      const isInsert = !prev && typeof row[ts.created] === "string" && row[ts.created] > since;
      const payload = { eventType: isInsert ? "INSERT" : "UPDATE", new: row, old: isInsert ? {} : (prev ?? row), table: p.table };
      p.rows.set(row.id, row);
      for (const s of p.subs) {
        if (s.event === "*" || s.event === payload.eventType) {
          try { s.cb(payload); } catch (e) { console.error(e); }
        }
      }
    }
  } catch (e) {
    console.warn("live poll failed", e);
  } finally {
    p.busy = false;
  }
}

function onVisible() {
  if (document.visibilityState === "visible") for (const p of pollers.values()) void tick(p);
}
let visHooked = false;

function addSub(table: string, filter: string | undefined, sub: Sub): () => void {
  const f = parseFilter(filter);
  const key = `${table}|${f?.join("=") ?? ""}`;
  let p = pollers.get(key);
  if (!p) {
    p = { table, filter: f, since: null, rows: new Map(), subs: new Set(), timer: null, busy: false };
    pollers.set(key, p);
    const pp = p;
    void tick(pp);
    pp.timer = window.setInterval(() => void tick(pp), POLL_MS);
  }
  if (!visHooked) { visHooked = true; document.addEventListener("visibilitychange", onVisible); }
  p.subs.add(sub);
  return () => {
    const q = pollers.get(key);
    if (!q) return;
    q.subs.delete(sub);
    if (q.subs.size === 0) { if (q.timer) clearInterval(q.timer); pollers.delete(key); }
  };
}

class ShimChannel {
  private real: any = null;
  private realUsed = false;
  private pending: { table: string; filter?: string; sub: Sub }[] = [];
  private cleanups: (() => void)[] = [];
  constructor(private name: string) {}
  on(type: string, cfg: any, cb: any) {
    if (type === "postgres_changes" && cfg && PROTECTED.has(cfg.table)) {
      this.pending.push({ table: cfg.table, filter: cfg.filter, sub: { event: cfg.event ?? "*", cb } });
    } else {
      if (!this.real) this.real = supabase.channel(this.name);
      this.realUsed = true;
      this.real = this.real.on(type, cfg, cb);
    }
    return this;
  }
  subscribe(cb?: any) {
    if (typeof window !== "undefined") {
      for (const p of this.pending) this.cleanups.push(addSub(p.table, p.filter, p.sub));
    }
    this.pending = [];
    if (this.realUsed) this.real.subscribe(cb);
    return this;
  }
  unsubscribe() { this.remove(); return Promise.resolve("ok"); }
  remove() {
    this.cleanups.forEach((c) => c());
    this.cleanups = [];
    if (this.real) { void supabase.removeChannel(this.real); this.real = null; }
  }
}

export const rt = {
  channel(name: string): any { return new ShimChannel(name); },
  removeChannel(ch: any) {
    if (ch instanceof ShimChannel) { ch.remove(); return Promise.resolve("ok" as const); }
    return supabase.removeChannel(ch);
  },
};
