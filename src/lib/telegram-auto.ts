/**
 * Instant auto-forwarding of case files (ZIP / RAR / images) to the clinic's
 * dedicated Telegram group the moment they are uploaded.
 *
 * Fire-and-forget by design: a Telegram failure must never block or fail the
 * doctor's / designer's upload flow, so errors are only logged.
 */

export interface AutoTelegramFile {
  url: string;
  filename: string;
}

/** Send a caption + files to the Telegram group without awaiting the result. */
export function autoSendFilesToTelegram(caption: string, files: AutoTelegramFile[]): void {
  const documents = files.filter((f) => !!f.url && !!f.filename).slice(0, 12);
  if (!caption.trim()) return;
  void (async () => {
    try {
      const { sendCaseToTelegram } = await import("@/lib/telegram.functions");
      await sendCaseToTelegram({ data: { caption: caption.slice(0, 3900), documents } });
    } catch (e) {
      console.warn("[telegram-auto] الإرسال التلقائي إلى تلجرام لم ينجح", e);
    }
  })();
}

/** Convenience wrapper for a single file upload event. */
export function autoSendFileToTelegram(opts: {
  kind: "zip" | "rar" | "image" | "html";
  from: string;
  caseCode: string;
  patientName?: string | null;
  doctorName?: string | null;
  url: string;
  filename: string;
}): void {
  const icon = opts.kind === "zip" ? "🗜️" : opts.kind === "rar" ? "📦" : opts.kind === "image" ? "🖼️" : "🌐";
  const label =
    opts.kind === "zip" ? "ملف ZIP" :
    opts.kind === "rar" ? "ملف تصميم RAR" :
    opts.kind === "image" ? "صورة" : "ملف HTML";
  const lines = [
    `${icon} إرسال تلقائي — ${label}`,
    `المصدر: ${opts.from}`,
    `الحالة: ${opts.caseCode}`,
    opts.patientName ? `المريض: ${opts.patientName}` : null,
    opts.doctorName ? `الطبيب: ${opts.doctorName}` : null,
    `الملف: ${opts.filename}`,
  ].filter(Boolean);
  autoSendFilesToTelegram(lines.join("\n"), [{ url: opts.url, filename: opts.filename }]);
}
