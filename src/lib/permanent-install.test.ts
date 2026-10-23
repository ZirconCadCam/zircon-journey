import { expect, it } from "vitest";
import { canConfirmPermanentInstall, permanentInstallSchema } from "./permanent-install";

const input = { caseId: "00000000-0000-4000-8000-000000000001", remaining: 125, note: "" };
it("accepts a remaining balance without a receipt photo", () => {
  expect(permanentInstallSchema.parse(input).remaining).toBe(125);
  expect(permanentInstallSchema.parse(input).receipt).toBeUndefined();
});
it("requires a finite nonnegative remaining balance including zero", () => {
  expect(permanentInstallSchema.parse({ ...input, remaining: 0 }).remaining).toBe(0);
  for (const remaining of [undefined, -1, Infinity, NaN, ""]) {
    expect(permanentInstallSchema.safeParse({ ...input, remaining }).success).toBe(false);
  }
});
it("only allows a doctor to confirm their own case, or administration", () => {
  expect(canConfirmPermanentInstall("doctor", 7, 7)).toBe(true);
  expect(canConfirmPermanentInstall("doctor", 7, 8)).toBe(false);
  expect(canConfirmPermanentInstall("admin", null, 8)).toBe(true);
  expect(canConfirmPermanentInstall("technician", null, 8)).toBe(false);
});