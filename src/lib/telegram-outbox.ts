/**
 * Durable queue for the clinic's Telegram group.
 *
 * Uploading a file used to call the Telegram server function directly, so if
 * the doctor navigated away, locked the phone, or lost signal for a second the
 * in-flight request died and the file never reached the group.
 *
 * Now every upload writes one tiny row into `telegram_outbox` and then "kicks"
 * the server drain endpoint. Even if the kick never lands, the scheduled drain
 * picks the row up minutes later — no file is ever lost.
 */
import { supabase } from "@/integrations/supabase/client";

export interface OutboxDoc {
  url?: string | null;
  bucket?: string | null;
  path?: string | null;
  filename: string;
}

/** Ask the server to flush the queue now (best-effort, never throws). */
export function kickTelegramDrain(): void {
  try {
    void fetch("/api/public/telegram/drain", { method: "POST", keepalive: true }).catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Queue a caption + files for delivery to the Telegram group. */
export async function queueTelegram(caption: string, documents: OutboxDoc[] = []): Promise<void> {
  const text = caption.trim();
  if (!text) return;
  const docs = documents
    .filter((d) => !!d.filename && (!!d.url || (!!d.bucket && !!d.path)))
    .slice(0, 12);
  try {
    const { error } = await supabase
      .from("telegram_outbox")
      .insert({ caption: text.slice(0, 3900), documents: docs as any });
    if (error) {
      console.warn("[telegram-outbox] تعذر إضافة الرسالة للطابور", error.message);
      return;
    }
    kickTelegramDrain();
  } catch (e: any) {
    console.warn("[telegram-outbox] خطأ غير متوقع", e?.message ?? e);
  }
}
