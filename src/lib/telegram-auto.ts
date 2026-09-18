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

/**
 * Queue a caption + files for the Telegram group.
 *
 * The delivery itself happens on the server from a durable queue, so closing
 * the page or losing the connection right after an upload no longer drops the
 * file: it is retried automatically until it lands in the group.
 */
/**
 * Extensions whose Telegram filename should be the patient's name so the
 * group stays searchable by case name instead of random characters.
 */
const PATIENT_NAME_EXTS = new Set(["zip", "rar", "html", "htm"]);

/** Rename an archive/HTML file to "<patient name>.<ext>" for Telegram search. */
export function patientFileName(patientName: string | null | undefined, filename: string): string {
  const ext = filename.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();
  const name = patientName?.trim().replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  if (!ext || !PATIENT_NAME_EXTS.has(ext) || !name) return filename;
  return `${name}.${ext}`;
}

export function autoSendFilesToTelegram(
  caption: string,
  files: AutoTelegramFile[],
  patientName?: string | null,
): void {
  const documents = files
    .filter((f) => !!f.url && !!f.filename)
    .slice(0, 12)
    .map((f) => ({ ...f, filename: patientFileName(patientName, f.filename) }));
  if (!caption.trim()) return;
  void (async () => {
    const { queueTelegram } = await import("@/lib/telegram-outbox");
    await queueTelegram(caption, documents);
  })();
}


export interface CaseCaptionInfo {
  /** Short headline, e.g. "ملف تصميم RAR" */
  title: string;
  icon?: string;
  from?: string | null;
  caseCode?: string | null;
  patientName?: string | null;
  doctorName?: string | null;
  /** Human-readable current stage label, e.g. "تم التصميم". */
  stageLabel?: string | null;
  /** Case id — used to build a direct link when available. */
  caseId?: string | null;
  /** Explicit link override. */
  caseUrl?: string | null;
  filenames?: string[];
}

/** Build a direct, publicly reachable link to the case page when possible. */
function caseLink(info: CaseCaptionInfo): string | null {
  if (info.caseUrl) return info.caseUrl;
  if (!info.caseId) return null;
  try {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    if (!origin) return null;
    return `${origin}/cases/${info.caseId}`;
  } catch {
    return null;
  }
}

/** Professionally formatted Arabic caption for the Telegram group. */
export function buildCaseCaption(info: CaseCaptionInfo): string {
  const link = caseLink(info);
  const files = (info.filenames ?? []).filter(Boolean);
  const lines: (string | null)[] = [
    `${info.icon ?? "📎"} ${info.title}`,
    "──────────────",
    info.patientName ? `👤 المريض: ${info.patientName}` : null,
    info.caseCode ? `🔖 رقم الحالة: ${info.caseCode}` : null,
    info.stageLabel ? `📊 المرحلة الحالية: ${info.stageLabel}` : null,
    info.doctorName ? `🩺 الطبيب: ${info.doctorName}` : null,
    info.from ? `📤 المصدر: ${info.from}` : null,
    files.length
      ? files.length === 1
        ? `📁 الملف: ${files[0]}`
        : `📁 الملفات (${files.length}):\n${files.map((f) => `   • ${f}`).join("\n")}`
      : null,
    link ? `🔗 رابط الحالة: ${link}` : null,
  ];
  return lines.filter(Boolean).join("\n");
}

/** Convenience wrapper for a single file upload event. */
export function autoSendFileToTelegram(opts: {
  kind: "zip" | "rar" | "image" | "html";
  from: string;
  caseCode: string;
  patientName?: string | null;
  doctorName?: string | null;
  stageLabel?: string | null;
  caseId?: string | null;
  url: string;
  filename: string;
}): void {
  const icon = opts.kind === "zip" ? "🗜️" : opts.kind === "rar" ? "📦" : opts.kind === "image" ? "🖼️" : "🌐";
  const label =
    opts.kind === "zip" ? "ملف ZIP" :
    opts.kind === "rar" ? "ملف تصميم RAR" :
    opts.kind === "image" ? "صورة" : "ملف HTML";
  const caption = buildCaseCaption({
    icon,
    title: `إرسال تلقائي — ${label}`,
    from: opts.from,
    caseCode: opts.caseCode,
    patientName: opts.patientName,
    doctorName: opts.doctorName,
    stageLabel: opts.stageLabel,
    caseId: opts.caseId,
    filenames: [patientFileName(opts.patientName, opts.filename)],
  });
  autoSendFilesToTelegram(caption, [{ url: opts.url, filename: opts.filename }], opts.patientName);
}
