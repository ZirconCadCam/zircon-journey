/**
 * Server-side data gateway for staff screens.
 *
 * The browser no longer reads or writes cases, chat, doctor files or file
 * activity directly. Screens describe the query (table, filters, values) and
 * this function runs it with the server key only after verifying the caller's
 * signed staff ticket. Doctors are confined to their own doctor slot.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TABLES = [
  "slot_cases",
  "chat_conversations",
  "chat_messages",
  "doctor_files",
  "file_activity",
  "case_revision_rounds",
  "telegram_file_links",
  "app_settings",
  "avatar_overrides",
] as const;
type Table = (typeof TABLES)[number];
type Op = "select" | "insert" | "update" | "delete" | "upsert";

/** Operations the browser was never allowed to do on these tables. */
const FORBIDDEN: Partial<Record<Table, Op[]>> = {
  chat_messages: ["delete"],
  doctor_files: ["delete"],
  file_activity: ["update", "delete", "upsert"],
  telegram_file_links: ["insert", "update", "delete", "upsert"],
  app_settings: ["insert", "update", "delete", "upsert"],
  avatar_overrides: ["insert", "update", "delete", "upsert"],
};
/** Tables keyed directly by doctor_slot. */
const SLOT_TABLES: Table[] = ["slot_cases", "chat_conversations", "doctor_files", "case_revision_rounds"];

const IDENT = /^[A-Za-z0-9_.\->:,*() !"]+$/;
const FILTER_METHODS = ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in", "contains", "containedBy", "overlaps", "not", "or", "filter", "match"] as const;

const querySchema = z.object({
  table: z.enum(TABLES),
  op: z.enum(["select", "insert", "update", "delete", "upsert"]),
  columns: z.string().max(4000).regex(IDENT).optional(),
  head: z.boolean().optional(),
  count: z.enum(["exact", "planned", "estimated"]).optional(),
  filters: z.array(z.object({ m: z.enum(FILTER_METHODS), a: z.array(z.any()).max(4) })).max(40).default([]),
  order: z.array(z.object({ col: z.string().max(100).regex(IDENT), opts: z.record(z.string(), z.any()).optional() })).max(6).default([]),
  limit: z.number().int().min(0).max(10000).optional(),
  range: z.tuple([z.number().int().min(0), z.number().int().min(0)]).optional(),
  single: z.enum(["single", "maybe"]).optional(),
  values: z.any().optional(),
  onConflict: z.string().max(200).regex(IDENT).optional(),
  ignoreDuplicates: z.boolean().optional(),
  returning: z.string().max(4000).regex(IDENT).optional(),
});
export type SecureQuery = z.infer<typeof querySchema>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result = { data: any; error: { message: string; code?: string } | null; count: number | null };

export const secureDb = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => querySchema.parse(d))
  .handler(async ({ data: q }): Promise<Result> => {
    const { allowedSlots, StaffAuthError } = await import("./staff-ticket.server");
    let slots: number[] | null;
    try {
      ({ slots } = await allowedSlots());
    } catch (e) {
      if (e instanceof StaffAuthError) return { data: null, error: { message: "STAFF_AUTH_REQUIRED", code: "401" }, count: null };
      throw e;
    }
    if (FORBIDDEN[q.table]?.includes(q.op)) return { data: null, error: { message: "غير مسموح", code: "403" }, count: null };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    // Doctor scope: which rows this caller may touch.
    let scopeCol: string | null = null;
    let scopeVals: (string | number)[] | null = null;
    if (slots) {
      if (SLOT_TABLES.includes(q.table)) {
        scopeCol = "doctor_slot";
        scopeVals = slots;
      } else if (q.table === "chat_messages") {
        const { data: convs } = await db.from("chat_conversations").select("id").in("doctor_slot", slots);
        scopeCol = "conversation_id";
        scopeVals = ((convs ?? []) as { id: string }[]).map((c) => c.id);
      } else if (q.table === "file_activity") {
        const { data: cs } = await db.from("slot_cases").select("id").in("doctor_slot", slots);
        scopeCol = "case_id";
        scopeVals = ((cs ?? []) as { id: string }[]).map((c) => c.id);
      } else if (q.op !== "select") {
        return { data: null, error: { message: "غير مسموح", code: "403" }, count: null };
      }
    }

    // Writes by doctors must stay inside their scope.
    if (scopeCol && (q.op === "insert" || q.op === "upsert" || q.op === "update")) {
      const rows = Array.isArray(q.values) ? q.values : [q.values];
      for (const r of rows) {
        if (!r || typeof r !== "object") continue;
        if (scopeCol in r && !scopeVals!.includes((r as any)[scopeCol])) {
          return { data: null, error: { message: "غير مسموح", code: "403" }, count: null };
        }
        if ((q.op === "insert" || q.op === "upsert") && !(scopeCol in r)) {
          return { data: null, error: { message: "غير مسموح", code: "403" }, count: null };
        }
      }
    }

    const base = db.from(q.table);
    let b: any;
    const countOpt = q.count ? { count: q.count, head: !!q.head } : q.head ? { head: true } : undefined;
    switch (q.op) {
      case "select": b = base.select(q.columns ?? "*", countOpt); break;
      case "insert": b = base.insert(q.values, q.count ? { count: q.count } : undefined); break;
      case "upsert": b = base.upsert(q.values, { onConflict: q.onConflict, ignoreDuplicates: q.ignoreDuplicates, count: q.count }); break;
      case "update": b = base.update(q.values, q.count ? { count: q.count } : undefined); break;
      case "delete": b = base.delete(q.count ? { count: q.count } : undefined); break;
    }
    if (q.op !== "select" && q.returning !== undefined) b = b.select(q.returning || "*");
    if (scopeCol && q.op !== "insert" && q.op !== "upsert") b = b.in(scopeCol, scopeVals!.length ? scopeVals : ["00000000-0000-0000-0000-000000000000"]);
    for (const f of q.filters) {
      if (f.m !== "or" && f.m !== "match" && typeof f.a[0] === "string" && !IDENT.test(f.a[0])) {
        return { data: null, error: { message: "bad filter" }, count: null };
      }
      b = b[f.m](...f.a);
    }
    for (const o of q.order) b = b.order(o.col, o.opts);
    if (q.limit !== undefined) b = b.limit(q.limit);
    if (q.range) b = b.range(q.range[0], q.range[1]);
    if (q.single === "single") b = b.single();
    if (q.single === "maybe") b = b.maybeSingle();

    const res = await b;
    return {
      data: res.data ?? null,
      error: res.error ? { message: String(res.error.message), code: res.error.code } : null,
      count: typeof res.count === "number" ? res.count : null,
    };
  });
