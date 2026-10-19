import type { SupabaseClient } from "@supabase/supabase-js";
import { FINDING_TYPES, RISK_LEVELS, type FindingType, type RiskLabel } from "@/lib/detection";
import { FINDING_RISKS, type FindingFilters, type StoredFindingRisk } from "@/lib/findings/filters";
import type { ScanRow } from "@/lib/stats/aggregate";

/** Generic on purpose: Supabase error bodies and malformed rows are never surfaced to the page. */
export class DataError extends Error {
  constructor() {
    super("data_error");
    this.name = "DataError";
  }
}

const SCAN_PAGE_SIZE = 1000;
/** Dashboard figures cover at most this many scans; beyond it the page says so. */
export const MAX_DASHBOARD_SCANS = 5000;
/** Findings list is capped at this many rows. */
export const FINDINGS_CAP = 100;

export interface FindingRow {
  id: string;
  filename: string;
  scannedAt: string;
  type: FindingType;
  risk: StoredFindingRisk;
  matchCount: number;
  maskedExample: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isDate = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));
const isText = (v: unknown): v is string => typeof v === "string";

export function parseScanRows(data: unknown): ScanRow[] {
  if (!Array.isArray(data)) throw new DataError();
  return data.map((r) => {
    if (
      !isRecord(r) ||
      !isText(r.id) ||
      !isText(r.filename) ||
      !isDate(r.scanned_at) ||
      !(RISK_LEVELS as readonly unknown[]).includes(r.risk) ||
      !isCount(r.finding_count)
    ) {
      throw new DataError();
    }
    return {
      id: r.id,
      filename: r.filename,
      scannedAt: r.scanned_at,
      risk: r.risk as RiskLabel,
      findingCount: r.finding_count,
    };
  });
}

export function parseFindingRows(data: unknown): FindingRow[] {
  if (!Array.isArray(data)) throw new DataError();
  return data.map((r) => {
    // A to-one embed can arrive as an object or a one-element array depending on the client.
    const scan = isRecord(r) ? (Array.isArray(r.scans) ? r.scans[0] : r.scans) : undefined;
    if (
      !isRecord(r) ||
      !isRecord(scan) ||
      !isText(r.id) ||
      !isText(scan.filename) ||
      !isDate(scan.scanned_at) ||
      !(FINDING_TYPES as readonly unknown[]).includes(r.type) ||
      !(FINDING_RISKS as readonly unknown[]).includes(r.risk) ||
      !isCount(r.match_count) ||
      !isText(r.masked_example)
    ) {
      throw new DataError();
    }
    return {
      id: r.id,
      filename: scan.filename,
      scannedAt: scan.scanned_at,
      type: r.type as FindingType,
      risk: r.risk as StoredFindingRisk,
      matchCount: r.match_count,
      maskedExample: r.masked_example,
    };
  });
}

/** All of the signed-in user's scans (RLS scopes the rows), paged, up to MAX_DASHBOARD_SCANS. */
export async function fetchAllScans(client: SupabaseClient): Promise<{ rows: ScanRow[]; capped: boolean }> {
  const rows: ScanRow[] = [];
  try {
    while (rows.length <= MAX_DASHBOARD_SCANS) {
      const size = Math.min(SCAN_PAGE_SIZE, MAX_DASHBOARD_SCANS + 1 - rows.length);
      const { data, error } = await client
        .from("scans")
        .select("id,filename,scanned_at,risk,finding_count")
        .order("scanned_at", { ascending: false })
        .order("id", { ascending: false })
        .range(rows.length, rows.length + size - 1);
      if (error) throw new DataError();
      const page = parseScanRows(data);
      rows.push(...page);
      if (page.length < size) break;
    }
  } catch (error) {
    throw error instanceof DataError ? error : new DataError();
  }
  const capped = rows.length > MAX_DASHBOARD_SCANS;
  return { rows: capped ? rows.slice(0, MAX_DASHBOARD_SCANS) : rows, capped };
}

/** Findings for the signed-in user (RLS), newest scan first. Only allowlisted filter values reach the query. */
export async function fetchFilteredFindings(
  client: SupabaseClient,
  filters: Pick<FindingFilters, "type" | "risk">,
  limit?: number,
): Promise<FindingRow[]> {
  let rows: FindingRow[];
  try {
    let query = client
      .from("findings")
      .select("id,type,risk,match_count,masked_example,scans!inner(filename,scanned_at)");
    if (filters.type) query = query.eq("type", filters.type);
    if (filters.risk) query = query.eq("risk", filters.risk);
    // PostgREST orders parent rows by a related to-one column with `scans(scanned_at)`. Live behaviour: UNVERIFIED.
    const ordered = query.order("scans(scanned_at)", { ascending: false }).order("id", { ascending: false });
    const { data, error } = limit === undefined ? await ordered : await ordered.limit(limit + 1);
    if (error) throw new DataError();
    rows = parseFindingRows(data);
  } catch (error) {
    throw error instanceof DataError ? error : new DataError();
  }
  return rows.sort(byNewestScan);
}

export async function fetchFindings(
  client: SupabaseClient,
  filters: Pick<FindingFilters, "type" | "risk">,
): Promise<{ rows: FindingRow[]; capped: boolean }> {
  const rows = await fetchFilteredFindings(client, filters, FINDINGS_CAP);
  const capped = rows.length > FINDINGS_CAP;
  return { rows: capped ? rows.slice(0, FINDINGS_CAP) : rows, capped };
}

const byNewestScan = (a: FindingRow, b: FindingRow) => Date.parse(b.scannedAt) - Date.parse(a.scannedAt);
