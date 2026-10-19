import { describe, expect, it } from "vitest";
import type { RiskLabel } from "@/lib/detection";
import { RECENT_SCAN_LIMIT, aggregateDashboard, type ScanRow } from "./aggregate";

let n = 0;
const scan = (risk: RiskLabel, findingCount: number, scannedAt = "2026-10-19T10:00:00Z", filename = `f${n}.csv`): ScanRow => ({
  id: `id-${String(++n).padStart(4, "0")}`,
  filename,
  scannedAt,
  risk,
  findingCount,
});

describe("aggregateDashboard", () => {
  it("returns zeros and five empty risk buckets for no data", () => {
    const s = aggregateDashboard([]);
    expect(s).toMatchObject({ filesScanned: 0, totalMatches: 0, highCriticalScans: 0, recent: [] });
    expect(s.distribution.map((d) => [d.risk, d.scans, d.sharePercent])).toEqual([
      ["None", 0, 0],
      ["Low", 0, 0],
      ["Medium", 0, 0],
      ["High", 0, 0],
      ["Critical", 0, 0],
    ]);
  });

  it("files scanned = number of rows; total matches = sum of finding_count", () => {
    const rows = [scan("Critical", 7), scan("None", 0), scan("Low", 3), scan("High", 12), scan("Low", 1)];
    const s = aggregateDashboard(rows);
    expect(s.filesScanned).toBe(rows.length);
    expect(s.totalMatches).toBe(rows.reduce((sum, r) => sum + r.findingCount, 0));
    expect(s.totalMatches).toBe(23);
  });

  it("High/Critical is a count of scans, not of findings", () => {
    const s = aggregateDashboard([scan("High", 50), scan("Critical", 90), scan("Medium", 5), scan("Low", 1), scan("None", 0)]);
    expect(s.highCriticalScans).toBe(2);
  });

  it("the distribution covers all five risks and always sums to files scanned", () => {
    const rows = [scan("None", 0), scan("None", 0), scan("Low", 1), scan("Medium", 2), scan("High", 3), scan("Critical", 4), scan("Critical", 5)];
    const s = aggregateDashboard(rows);
    expect(s.distribution.map((d) => d.risk)).toEqual(["None", "Low", "Medium", "High", "Critical"]);
    expect(s.distribution.reduce((sum, d) => sum + d.scans, 0)).toBe(rows.length);
    expect(s.distribution.find((d) => d.risk === "Critical")).toMatchObject({ scans: 2, sharePercent: 29 });
    expect(s.distribution.find((d) => d.risk === "None")).toMatchObject({ scans: 2, sharePercent: 29 });
  });

  it("agrees with the rows for many generated datasets", () => {
    const risks: RiskLabel[] = ["None", "Low", "Medium", "High", "Critical"];
    for (let size = 0; size < 60; size += 7) {
      const rows = Array.from({ length: size }, (_, i) => scan(risks[(i * 3 + size) % 5], (i * 7) % 11));
      const s = aggregateDashboard(rows);
      expect(s.filesScanned).toBe(size);
      expect(s.totalMatches).toBe(rows.reduce((a, r) => a + r.findingCount, 0));
      expect(s.distribution.reduce((a, d) => a + d.scans, 0)).toBe(size);
      expect(s.highCriticalScans).toBe(rows.filter((r) => r.risk === "High" || r.risk === "Critical").length);
    }
  });

  it("recent = the 10 newest scans, newest first, regardless of input order", () => {
    const rows = Array.from({ length: 15 }, (_, i) => scan("Low", i, `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00Z`));
    const shuffled = [...rows].reverse().sort((a, b) => (a.id.length + a.findingCount) % 3 - (b.id.length + b.findingCount) % 3);
    const s = aggregateDashboard(shuffled);
    expect(s.recent).toHaveLength(RECENT_SCAN_LIMIT);
    expect(s.recent.map((r) => r.findingCount)).toEqual([14, 13, 12, 11, 10, 9, 8, 7, 6, 5]);
    expect(s.filesScanned).toBe(15);
  });

  it("breaks timestamp ties deterministically and keeps fewer than 10 rows as they are", () => {
    const a = scan("Low", 1, "2026-10-19T10:00:00Z");
    const b = scan("Low", 2, "2026-10-19T10:00:00Z");
    expect(aggregateDashboard([a, b]).recent.map((r) => r.id)).toEqual([b.id, a.id]);
    expect(aggregateDashboard([b, a]).recent.map((r) => r.id)).toEqual([b.id, a.id]);
    expect(aggregateDashboard([a]).recent).toEqual([a]);
  });

  it("does not modify its input", () => {
    const rows = [scan("Low", 1, "2026-10-01T00:00:00Z"), scan("High", 2, "2026-10-02T00:00:00Z")];
    const copy = structuredClone(rows);
    aggregateDashboard(rows);
    expect(rows).toEqual(copy);
  });
});
