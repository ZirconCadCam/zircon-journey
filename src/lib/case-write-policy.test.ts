import { expect, it } from "vitest";
import { validateCaseFinancialWrite } from "./case-write-policy";
it("only administration can change patient balances", () => {
  for (const role of ["doctor", "designer", "technician"]) expect(validateCaseFinancialWrite(role, { remaining_amount: 100 })).toBe(false);
  expect(validateCaseFinancialWrite("admin", { remaining_amount: 100 })).toBe(true);
  expect(validateCaseFinancialWrite("admin", { remaining_amount: null })).toBe(true);
});
it("rejects invalid monetary amounts", () => {
  for (const value of [-1, Infinity, NaN, "100"]) expect(validateCaseFinancialWrite("admin", { remaining_amount: value })).toBe(false);
  expect(validateCaseFinancialWrite("doctor", { doctor_decision: "approved" })).toBe(true);
});