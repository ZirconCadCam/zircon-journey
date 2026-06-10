import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Send a full case bundle to the configured Telegram group.
 * - One text message with the case data.
 * - One sendDocument call per attached file (passed as a publicly reachable
 *   URL — signed Supabase URLs work; Telegram fetches the file itself).
 *
 * Requires the Telegram connector (TELEGRAM_API_KEY) and a TELEGRAM_CHAT_ID
 * secret pointing to the destination group.
 */

const docSchema = z.object({
  url: z.string().url().max(2000),
  filename: z.string().min(1).max(200),
});

const schema = z.object({
  caption: z.string().min(1).max(4000),
  documents: z.array(docSchema).max(12).default([]),
});

const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

export const sendCaseToTelegram = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const TELEGRAM_API_KEY = process.env.TELEGRAM_API_KEY;
    // Archive group "مركز زركون CadCam لتجميل الاسنان".
    // The verified destination is the supergroup below. A TELEGRAM_CHAT_ID
    // override is honoured ONLY when it is a valid group/channel id
    // (e.g. -100xxxxxxxxxx). An invalid value such as the bot's own id causes
    // Telegram's "Forbidden: bot can't send messages to the bot" 403, so we
    // ignore it and fall back to the known-good group id.
    const DEFAULT_CHAT_ID = "-1003242061826";
    const envChat = (process.env.TELEGRAM_CHAT_ID || "").trim();
    const chatId = /^-100\d{6,}$/.test(envChat) ? envChat : DEFAULT_CHAT_ID;

    if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) {
      throw new Error("تكامل تلجرام غير مُهيّأ.");
    }


    const headers = {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TELEGRAM_API_KEY,
      "Content-Type": "application/json",
    };

    // 1) Case data as a text message.
    const msgRes = await fetch(`${GATEWAY}/sendMessage`, {
      method: "POST",
      headers,
      body: JSON.stringify({ chat_id: chatId, text: data.caption }),
    });
    const msgJson: any = await msgRes.json().catch(() => ({}));
    if (!msgRes.ok || !msgJson?.ok) {
      throw new Error(
        `فشل إرسال بيانات الحالة [${msgRes.status}]: ${msgJson?.description ?? "خطأ"}`,
      );
    }

    // 2) Each file as a document.
    const sent: { filename: string; ok: boolean; error: string | null }[] = [];
    for (const doc of data.documents) {
      try {
        const res = await fetch(`${GATEWAY}/sendDocument`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            chat_id: chatId,
            document: doc.url,
            caption: doc.filename,
          }),
        });
        const j: any = await res.json().catch(() => ({}));
        sent.push({
          filename: doc.filename,
          ok: res.ok && !!j?.ok,
          error: j?.ok ? null : j?.description ?? `HTTP ${res.status}`,
        });
      } catch (e: any) {
        sent.push({ filename: doc.filename, ok: false, error: e?.message ?? "خطأ" });
      }
    }

    return { ok: true, sent };
  });
