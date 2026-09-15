import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Send a full case bundle to the configured Telegram group via the @ZirconiaBot
 * bot token (TELEGRAM_BOT_TOKEN).
 * - One text message with the case data.
 * - One sendDocument call per attached file (passed as a publicly reachable
 *   URL — signed Supabase URLs work; Telegram fetches the file itself, and we
 *   also try a direct multipart upload for reliability with archives).
 *
 * Fire-and-forget by design: a Telegram failure must never block the upload flow.
 */

const docSchema = z.object({
  url: z.string().url().max(2000),
  filename: z.string().min(1).max(200),
});

const schema = z.object({
  caption: z.string().min(1).max(4000),
  documents: z.array(docSchema).max(12).default([]),
});

/** Base URL for direct Telegram Bot API calls using the bot token. */
function telegramApi(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN غير مُهيّأ.");
  return `https://api.telegram.org/bot${token}`;
}

export const sendCaseToTelegram = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data }) => {
    // Destination group. Only accept a real group/channel id (negative, e.g.
    // -1003242061826) or a public @username. A positive numeric id is a private
    // user/bot id — sending there fails with 403 — so it is ignored in favour of
    // the known clinic group.
    const DEFAULT_CHAT_ID = "-1003242061826";
    const envChat = (process.env.TELEGRAM_CHAT_ID || "").trim();
    const isValidChat = /^-\d{6,}$/.test(envChat) || /^@[A-Za-z0-9_]{4,}$/.test(envChat);
    const chatId = isValidChat ? envChat : DEFAULT_CHAT_ID;


    const API = telegramApi();
    // Telegram's bot API allows up to 50 MB per document when uploaded directly.
    const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

    // 1) Case data as a text message.
    const msgRes = await fetch(`${API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: data.caption, parse_mode: "HTML" }),
    });
    const msgJson: any = await msgRes.json().catch(() => ({}));
    if (!msgRes.ok || !msgJson?.ok) {
      const desc = String(msgJson?.description ?? `HTTP ${msgRes.status}`);
      const hint = /chat not found|bot is not a member|kicked|Forbidden/i.test(desc)
        ? " — تأكّد من إضافة البوت إلى الجروب كمشرف وضبط معرّف الجروب الصحيح (TELEGRAM_CHAT_ID)."
        : "";
      throw new Error(`فشل إرسال بيانات الحالة [${msgRes.status}]: ${desc}${hint}`);
    }

    // 2) Each file as a document.
    //
    // Telegram's "send by URL" path silently fails for many real files: it has
    // a hard ~20 MB limit and frequently rejects archives (.rar/.zip) it can't
    // fetch. So we download the file ourselves and upload the bytes as
    // multipart/form-data (50 MB limit, no Telegram-side fetch). We only fall
    // back to the URL method if the download itself fails.
    const sent: { filename: string; ok: boolean; error: string | null }[] = [];
    for (const doc of data.documents) {
      try {
        let uploaded = false;
        let lastError: string | null = null;

        // --- Preferred path: download + multipart upload ---
        try {
          const fileRes = await fetch(doc.url);
          if (!fileRes.ok) {
            lastError = `تعذّر تنزيل الملف من المصدر [HTTP ${fileRes.status}]`;
          } else {
            const bytes = await fileRes.arrayBuffer();
            if (bytes.byteLength > MAX_UPLOAD_BYTES) {
              lastError = `حجم الملف ${(bytes.byteLength / 1048576).toFixed(1)}MB يتجاوز حد تلجرام (50MB)`;
            } else {
              const form = new FormData();
              form.append("chat_id", chatId);
              form.append("caption", doc.filename);
              form.append(
                "document",
                new Blob([bytes], { type: "application/octet-stream" }),
                doc.filename,
              );
              const res = await fetch(`${API}/sendDocument`, {
                method: "POST",
                body: form,
              });
              const j: any = await res.json().catch(() => ({}));
              if (res.ok && j?.ok) {
                uploaded = true;
              } else {
                lastError = j?.description ?? `HTTP ${res.status}`;
              }
            }
          }
        } catch (e: any) {
          lastError = e?.message ?? "خطأ أثناء التنزيل";
        }

        // --- Fallback path: let Telegram fetch the URL directly ---
        if (!uploaded) {
          try {
            const res = await fetch(`${API}/sendDocument`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: chatId,
                document: doc.url,
                caption: doc.filename,
              }),
            });
            const j: any = await res.json().catch(() => ({}));
            if (res.ok && j?.ok) {
              uploaded = true;
              lastError = null;
            } else {
              lastError = j?.description ?? lastError ?? `HTTP ${res.status}`;
            }
          } catch (e: any) {
            lastError = e?.message ?? lastError ?? "خطأ";
          }
        }

        sent.push({ filename: doc.filename, ok: uploaded, error: uploaded ? null : lastError });
      } catch (e: any) {
        sent.push({ filename: doc.filename, ok: false, error: e?.message ?? "خطأ" });
      }
    }

    return { ok: true, sent };
  });
