import Link from "next/link";
import { DataTable, Td, Th } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { Message } from "@/components/Message";
import { RiskBadge } from "@/components/RiskBadge";
import { FINDINGS_CAP, type FindingRow } from "@/lib/data/read";
import { FINDING_TYPES } from "@/lib/detection";
import { FINDING_RISKS, type FindingFilters } from "@/lib/findings/filters";
import { formatScanDate } from "@/lib/format";

export type FindingsResult = { status: "ok"; rows: FindingRow[]; capped: boolean } | { status: "error" };

export function FindingsView({ result, filters }: { result: FindingsResult; filters: FindingFilters }) {
  const filtered = filters.type !== null || filters.risk !== null;
  const exportParams = new URLSearchParams();
  if (filters.type) exportParams.set("type", filters.type);
  if (filters.risk) exportParams.set("risk", filters.risk);
  const exportHref = `/api/export${exportParams.size > 0 ? `?${exportParams.toString()}` : ""}`;

  return (
    <>
      <header className="page-header">
        <h1>Findings</h1>
        <p>Masked findings from your scans. Original values are never stored.</p>
      </header>

      <form className="filter-form" method="get" action="/findings" aria-label="Filter findings">
        <div className="filter-field">
          <label htmlFor="filter-type">Type</label>
          <select id="filter-type" name="type" className="select" defaultValue={filters.type ?? ""}>
            <option value="">All types</option>
            {FINDING_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="filter-risk">Risk</label>
          <select id="filter-risk" name="risk" className="select" defaultValue={filters.risk ?? ""}>
            <option value="">All risks</option>
            {FINDING_RISKS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="row">
          <button type="submit" className="lp-button lp-button--primary lp-button--md">
            Apply filters
          </button>
          {filtered ? (
            <Link className="lp-link lp-link--standalone" href="/findings">
              Clear filters
            </Link>
          ) : null}
          {result.status === "ok" ? (
            <a className="lp-button lp-button--secondary lp-button--md" href={exportHref} download>
              Export CSV
            </a>
          ) : null}
        </div>
      </form>

      {filters.ignoredInvalid ? (
        <Message variant="info" title="Unsupported filter ignored">
          One or more filter values were not recognised, so they were ignored.
        </Message>
      ) : null}

      {result.status === "error" ? (
        <Message variant="error" title="We couldn't load your findings">
          Something went wrong while reading your findings. Try again in a moment.
        </Message>
      ) : result.rows.length === 0 ? (
        filtered ? (
          <EmptyState
            message="No findings match these filters."
            action={
              <Link className="lp-button lp-button--secondary lp-button--md" href="/findings">
                Clear filters
              </Link>
            }
          />
        ) : (
          <EmptyState
            message="No findings yet. Upload a synthetic file to see masked results here."
            action={
              <Link className="lp-button lp-button--primary lp-button--md" href="/upload">
                Upload a file
              </Link>
            }
          />
        )
      ) : (
        <section className="section" aria-labelledby="findings-heading">
          <h2 id="findings-heading">
            {result.rows.length} {result.rows.length === 1 ? "finding" : "findings"}
            {result.capped ? ` (first ${FINDINGS_CAP})` : ""}
          </h2>
          {result.capped ? (
            <Message variant="info" title={`Showing the first ${FINDINGS_CAP} findings`}>
              More findings match. Use the filters to narrow the list.
            </Message>
          ) : null}
          <DataTable label="Findings" wide>
            <thead>
              <tr>
                <Th>File</Th>
                <Th>Scanned</Th>
                <Th>Type</Th>
                <Th>Risk</Th>
                <Th>Matches</Th>
                <Th>Masked example</Th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.id}>
                  <Td wrap>{row.filename}</Td>
                  <td className="lp-table__td">
                    <div className="lp-table__cell-inner">
                      <time className="lp-table__cell-text" dateTime={row.scannedAt}>
                        {formatScanDate(row.scannedAt)}
                      </time>
                    </div>
                  </td>
                  <Td>{row.type}</Td>
                  <td className="lp-table__td">
                    <div className="lp-table__cell-inner">
                      <RiskBadge risk={row.risk} />
                    </div>
                  </td>
                  <Td>{row.matchCount}</Td>
                  <Td wrap>{row.maskedExample}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </section>
      )}
    </>
  );
}
