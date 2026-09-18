import { createFileRoute } from "@tanstack/react-router";

/**
 * Durable Telegram sender.
 *
 * Every file uploaded anywhere in the app is queued into `telegram_outbox`
 * (a tiny DB insert that always succeeds even on a flaky mobile connection),
 * and this endpoint drains the queue: it re-signs the storage object, uploads
 * the bytes to the clinic group through the bot, and marks the row sent.
 *
 * It is safe to call repeatedly (client "kick" after each upload + pg_cron
 * retry loop): rows are claimed before sending, so nothing is sent twice.
 */

const DEFAULT_CHAT_ID = "-1003242061826";
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_ATTEMPTS = 8;

interface Doc {
  url?: string | null;
  bucket?: string | null;
  path?: string | null;
  filename: string;
}

function chatId(): string {
  const env = (process.env["TELEGRAM_CHAT_ID"] || "").trim();
  const valid = /^-\d{6,}$/.test(env) || /^@[A-Za-z0-9_]{4,}$/.test(env);
  return valid ? env : DEFAULT_CHAT_ID;
}

/** Extract bucket + object path out of a Supabase signed/public storage URL. */
function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/]+)\/(.+)$/);
    if (!m) return null;
    return { bucket: decodeURIComponent(m[1]!), path: decodeURIComponent(m[2]!) };
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/public/telegram/drain")({
  server: {
    handlers: {
      GET: async () => handle(),
      POST: async () => handle(),
    },
  },
});

async function handle(): Promise<Response> {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) return Response.json({ ok: false, error: "TELEGRAM_BOT_TOKEN missing" }, { status: 200 });
  const API = `https://api.telegram.org/bot${token}`;
  const chat = chatId();

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Abandon anything older than a day: only today's uploads matter for the group.
  const staleBefore = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await supabaseAdmin
    .from("telegram_outbox")
    .update({ status: "failed", last_error: "تم تجاهلها (قديمة)" })
    .eq("status", "pending")
    .lt("created_at", staleBefore);

  const { data: rows } = await supabaseAdmin
    .from("telegram_outbox")
    .select("*")
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(10);

  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const row of (rows ?? []) as any[]) {
    // Claim the row so a concurrent drain does not resend it.
    const { data: claimed } = await supabaseAdmin
      .from("telegram_outbox")
      .update({ status: "sending", attempts: (row.attempts ?? 0) + 1 })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    let captionSent = row.caption_sent === true;
    const pendingDocs: Doc[] = [];

    try {
      // 1) The caption / case data as a text message — only once per row, so a
      //    retry caused by a single bad file never repeats the case text.
      if (!captionSent) {
        const msgRes = await fetch(`${API}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chat, text: String(row.caption).slice(0, 4000) }),
        });
        const msgJson: any = await msgRes.json().catch(() => ({}));
        if (!msgRes.ok || !msgJson?.ok) {
          throw new Error(String(msgJson?.description ?? `HTTP ${msgRes.status}`));
        }
        captionSent = true;
      }

      // 2) Every attached file as a document (bytes uploaded directly).
      //    Delivered files are dropped from the row, so a retry only re-sends
      //    the ones that actually failed.
      const docs = (Array.isArray(row.documents) ? row.documents : []) as Doc[];
      const failed: string[] = [];
      for (const doc of docs) {
        try {
          let bucket = doc.bucket ?? null;
          let path = doc.path ?? null;
          if ((!bucket || !path) && doc.url) {
            const parsed = parseStorageUrl(doc.url);
            if (parsed) { bucket = parsed.bucket; path = parsed.path; }
          }

          let fetchUrl = doc.url ?? null;
          if (bucket && path) {
            const { data: signed } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, 3600);
            if (signed?.signedUrl) fetchUrl = signed.signedUrl;
          }
          if (!fetchUrl) throw new Error("لا يوجد رابط للملف");

          const fileRes = await fetch(fetchUrl);
          if (!fileRes.ok) throw new Error(`تنزيل الملف فشل [HTTP ${fileRes.status}]`);
          const bytes = await fileRes.arrayBuffer();
          if (bytes.byteLength > MAX_UPLOAD_BYTES) {
            throw new Error(`الحجم ${(bytes.byteLength / 1048576).toFixed(1)}MB يتجاوز حد تلجرام`);
          }

          const form = new FormData();
          form.append("chat_id", chat);
          form.append("caption", doc.filename);
          form.append("document", new Blob([bytes], { type: "application/octet-stream" }), doc.filename);
          const res = await fetch(`${API}/sendDocument`, { method: "POST", body: form });
          const j: any = await res.json().catch(() => ({}));
          if (!res.ok || !j?.ok) throw new Error(String(j?.description ?? `HTTP ${res.status}`));
        } catch (e: any) {
          failed.push(`${doc.filename}: ${e?.message ?? "خطأ"}`);
          pendingDocs.push(doc);
        }
      }

      if (failed.length) throw new Error(failed.join(" | "));

      await supabaseAdmin
        .from("telegram_outbox")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          last_error: null,
          caption_sent: true,
          documents: [] as any,
        })
        .eq("id", row.id);
      results.push({ id: row.id, ok: true });
    } catch (e: any) {
      const error = String(e?.message ?? "خطأ");
      const attempts = (row.attempts ?? 0) + 1;
      // Keep only the files that still need delivery, so retries never duplicate.
      await supabaseAdmin
        .from("telegram_outbox")
        .update({
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          last_error: error,
          caption_sent: captionSent,
          ...(captionSent ? { documents: pendingDocs as any } : {}),
        })
        .eq("id", row.id);
      results.push({ id: row.id, ok: false, error });
    }
  }

  return Response.json({ ok: true, processed: results.length, results });
}
