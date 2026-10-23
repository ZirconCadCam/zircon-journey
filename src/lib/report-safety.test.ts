import { describe, expect, it } from "vitest";
import { escapeReportText, safeCsvCell } from "./report-safety";

describe("report data safety", () => {
  it("encodes executable patient input as text", () => {
    expect(escapeReportText('<img src=x onerror="alert(1)">')).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(escapeReportText("علي & أحمد")).toBe("علي &amp; أحمد");
  });
  it("neutralizes spreadsheet formulas including leading whitespace", () => {
    for (const value of ["=1+1", " +SUM(A1)", "@SUM(A1)", "-1+2", "\t=1"]) {
      expect(safeCsvCell(value)).toBe(`"'${value}"`);
    }
    expect(safeCsvCell('Vendor "A"')).toBe('"Vendor ""A"""');
  });
});