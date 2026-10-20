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

/** Edit a doctor's name, branch and (optionally) password. */
export const updateDoctor = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        slot: z.number().int().min(1),
        name: z.string().trim().min(2).max(120),
        branch: z.enum(["sanaa", "ibb"]).nullable(),
        password: z.string().trim().max(120).optional(),
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
      .neq("slot", data.slot)
      .maybeSingle();
    if (dup) return { ok: false, error: "يوجد طبيب مفعّل آخر بنفس الاسم" };
    const { error } = await db
      .from("doctor_profiles")
      .update({ name: data.name, branch: data.branch, updated_at: new Date().toISOString() } as never)
      .eq("slot", data.slot);
    if (error) return { ok: false, error: error.message };
    if (data.password) {
      const { error: e2 } = await db
        .from("doctor_secrets")
        .upsert({ slot: data.slot, password: data.password } as never, { onConflict: "slot" });
      if (e2) return { ok: false, error: e2.message };
    }
    return { ok: true, error: null as string | null };
  });

/* --------------------------------------------------------- batch operations */

const idList = z.array(z.string().uuid()).min(1).max(200);
const trashTable = z.enum(["slot_cases", "doctor_files", "expenses"]);

/** Move rows to the recycle bin (soft delete). Auto-purged after 7 days. */
export const batchTrash = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ table: trashTable, ids: idList }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db
      .from(data.table)
      .update({ trashed_at: new Date().toISOString() } as never)
      .in("id", data.ids);
    return { ok: !error, error: error?.message ?? null };
  });

/** Restore rows from the recycle bin. */
export const batchRestore = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ table: trashTable, ids: idList }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db
      .from(data.table)
      .update({ trashed_at: null } as never)
      .in("id", data.ids);
    return { ok: !error, error: error?.message ?? null };
  });

/** Permanently delete rows and their storage files (recycle bin emptying). */
export const batchDeletePermanent = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ table: trashTable, ids: idList }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    // Collect storage paths before deleting the rows.
    const pathCol = data.table === "doctor_files" ? "file_path" : data.table === "expenses" ? "file_path" : "scan_path";
    const bucket = data.table === "doctor_files" ? "doctor-files" : data.table === "expenses" ? "expense-receipts" : "case-files";
    const { data: rows } = await db.from(data.table).select(`id,${pathCol}`).in("id", data.ids);
    const paths = (rows ?? []).map((r: any) => r[pathCol]).filter(Boolean) as string[];
    const { error } = await db.from(data.table).delete().in("id", data.ids);
    if (error) return { ok: false, error: error.message };
    if (paths.length) await db.storage.from(bucket).remove(paths);
    return { ok: true, error: null as string | null };
  });

/** List recycle-bin rows for a table (admin trash view). */
export const listTrashed = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ table: trashTable }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const cols =
      data.table === "slot_cases"
        ? "id,case_code,patient_name,doctor_slot,trashed_at"
        : data.table === "doctor_files"
          ? "id,file_name,doctor_slot,trashed_at"
          : "id,vendor,amount,currency,file_name,trashed_at";
    const { data: rows } = await db
      .from(data.table)
      .select(cols)
      .not("trashed_at", "is", null)
      .order("trashed_at", { ascending: false });
    return (rows ?? []) as any[];
  });

/** Pin / unpin cases in bulk. */
export const batchPinCases = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ ids: idList, pinned: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { error } = await db.from("slot_cases").update({ pinned: data.pinned } as never).in("id", data.ids);
    return { ok: !error, error: error?.message ?? null };
  });

/** Move cases to another doctor in bulk. */
export const batchMoveCases = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ ids: idList, doctorSlot: z.number().int().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: doc } = await db.from("doctor_profiles").select("slot").eq("slot", data.doctorSlot).eq("active", true).maybeSingle();
    if (!doc) return { ok: false, error: "الطبيب غير موجود أو غير مفعّل" };
    const { error } = await db.from("slot_cases").update({ doctor_slot: data.doctorSlot } as never).in("id", data.ids);
    return { ok: !error, error: error?.message ?? null };
  });

