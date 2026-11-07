import { describe, expect, it } from "vitest";
import { openTicketStillValid, settingKey } from "./portal-access";

describe("password-free page access", () => {
  it("accepts a password-free ticket while the password stays off", () => {
    expect(openTicketStillValid({ required: false, updatedAt: 100 }, 200)).toBe(true);
  });
  it("rejects it once the admin turns the password back on", () => {
    expect(openTicketStillValid({ required: true, updatedAt: 300 }, 200)).toBe(false);
  });
  it("rejects tickets issued before the latest switch change", () => {
    expect(openTicketStillValid({ required: false, updatedAt: 300 }, 200)).toBe(false);
  });
  it("stores one switch per page", () => {
    expect(settingKey("technician")).toBe("technician_password_required");
  });
});
