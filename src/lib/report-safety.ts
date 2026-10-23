/** Encode untrusted text before inserting it into printable HTML. */
export function escapeReportText(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[character];
  });
}

/** CSV quoting alone does not stop spreadsheet formula evaluation. */
export function safeCsvCell(value: unknown): string {
  const text = String(value ?? "");
  const neutralized = /^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${neutralized.replace(/"/g, '""')}"`;
}