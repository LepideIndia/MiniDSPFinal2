import { FINDING_TYPES, type FindingType, type RiskLabel } from "@/lib/detection";

/** Findings only ever store these risks (the database CHECK excludes "None"). */
export const FINDING_RISKS = ["Low", "Medium", "High", "Critical"] as const;
export type FindingRisk = (typeof FINDING_RISKS)[number];

export interface FindingFilters {
  type: FindingType | null;
  risk: FindingRisk | null;
  /** True when a type/risk parameter was present but not on the allowlist, so it was ignored. */
  ignoredInvalid: boolean;
}

type RawParams = Record<string, string | string[] | undefined> | URLSearchParams;

function read(params: RawParams, key: string): string | string[] | undefined {
  if (params instanceof URLSearchParams) {
    const all = params.getAll(key);
    return all.length === 0 ? undefined : all.length === 1 ? all[0] : all;
  }
  return params[key];
}

/** Exact, case-sensitive allowlist match. Anything else is ignored (never passed to the database). */
function pick<T extends string>(raw: string | string[] | undefined, allowed: readonly T[]): { value: T | null; invalid: boolean } {
  if (raw === undefined || raw === "") return { value: null, invalid: false };
  if (typeof raw !== "string") return { value: null, invalid: true }; // repeated parameter
  const match = allowed.find((a) => a === raw);
  return match ? { value: match, invalid: false } : { value: null, invalid: true };
}

export function parseFindingFilters(params: RawParams): FindingFilters {
  const type = pick(read(params, "type"), FINDING_TYPES);
  const risk = pick(read(params, "risk"), FINDING_RISKS);
  return { type: type.value, risk: risk.value, ignoredInvalid: type.invalid || risk.invalid };
}

export type StoredFindingRisk = Exclude<RiskLabel, "None">;
