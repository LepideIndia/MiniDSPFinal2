import type { ReactNode } from "react";

// Decorative stand-in inside the documented empty-state illustration slot (aria-hidden, token stroke).
const ART = (
  <svg width="120" height="70" viewBox="0 0 120 70" fill="none" stroke="var(--color-border-strong)" strokeWidth="2" aria-hidden="true">
    <rect x="20" y="10" width="80" height="22" rx="4" />
    <rect x="20" y="38" width="80" height="22" rx="4" />
    <circle cx="32" cy="21" r="3" />
    <circle cx="32" cy="49" r="3" />
    <path d="M44 21h32M44 49h20" />
  </svg>
);

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="lp-empty-state">
      <span className="lp-empty-state__illustration">{ART}</span>
      <p className="lp-empty-state__message">{message}</p>
      {action ? <div className="lp-empty-state__action">{action}</div> : null}
    </div>
  );
}
