import { RISK_LEVELS, type RiskLabel } from "@/lib/detection";

export interface ScanRow {
  id: string;
  filename: string;
  /** ISO 8601 timestamp from the database. */
  scannedAt: string;
  risk: RiskLabel;
  findingCount: number;
}

export interface DashboardStats {
  /** Number of stored scan rows. */
  filesScanned: number;
  /** Sum of finding_count over all stored scans. */
  totalMatches: number;
  /** Number of scans whose overall risk is High or Critical (not a count of findings). */
  highCriticalScans: number;
  /** Scans per overall risk. The five values always sum to filesScanned. */
  distribution: { risk: RiskLabel; scans: number; sharePercent: number }[];
  /** Up to 10 most recent scans, newest first. */
  recent: ScanRow[];
}

export const RECENT_SCAN_LIMIT = 10;

const time = (row: ScanRow) => Date.parse(row.scannedAt);

/** Pure aggregation: every figure is derived from the rows passed in, so totals equal the stored data. */
export function aggregateDashboard(rows: readonly ScanRow[]): DashboardStats {
  const counts = new Map<RiskLabel, number>(RISK_LEVELS.map((r) => [r, 0]));
  let totalMatches = 0;
  for (const row of rows) {
    counts.set(row.risk, (counts.get(row.risk) ?? 0) + 1);
    totalMatches += row.findingCount;
  }
  const filesScanned = rows.length;
  const recent = [...rows]
    .sort((a, b) => time(b) - time(a) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
    .slice(0, RECENT_SCAN_LIMIT);

  return {
    filesScanned,
    totalMatches,
    highCriticalScans: (counts.get("High") ?? 0) + (counts.get("Critical") ?? 0),
    distribution: RISK_LEVELS.map((risk) => {
      const scans = counts.get(risk) ?? 0;
      return { risk, scans, sharePercent: filesScanned === 0 ? 0 : Math.round((scans / filesScanned) * 100) };
    }),
    recent,
  };
}
