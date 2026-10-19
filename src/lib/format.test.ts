import { describe, expect, it } from "vitest";
import { formatScanDate } from "./format";

describe("formatScanDate", () => {
  it("formats in UTC with a fixed locale", () => {
    expect(formatScanDate("2026-10-19T20:11:00Z")).toBe("19 Oct 2026, 20:11 UTC");
    expect(formatScanDate("2026-10-19T23:30:00+05:30")).toBe("19 Oct 2026, 18:00 UTC");
  });
  it("does not throw on bad input", () => {
    expect(formatScanDate("not a date")).toBe("Unknown date");
    expect(formatScanDate("")).toBe("Unknown date");
  });
});
