import type { RiskLabel } from "@/lib/detection";

// Documented badge variants only. The label is always shown, so risk is never conveyed by colour alone.
const VARIANT: Record<RiskLabel, "neutral" | "success" | "warning" | "error"> = {
  None: "neutral",
  Low: "success",
  Medium: "warning",
  High: "error",
  Critical: "error",
};

export function RiskBadge({ risk }: { risk: RiskLabel }) {
  return (
    <span className={`lp-badge lp-badge--${VARIANT[risk]}`}>
      {risk === "Critical" ? <span className="lp-badge__dot" /> : null}
      {risk}
    </span>
  );
}