/** Update a field on cases in bulk (status, shade, case_type, notes). */
export const batchUpdateCases = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        ids: idList,
        patch: z
          .object({
            status: z.string().max(40).optional(),
            shade: z.string().max(50).optional(),
            case_type: z.string().max(120).optional(),
            notes: z.string().max(4000).optional(),
          })
          .strict(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    if (Object.keys(data.patch).length === 0) return { ok: false, error: "لا يوجد تعديل" };
    const db = await admin();
    const { error } = await db.from("slot_cases").update(data.patch as never).in("id", data.ids);
    return { ok: !error, error: error?.message ?? null };
  });

/** Queue selected cases to the Telegram outbox (caption only). */
export const batchCasesToTelegram = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ ids: idList }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: rows } = await db
      .from("slot_cases")
      .select("case_code,patient_name,doctor_slot,shade,case_type")
      .in("id", data.ids);
    if (!rows?.length) return { ok: false, error: "لا توجد حالات" };
    const lines = (rows as any[]).map(
      (c) => `• ${c.case_code} — ${c.patient_name}${c.case_type ? ` (${c.case_type})` : ""}${c.shade ? ` — ${c.shade}` : ""}`,
    );
    const { error } = await db.from("telegram_outbox").insert({
      caption: `📋 دفعة حالات (${rows.length}):\n${lines.join("\n")}`,
      documents: [] as any,
    } as never);
    return { ok: !error, error: error?.message ?? null };
  });

/** Delete archiving notifications (clear receipt fields) and remove the receipt images from storage. */
export const batchDeleteArchiveNotifs = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ ids: idList }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: rows } = await db.from("slot_cases").select("id,archive_receipt_path").in("id", data.ids);
    const paths = (rows ?? []).map((r: any) => r.archive_receipt_path).filter(Boolean) as string[];
    const { error } = await db
      .from("slot_cases")
      .update({
        archive_receipt_path: null,
        archive_receipt_name: null,
        archive_receipt_sent_at: null,
        archive_request_note: null,
        archive_approval: null,
        archive_reviewed_at: null,
        archive_reviewed_by: null,
        archive_reject_reason: null,
      } as never)
      .in("id", data.ids);
    if (error) return { ok: false, error: error.message };
    if (paths.length) await db.storage.from("chat-attachments").remove(paths);
    return { ok: true, error: null as string | null };
  });

/** Permanently delete a doctor, only when they have no cases (otherwise archive). */
export const deleteDoctor = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ slot: z.number().int().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { count } = await db
      .from("slot_cases")
      .select("id", { count: "exact", head: true })
      .eq("doctor_slot", data.slot);
    if ((count ?? 0) > 0)
      return { ok: false, error: `لدى الطبيب ${count} حالة؛ لا يمكن الحذف النهائي، استخدم الأرشفة بدلاً من ذلك` };
    await db.from("doctor_secrets").delete().eq("slot", data.slot);
    const { error } = await db.from("doctor_profiles").delete().eq("slot", data.slot);
    return { ok: !error, error: error?.message ?? null };
  });

/* ------------------------------------------------- telegram outbox admin */

/** Failed + queued Telegram deliveries for the admin monitor page. */
export const listTelegramOutbox = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ status: z.enum(["failed", "pending", "sending", "paused", "all"]).default("all") }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    let q = db
      .from("telegram_outbox")
      .select("id,caption,documents,status,attempts,last_error,created_at,caption_sent,docs_total")
      .neq("status", "sent")
      .order("created_at", { ascending: false })
      .limit(300);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    const ids = (rows ?? []).map((r: any) => r.id);
    let logs: any[] = [];
    if (ids.length) {
      const { data: l } = await (db as any)
        .from("telegram_outbox_log")
        .select("id,outbox_id,action,actor,result,error,created_at")
        .in("outbox_id", ids)
        .order("created_at", { ascending: false })
        .limit(2000);
      logs = l ?? [];
    }
    return { rows: (rows ?? []) as any[], logs, error: error?.message ?? null };
  });

