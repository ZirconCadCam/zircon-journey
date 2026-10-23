/** Authenticate machine cron requests without leaking or timing-match disclosure. */
export async function validCronRequest(request: Request): Promise<boolean> {
  const secret = process.env["CRON_SECRET"] || process.env["REPORTS_CRON_KEY"];
  const provided = request.headers.get("authorization");
  if (!secret || !provided) return false;
  const encoder = new TextEncoder();
  const [expected, actual] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(`Bearer ${secret}`)),
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
  ]);
  const a = new Uint8Array(expected), b = new Uint8Array(actual);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

export async function validStaffRequest(request: Request): Promise<boolean> {
  const { verifyTicket } = await import("./staff-ticket.server");
  try {
    const tokens: unknown = JSON.parse(request.headers.get("x-staff-tickets") ?? "[]");
    if (!Array.isArray(tokens) || tokens.length > 20) return false;
    for (const token of tokens) if (typeof token === "string" && await verifyTicket(token)) return true;
  } catch { /* fail closed */ }
  return false;
}