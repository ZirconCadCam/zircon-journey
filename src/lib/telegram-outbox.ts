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
import { toast } from "sonner";
import { queueTelegramOutbox } from "@/lib/secure-ops.functions";

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

/**
 * Queue a caption + files for delivery to the Telegram group.
 * Returns true only when the row really landed in the queue, so callers that
 * clear local state afterwards can abort instead of losing data silently.
 */
export async function queueTelegram(
  caption: string,
  documents: OutboxDoc[] = [],
): Promise<boolean> {
  const text = caption.trim();
  if (!text) return false;
  const docs = documents
    .filter((d) => !!d.filename && (!!d.url || (!!d.bucket && !!d.path)))
    .slice(0, 12);
  try {
    const res = await queueTelegramOutbox({ data: { caption: text.slice(0, 3900), documents: docs } });
    if (!res?.ok) {
      console.warn("[telegram-outbox] تعذر إضافة الرسالة للطابور", res?.error);
      toast.warning("تعذر جدولة إرسال الملفات إلى جروب تلجرام — أعد المحاولة");
      return false;
    }
    kickTelegramDrain();
    return true;
  } catch (e: any) {
    console.warn("[telegram-outbox] خطأ غير متوقع", e?.message ?? e);
    toast.warning("تعذر جدولة إرسال الملفات إلى جروب تلجرام — أعد المحاولة");
    return false;
  }
}
