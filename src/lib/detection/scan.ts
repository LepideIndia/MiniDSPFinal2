import { DETECTORS } from "./detectors";
import {
  FINDING_TYPES,
  RISK_LEVELS,
  TYPE_RISK,
  type Finding,
  type FindingType,
  type RiskLabel,
  type ScanResult,
} from "./types";

export interface Span {
  type: FindingType;
  start: number;
  end: number;
}

/**
 * Keeps non-overlapping spans. Precedence: detector order in DETECTORS
 * (Payment Card > Email > UK NINO > UK Phone), then earlier start.
 */
export function resolveOverlaps(spans: Span[], textLength: number): Span[] {
  const rank = (t: FindingType) => DETECTORS.findIndex((d) => d.type === t);
  const ordered = [...spans].sort((a, b) => rank(a.type) - rank(b.type) || a.start - b.start);
  const taken = new Uint8Array(textLength);
  const kept: Span[] = [];
  for (const span of ordered) {
    let free = true;
    for (let i = span.start; i < span.end; i++) {
      if (taken[i]) {
        free = false;
        break;
      }
    }
    if (!free) continue;
    taken.fill(1, span.start, span.end);
    kept.push(span);
  }
  return kept.sort((a, b) => a.start - b.start);
}

/**
 * Scans text and returns only aggregated, masked results.
 * Raw matched values are used inside this function only to build masks.
 */
export function scanText(text: string): ScanResult {
  if (typeof text !== "string") throw new TypeError("scanText expects a string");

  const candidates: Span[] = [];
  for (const detector of DETECTORS) {
    for (const m of text.matchAll(detector.pattern)) {
      if (detector.accept(m[0])) {
        candidates.push({ type: detector.type, start: m.index, end: m.index + m[0].length });
      }
    }
  }

  const counts = new Map<FindingType, { count: number; masked: string }>();
  for (const span of resolveOverlaps(candidates, text.length)) {
    const entry = counts.get(span.type);
    if (entry) {
      entry.count++;
    } else {
      const detector = DETECTORS.find((d) => d.type === span.type)!;
      counts.set(span.type, { count: 1, masked: detector.mask(text.slice(span.start, span.end)) });
    }
  }

  const riskIndex = (r: RiskLabel) => RISK_LEVELS.indexOf(r);
  const findings: Finding[] = FINDING_TYPES.filter((t) => counts.has(t))
    .map((type) => ({
      type,
      risk: TYPE_RISK[type],
      matchCount: counts.get(type)!.count,
      maskedExample: counts.get(type)!.masked,
    }))
    .sort((a, b) => riskIndex(b.risk) - riskIndex(a.risk));

  return {
    risk: findings[0]?.risk ?? "None",
    totalMatches: findings.reduce((n, f) => n + f.matchCount, 0),
    findings,
  };
}