async function logOutbox(db: any, ids: string[], action: string, actor: string, result = "ok", err: string | null = null) {
  if (!ids.length) return;
  await db.from("telegram_outbox_log").insert(ids.map((outbox_id) => ({ outbox_id, action, actor, result, error: err })));
}

/** Separate admin permissions for queue actions (app_settings flags, default allowed). */
export const TG_PERMS = { retry: "tg_perm_retry", pause: "tg_perm_pause", remove: "tg_perm_remove" } as const;
async function tgAllowed(db: any, key: string): Promise<boolean> {
  const { data } = await db.from("app_settings").select("bool_value").eq("key", key).maybeSingle();
  return data ? data.bool_value !== false : true;
}
const DENIED = { ok: false, error: "ليست لديك صلاحية لهذا الإجراء" };

export const getTelegramPerms = createServerFn({ method: "POST" }).handler(async () => {
  const db = await admin();
  return {
    retry: await tgAllowed(db, TG_PERMS.retry),
    pause: await tgAllowed(db, TG_PERMS.pause),
    remove: await tgAllowed(db, TG_PERMS.remove),
  };
});

const actorSchema = z.string().trim().max(80).default("الإدارة");

/** Put rows back in the queue (fresh attempts) so the drain re-sends them. */
export const retryTelegramOutbox = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ ids: z.array(z.string().uuid()).min(1).max(300), actor: actorSchema }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    if (!(await tgAllowed(db, TG_PERMS.retry))) return DENIED;
    const { error } = await db
      .from("telegram_outbox")
      .update({ status: "pending", attempts: 0, last_error: null, created_at: new Date().toISOString() } as never)
      .in("id", data.ids)
      .neq("status", "sent");
    await logOutbox(db, data.ids, "retry", data.actor, error ? "failed" : "queued", error?.message ?? null);
    return { ok: !error, error: error?.message ?? null };
  });

/** Pause sending: the drain only picks "pending" rows, so paused rows stay put. */
export const pauseTelegramOutbox = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ ids: z.array(z.string().uuid()).min(1).max(300), actor: actorSchema }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    if (!(await tgAllowed(db, TG_PERMS.pause))) return DENIED;
    const { error } = await db.from("telegram_outbox").update({ status: "paused" } as never)
      .in("id", data.ids).in("status", ["pending", "failed", "sending"]);
    await logOutbox(db, data.ids, "pause", data.actor, error ? "failed" : "ok", error?.message ?? null);
    return { ok: !error, error: error?.message ?? null };
  });

/** Drop one attached file from a queued row. */
export const removeTelegramOutboxDoc = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid(), index: z.number().int().min(0), actor: actorSchema }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    if (!(await tgAllowed(db, TG_PERMS.remove))) return DENIED;
    const { data: row, error: e1 } = await db.from("telegram_outbox").select("documents,docs_total").eq("id", data.id).maybeSingle();
    if (e1 || !row) return { ok: false, error: e1?.message ?? "غير موجود" };
    const docs = Array.isArray((row as any).documents) ? [...(row as any).documents] : [];
    const [gone] = docs.splice(data.index, 1);
    const total = Math.max(0, ((row as any).docs_total ?? docs.length + 1) - 1);
    const { error } = await db.from("telegram_outbox").update({ documents: docs, docs_total: total } as never).eq("id", data.id);
    await logOutbox(db, [data.id], "remove_file", data.actor, error ? "failed" : "ok", error?.message ?? (gone?.filename ? `حُذف: ${gone.filename}` : null));
    return { ok: !error, error: error?.message ?? null };
  });

/** Remove rows from the queue entirely. */
export const deleteTelegramOutbox = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ ids: z.array(z.string().uuid()).min(1).max(300) }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    if (!(await tgAllowed(db, TG_PERMS.remove))) return DENIED;
    const { error } = await db.from("telegram_outbox").delete().in("id", data.ids);
    if (!error) await (db as any).from("telegram_outbox_log").delete().in("outbox_id", data.ids);
    return { ok: !error, error: error?.message ?? null };
  });
