export const RISK_LEVELS = ["None", "Low", "Medium", "High", "Critical"] as const;
export type RiskLabel = (typeof RISK_LEVELS)[number];

export const FINDING_TYPES = ["Email", "UK Phone", "UK NINO", "Payment Card"] as const;
export type FindingType = (typeof FINDING_TYPES)[number];

export const TYPE_RISK: Record<FindingType, Exclude<RiskLabel, "None">> = {
  Email: "Low",
  "UK Phone": "Medium",
  "UK NINO": "High",
  "Payment Card": "Critical",
};

export interface Finding {
  type: FindingType;
  risk: Exclude<RiskLabel, "None">;
  matchCount: number;
  maskedExample: string;
}

export interface ScanResult {
  risk: RiskLabel;
  totalMatches: number;
  findings: Finding[];
}
