/**
 * Pure decision logic for the "إرسال إلى تلجرام" (Send to Telegram) button.
 *
 * Kept free of React/Supabase so it can be unit-tested. The component collects
 * which expected items were found/missing/failed and hands the result here to
 * produce the user-facing toast messages.
 *
 * The contract this guarantees (and what the tests assert):
 *  - When ZIP / RAR / revision text are missing, a clear "info" message lists
 *    exactly which items were not available.
 *  - When a file URL could not be prepared, a "warning" message names it.
 *  - When Telegram rejected files, a "warning" message names the failed files.
 *  - There is ALWAYS at least one message returned, so the send can never
 *    fail (or partially succeed) silently.
 */

export type TelegramToastKind = "info" | "warning" | "success" | "error";

export interface TelegramToast {
  kind: TelegramToastKind;
  text: string;
  /** Optional display duration in ms (longer for detailed warnings). */
  duration?: number;
}

export interface TelegramSendReportInput {
  /** Expected items that were not available for this case (e.g. missing ZIP). */
  missing: string[];
  /** Items whose download/signed URL could not be prepared. */
  urlFailed: string[];
  /** Files that Telegram rejected (returned from the server function). */
  failed: { filename: string; error?: string | null }[];
  /** Number of documents that were attached to the send. */
  documentCount: number;
}

const SEP = "، ";

/**
 * Build the ordered list of toasts to show after a Telegram send attempt.
 * The order is: gaps (info) → URL prep failures (warning) → send failures /
 * final success (warning|success). Never returns an empty array.
 */
export function buildTelegramSendReport(input: TelegramSendReportInput): TelegramToast[] {
  const { missing, urlFailed, failed, documentCount } = input;
  const toasts: TelegramToast[] = [];

  if (missing.length) {
    toasts.push({
      kind: "info",
      text: `عناصر غير متوفّرة لهذه الحالة: ${missing.join(SEP)}`,
      duration: 6000,
    });
  }

  if (urlFailed.length) {
    toasts.push({
      kind: "warning",
      text: `تعذّر تجهيز رابط: ${urlFailed.join(SEP)}`,
      duration: 6000,
    });
  }

  if (failed.length) {
    const names = failed
      .map((s) => (s.error ? `${s.filename} (${s.error})` : s.filename))
      .join(SEP);
    toasts.push({
      kind: "warning",
      text: `تم إرسال البيانات لكن فشل إرسال ${failed.length} ملف: ${names}`,
      duration: 8000,
    });
  } else if (documentCount === 0) {
    toasts.push({
      kind: "success",
      text: "تم إرسال بيانات الحالة (نصيًا) — لا توجد ملفات مرفقة للإرسال",
    });
  } else {
    toasts.push({
      kind: "success",
      text: `تم إرسال تفاصيل الحالة و${documentCount} ملف إلى تلجرام`,
    });
  }

  return toasts;
}
