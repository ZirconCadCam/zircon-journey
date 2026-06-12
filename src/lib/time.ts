/**
 * Time helpers for chat synchronisation and precise timestamp display.
 *
 * All chat messages carry a server-side `created_at` (UTC ISO string). We
 * always sort and render against that value so message order is identical for
 * every participant regardless of their device clock. The display helpers
 * render the timestamp in the viewer's local timezone with second precision.
 */

/** Stable comparator: order by server `created_at`, breaking ties by id so
 *  two messages stamped in the same millisecond keep a deterministic order
 *  across every client. */
export function compareByCreatedAt(
  a: { created_at: string; id: string },
  b: { created_at: string; id: string },
): number {
  const ta = Date.parse(a.created_at);
  const tb = Date.parse(b.created_at);
  if (ta !== tb) return ta - tb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Precise time-of-day with seconds, e.g. "٠٣:٤٧:١٢ م". */
export function formatChatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ar", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Full precise stamp (date + time + seconds) for tooltips. */
export function formatChatFull(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ar", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** A human day label used for date separators inside a conversation. */
export function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, now)) return "اليوم";
  if (isSameDay(d, yesterday)) return "أمس";
  return d.toLocaleDateString("ar", { year: "numeric", month: "long", day: "numeric" });
}

/** Returns true when two ISO timestamps fall on different calendar days. */
export function isNewDay(prevIso: string | null | undefined, iso: string): boolean {
  if (!prevIso) return true;
  const a = new Date(prevIso);
  const b = new Date(iso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return false;
  return !isSameDay(a, b);
}
