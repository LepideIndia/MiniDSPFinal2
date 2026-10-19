import { describe, expect, it } from "vitest";
import { findingsToCsv } from "./csv";

describe("findingsToCsv", () => {
  it("quotes values correctly and neutralises spreadsheet formulas", () => {
    const csv = findingsToCsv([
      {
        filename: "=cmd|/c calc.csv",
        scannedAt: "2026-10-20T12:00:00Z",
        type: "Email",
        risk: "Low",
        matchCount: 2,
        maskedExample: "a***@example.test",
      },
      {
        filename: "notes,final.csv",
        scannedAt: "2026-10-21T10:00:00Z",
        type: "Payment Card",
        risk: "Critical",
        matchCount: 1,
        maskedExample: '"=1+1"',
      },
    ]);

    expect(csv).toContain('filename,scanned_at,type,risk,match_count,masked_example');
    expect(csv).toContain("'=cmd|/c calc.csv");
    expect(csv).toContain('"notes,final.csv"');
    expect(csv).toContain('"""=1+1"""');
  });
});
