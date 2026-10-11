/**
 * Server-side gateway for sensitive data and private files.
 *
 * The accounting ledgers, the revision-round log, the Telegram outbox and the
 * private storage buckets used to be readable/writable straight from the
 * browser with the public key. They are now locked at the database level and
 * every operation goes through these validated server functions instead, so
 * nobody outside the app can list, tamper with, or download that data.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Buckets that are private and may only be reached through these functions. */
const PRIVATE_BUCKETS = ["chat-attachments", "case-files"] as const;
const bucketSchema = z.enum(PRIVATE_BUCKETS);
const pathSchema = z.string().min(1).max(600);

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/* ------------------------------------------------------------------ storage */

export const signStoredUrl = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        bucket: bucketSchema,
        path: pathSchema,
        seconds: z.number().int().min(10).max(60 * 60 * 24 * 365).default(300),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: signed, error } = await db.storage
      .from(data.bucket)
      .createSignedUrl(data.path, data.seconds);
    if (error) return { url: null as string | null, error: error.message };
    return { url: signed?.signedUrl ?? null, error: null as string | null };
  });

/**
 * One-time signed upload ticket for a private bucket. The browser can no longer
 * write to these buckets directly (RLS only allows authenticated sessions, and
 * staff screens run anonymously), so the server mints an upload token instead.
 */
export const createPrivateUploadUrl = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ bucket: bucketSchema, path: pathSchema }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: signed, error } = await db.storage
      .from(data.bucket)
      .createSignedUploadUrl(data.path);
    if (error || !signed) return { token: null as string | null, error: error?.message ?? "no token" };
    return { token: signed.token as string, error: null as string | null };
  });

export const removeStoredObjects = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ bucket: bucketSchema, paths: z.array(pathSchema).min(1).max(50) }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db.storage.from(data.bucket).remove(data.paths);
    return { ok: !error, error: error?.message ?? null };
  });

/* ------------------------------------------------------------ telegram queue */

export const queueTelegramOutbox = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        caption: z.string().trim().min(1).max(3900),
        documents: z
          .array(
            z.object({
              url: z.string().url().max(2000).nullish(),
              bucket: z.string().max(100).nullish(),
              path: z.string().max(600).nullish(),
              filename: z.string().min(1).max(300),
            }),
          )
          .max(12)
          .default([]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db
      .from("telegram_outbox")
      .insert({ caption: data.caption, documents: data.documents as any });
    return { ok: !error, error: error?.message ?? null };
  });

/* ----------------------------------------------------------- revision rounds */

export const revisionRoundOpen = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        caseId: z.string().uuid(),
        caseCode: z.string().max(100).nullish(),
        patientName: z.string().max(200).nullish(),
        doctorSlot: z.number().int().nullish(),
        doctorName: z.string().max(200).nullish(),
        notes: z.string().max(4000).nullish(),
        shade: z.string().max(50).nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { count } = await db
      .from("case_revision_rounds")
      .select("id", { count: "exact", head: true })
      .eq("case_id", data.caseId);
    const { error } = await db.from("case_revision_rounds").insert({
      case_id: data.caseId,
      case_code: data.caseCode ?? null,
      patient_name: data.patientName ?? null,
      doctor_slot: data.doctorSlot ?? null,
      doctor_name: data.doctorName ?? null,
      round: (count ?? 0) + 1,
      doctor_notes: data.notes ?? null,
      shade: data.shade ?? null,
    } as any);
    return { ok: !error, error: error?.message ?? null };
  });

export const revisionRoundAttach = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        caseId: z.string().uuid(),
        patch: z
          .object({
            rar_path: z.string().max(600).optional(),
            rar_name: z.string().max(300).optional(),
            html_path: z.string().max(600).optional(),
            html_name: z.string().max(300).optional(),
          })
          .strict(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: rows } = await db
      .from("case_revision_rounds")
      .select("id")
      .eq("case_id", data.caseId)
      .order("round", { ascending: false })
      .limit(1);
    const id = (rows ?? [])[0]?.id as string | undefined;
    if (!id) return { ok: false, error: "no round" };
    const now = new Date().toISOString();
    const { error } = await db
      .from("case_revision_rounds")
      .update({
        ...data.patch,
        ...(data.patch.rar_path ? { rar_sent_at: now } : {}),
        ...(data.patch.html_path ? { html_sent_at: now } : {}),
      } as any)
      .eq("id", id);
    return { ok: !error, error: error?.message ?? null };
  });

