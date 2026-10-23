import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start/server", () => ({ getRequestHeader: () => undefined }));
const state = vi.hoisted(() => ({ updated: "2020-01-01T00:00:00Z", active: true }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: (table: string) => ({
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ error: null,
    data: table === "doctor_profiles" ? { active: state.active } : { updated_at: state.updated },
  }) }) }),
}) } }));
import { signTicket, verifyTicket, TICKET_TTL_MS } from "./staff-ticket.server";
import { validCronRequest, validStaffRequest } from "./drain-auth.server";

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); state.updated = "2020-01-01T00:00:00Z"; state.active = true; });
describe("staff device sessions", () => {
  it("keeps a signed session for exactly thirty days and rejects tampering", async () => {
    vi.stubEnv("STAFF_TICKET_SECRET", "fixture-signing-key-not-a-real-secret");
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-23T18:00:00Z"));
    const ticket = await signTicket({ role: "designer", slot: null });
    expect(TICKET_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(await verifyTicket(ticket)).toEqual({ role: "designer", slot: null });
    expect(await verifyTicket(ticket + ".extra")).toBeNull();
    expect(await validStaffRequest(new Request("https://app.test", { headers: { "x-staff-tickets": JSON.stringify([ticket]) } }))).toBe(true);
    vi.advanceTimersByTime(TICKET_TTL_MS);
    expect(await verifyTicket(ticket)).toBeNull();
  });
  it("revokes access after a password change or doctor deactivation", async () => {
    vi.stubEnv("STAFF_TICKET_SECRET", "fixture-signing-key-not-a-real-secret");
    const ticket = await signTicket({ role: "doctor", slot: 3 });
    state.active = false;
    expect(await verifyTicket(ticket)).toBeNull();
    state.active = true;
    state.updated = new Date(Date.now() + 1000).toISOString();
    expect(await verifyTicket(ticket)).toBeNull();
  });
  it("rejects anonymous drain requests and checks cron authorization", async () => {
    vi.stubEnv("CRON_SECRET", "fixture-cron-only");
    expect(await validCronRequest(new Request("https://app.test"))).toBe(false);
    expect(await validStaffRequest(new Request("https://app.test"))).toBe(false);
    expect(await validCronRequest(new Request("https://app.test", { headers: { authorization: "Bearer wrong" } }))).toBe(false);
    expect(await validCronRequest(new Request("https://app.test", { headers: { authorization: "Bearer fixture-cron-only" } }))).toBe(true);
  });
});