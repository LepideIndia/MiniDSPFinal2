import type { ReactNode } from "react";

/**
 * Documented lp-table markup. The lp-table wrapper is the element that scrolls sideways on narrow screens,
 * so it is the labelled, keyboard-focusable region. `wide` keeps many-column tables readable by scrolling.
 */
export function DataTable({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "lp-table data-table data-table--wide" : "lp-table data-table"} role="region" aria-label={`${label} table`} tabIndex={0}>
      <table className="lp-table__table">{children}</table>
    </div>
  );
}

export function Th({ children }: { children: ReactNode }) {
  return (
    <th className="lp-table__th" scope="col">
      <div className="lp-table__header-inner">
        <span className="lp-table__header-label">{children}</span>
      </div>
    </th>
  );
}

/** Renders children as plain text (never HTML). */
export function Td({ children, wrap = false }: { children: ReactNode; wrap?: boolean }) {
  return (
    <td className="lp-table__td">
      <div className="lp-table__cell-inner">
        <span className={wrap ? "lp-table__cell-text cell-wrap" : "lp-table__cell-text"}>{children}</span>
      </div>
    </td>
  );
}