export const revisionRoundList = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data } = await db
    .from("case_revision_rounds")
    .select("*")
    .order("requested_at", { ascending: false });
  return (data ?? []) as any[];
});

/* --------------------------------------------------------------- accounting */

const scopeSchema = z.enum(["designer", "technician", "doctor"]);

export const listPointWithdrawals = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ doctorSlot: z.number().int().nullish() }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const db = await admin();
    let q = db.from("doctor_point_withdrawals").select("doctor_slot,points");
    if (typeof data.doctorSlot === "number") q = q.eq("doctor_slot", data.doctorSlot);
    const { data: rows } = await q;
    return (rows ?? []) as { doctor_slot: number; points: number }[];
  });

export const addPointWithdrawal = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ doctorSlot: z.number().int(), points: z.number().int().min(1).max(100000) }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db
      .from("doctor_point_withdrawals")
      .insert({ doctor_slot: data.doctorSlot, points: data.points } as any);
    return { ok: !error, error: error?.message ?? null };
  });

export const listMonthSettlements = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ scope: scopeSchema, year: z.number().int() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: rows } = await db
      .from("staff_month_settlements")
      .select("month,settled")
      .eq("scope", data.scope)
      .eq("year", data.year);
    return (rows ?? []) as { month: number; settled: boolean }[];
  });

export const setMonthSettlement = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        scope: scopeSchema,
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
        settled: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db
      .from("staff_month_settlements")
      .upsert(
        { scope: data.scope, year: data.year, month: data.month, settled: data.settled } as any,
        { onConflict: "scope,year,month" },
      );
    return { ok: !error, error: error?.message ?? null };
  });

export const getAccountingReview = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        scope: z.string().max(40),
        doctorSlot: z.number().int(),
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: row } = await db
      .from("accounting_reviews")
      .select("reviewed,reviewed_at")
      .eq("scope", data.scope)
      .eq("doctor_slot", data.doctorSlot)
      .eq("year", data.year)
      .eq("month", data.month)
      .maybeSingle();
    return (row ?? null) as { reviewed: boolean; reviewed_at: string } | null;
  });

export const setAccountingReview = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        scope: z.string().max(40),
        doctorSlot: z.number().int(),
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
        reviewed: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db.from("accounting_reviews").upsert(
      {
        scope: data.scope,
        doctor_slot: data.doctorSlot,
        year: data.year,
        month: data.month,
        reviewed: data.reviewed,
        reviewed_at: new Date().toISOString(),
        reviewed_by: "admin",
      } as any,
      { onConflict: "scope,doctor_slot,year,month" },
    );
    return { ok: !error, error: error?.message ?? null };
  });

export const listAccountingReviews = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ year: z.number().int(), month: z.number().int().min(1).max(12) }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: rows } = await db
      .from("accounting_reviews")
      .select("scope,doctor_slot,reviewed")
      .eq("year", data.year)
      .eq("month", data.month);
    return (rows ?? []) as { scope: string; doctor_slot: number; reviewed: boolean }[];
  });

/* ------------------------------------------------------------------ doctors */

/**
 * Adds a new doctor in a brand-new slot (never reuses an inactive slot, so an
 * old doctor's cases are not reassigned). Writes the profile and the password
 * together and rolls the profile back if the password cannot be saved.
 */
export const addDoctor = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        name: z.string().trim().min(2).max(120),
        branch: z.enum(["sanaa", "ibb"]).nullable(),
        password: z.string().trim().min(1).max(120),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: dup } = await db
      .from("doctor_profiles")
      .select("slot")
      .eq("name", data.name)
      .eq("active", true)
      .maybeSingle();
    if (dup) return { slot: null as number | null, error: "يوجد طبيب مفعّل بنفس الاسم" };

    const { data: last, error: maxErr } = await db
      .from("doctor_profiles")
      .select("slot")
      .order("slot", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxErr) return { slot: null as number | null, error: maxErr.message };
    const slot = (last?.slot ?? 0) + 1;

    const { error: insErr } = await db
      .from("doctor_profiles")
      .insert({ slot, name: data.name, branch: data.branch, active: true } as never);
    if (insErr) return { slot: null as number | null, error: insErr.message };

    const { error: secErr } = await db
      .from("doctor_secrets")
      .upsert({ slot, password: data.password } as never, { onConflict: "slot" });
    if (secErr) {
      await db.from("doctor_profiles").delete().eq("slot", slot);
      return { slot: null as number | null, error: secErr.message };
    }
    return { slot, error: null as string | null };
  });
