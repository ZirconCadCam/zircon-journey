/**
 * Drop-in replacement for `supabase.from(...)` on protected tables.
 *
 * Builds the same chained query description as supabase-js and runs it via the
 * `secureDb` server function, which checks the caller's staff ticket. Typed as
 * the real client so call sites keep their row types.
 */
import { supabase } from "@/integrations/supabase/client";
import { secureDb, type SecureQuery } from "./secure-db.functions";
import { handleStaffAuthRequired } from "./staff-tickets";

type Q = SecureQuery;

class SecureBuilder implements PromiseLike<any> {
  private q: Q;
  constructor(table: Q["table"]) {
    this.q = { table, op: "select", filters: [], order: [] } as Q;
  }
  // ---- operations
  select(columns?: string, opts?: { count?: Q["count"]; head?: boolean }) {
    if (this.q.op === "select") {
      this.q.columns = columns ?? "*";
      if (opts?.count) this.q.count = opts.count;
      if (opts?.head) this.q.head = true;
    } else {
      this.q.returning = columns ?? "*";
    }
    return this;
  }
  insert(values: unknown, opts?: { count?: Q["count"] }) { this.q.op = "insert"; this.q.values = values; if (opts?.count) this.q.count = opts.count; return this; }
  upsert(values: unknown, opts?: { onConflict?: string; ignoreDuplicates?: boolean; count?: Q["count"] }) {
    this.q.op = "upsert"; this.q.values = values;
    if (opts?.onConflict) this.q.onConflict = opts.onConflict;
    if (opts?.ignoreDuplicates) this.q.ignoreDuplicates = true;
    if (opts?.count) this.q.count = opts.count;
    return this;
  }
  update(values: unknown, opts?: { count?: Q["count"] }) { this.q.op = "update"; this.q.values = values; if (opts?.count) this.q.count = opts.count; return this; }
  delete(opts?: { count?: Q["count"] }) { this.q.op = "delete"; if (opts?.count) this.q.count = opts.count; return this; }
  // ---- filters
  private f(m: Q["filters"][number]["m"], ...a: unknown[]) { this.q.filters.push({ m, a }); return this; }
  eq(c: string, v: unknown) { return this.f("eq", c, v); }
  neq(c: string, v: unknown) { return this.f("neq", c, v); }
  gt(c: string, v: unknown) { return this.f("gt", c, v); }
  gte(c: string, v: unknown) { return this.f("gte", c, v); }
  lt(c: string, v: unknown) { return this.f("lt", c, v); }
  lte(c: string, v: unknown) { return this.f("lte", c, v); }
  like(c: string, v: unknown) { return this.f("like", c, v); }
  ilike(c: string, v: unknown) { return this.f("ilike", c, v); }
  is(c: string, v: unknown) { return this.f("is", c, v); }
  in(c: string, v: unknown) { return this.f("in", c, v); }
  contains(c: string, v: unknown) { return this.f("contains", c, v); }
  containedBy(c: string, v: unknown) { return this.f("containedBy", c, v); }
  overlaps(c: string, v: unknown) { return this.f("overlaps", c, v); }
  not(c: string, op: string, v: unknown) { return this.f("not", c, op, v); }
  or(expr: string, opts?: unknown) { return opts ? this.f("or", expr, opts) : this.f("or", expr); }
  filter(c: string, op: string, v: unknown) { return this.f("filter", c, op, v); }
  match(obj: Record<string, unknown>) { return this.f("match", obj); }
  // ---- modifiers
  order(col: string, opts?: Record<string, unknown>) { this.q.order.push({ col, opts }); return this; }
  limit(n: number) { this.q.limit = n; return this; }
  range(from: number, to: number) { this.q.range = [from, to]; return this; }
  single() { this.q.single = "single"; return this; }
  maybeSingle() { this.q.single = "maybe"; return this; }
  abortSignal() { return this; }
  returns() { return this; }
  throwOnError() { return this; }

  private async run() {
    try {
      const res = await secureDb({ data: this.q });
      if (res.error?.code === "401") handleStaffAuthRequired();
      return { data: res.data as any, error: res.error as any, count: res.count, status: res.error ? 400 : 200, statusText: "" };
    } catch (e: any) {
      return { data: null, error: { message: e?.message ?? "network error" }, count: null, status: 500, statusText: "" };
    }
  }
  then<T1 = any, T2 = never>(ok?: ((v: any) => T1 | PromiseLike<T1>) | null, bad?: ((r: any) => T2 | PromiseLike<T2>) | null): PromiseLike<T1 | T2> {
    return this.run().then(ok, bad);
  }
}

/** Secure data client: same `from()` API as supabase, routed through the server. */
export const sdb = {
  from: ((table: Q["table"]) => new SecureBuilder(table)) as unknown as typeof supabase.from,
};
