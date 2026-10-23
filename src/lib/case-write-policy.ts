export function validateCaseFinancialWrite(role: string, values: unknown): boolean {
  const rows = Array.isArray(values) ? values : [values];
  return rows.every((row) => {
    if (!row || typeof row !== "object") return false;
    const fields = Object.entries(row).filter(([key]) => key === "remaining_amount");
    return fields.every(([, value]) => role === "admin" && (value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0)));
  });
}