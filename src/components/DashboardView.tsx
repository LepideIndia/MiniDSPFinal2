import Link from "next/link";
import { DataTable, Td, Th } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { Message } from "@/components/Message";
import { RiskBadge } from "@/components/RiskBadge";
import { formatScanDate } from "@/lib/format";
import { MAX_DASHBOARD_SCANS } from "@/lib/data/read";
import type { DashboardStats } from "@/lib/stats/aggregate";

export type DashboardResult = { status: "ok"; stats: DashboardStats; capped: boolean } | { status: "error" };

function Metric({ title, value, note }: { title: string; value: number; note: string }) {
  return (
    <li>
      <div className="lp-card lp-card--elevated">
        <div className="lp-card__header">
          <div className="lp-card__title">{title}</div>
        </div>
        <div className="lp-card__body">
          <span className="metric-value">{value.toLocaleString("en-GB")}</span>
          <span className="metric-note">{note}</span>
        </div>
      </div>
    </li>
  );
}

export function DashboardView({ result }: { result: DashboardResult }) {
  return (
    <>
      <header className="page-header">
        <h1>Dashboard</h1>
        <p>Your scan activity. Only your own scans are counted.</p>
      </header>

      {result.status === "error" ? (
        <Message variant="error" title="We couldn't load your dashboard">
          Something went wrong while reading your scans. Try again in a moment.
        </Message>
      ) : result.stats.filesScanned === 0 ? (
        <EmptyState
          message="No scans yet. Upload a synthetic CSV or TXT file to get started."
          action={
            <Link className="lp-button lp-button--primary lp-button--md" href="/upload">
              Upload a file
            </Link>
          }
        />
      ) : (
        <DashboardBody stats={result.stats} capped={result.capped} />
      )}
    </>
  );
}

function DashboardBody({ stats, capped }: { stats: DashboardStats; capped: boolean }) {
  return (
    <>
      {capped ? (
        <Message variant="info" title="Showing your most recent scans">
          These figures cover your {MAX_DASHBOARD_SCANS.toLocaleString("en-GB")} most recent scans.
        </Message>
      ) : null}

      <ul className="metric-grid" aria-label="Summary">
        <Metric title="Files scanned" value={stats.filesScanned} note="Scans saved to your account" />
        <Metric title="Total matches" value={stats.totalMatches} note="Sensitive values found across all scans" />
        <Metric
          title="High or Critical scans"
          value={stats.highCriticalScans}
          note="Scans whose highest risk is High or Critical"
        />
      </ul>

      <section className="section" aria-labelledby="distribution-heading">
        <h2 id="distribution-heading">Risk distribution</h2>
        <DataTable label="Risk distribution">
          <thead>
            <tr>
              <Th>Risk</Th>
              <Th>Scans</Th>
              <Th>Share of scans</Th>
            </tr>
          </thead>
          <tbody>
            {stats.distribution.map((d) => (
              <tr key={d.risk}>
                <td className="lp-table__td">
                  <div className="lp-table__cell-inner">
                    <RiskBadge risk={d.risk} />
                  </div>
                </td>
                <Td>{d.scans}</Td>
                <td className="lp-table__td">
                  <div className="lp-table__cell-inner">
                    <div className="lp-progress lp-progress--full-width">
                      <span className="lp-progress__label">
                        {d.scans} of {stats.filesScanned} scans
                      </span>
                      <div className="lp-progress__row">
                        <div
                          className="lp-progress__track"
                          role="progressbar"
                          aria-valuenow={d.sharePercent}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${d.risk}: ${d.scans} of ${stats.filesScanned} scans`}
                        >
                          <div className="lp-progress__fill" style={{ width: `${d.sharePercent}%` }} />
                        </div>
                        <span className="lp-progress__value">{d.sharePercent}%</span>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </section>

      <section className="section" aria-labelledby="recent-heading">
        <h2 id="recent-heading">Recent scans</h2>
        <DataTable label="Recent scans">
          <thead>
            <tr>
              <Th>File</Th>
              <Th>Scanned</Th>
              <Th>Risk</Th>
              <Th>Matches</Th>
            </tr>
          </thead>
          <tbody>
            {stats.recent.map((scan) => (
              <tr key={scan.id}>
                <Td wrap>{scan.filename}</Td>
                <td className="lp-table__td">
                  <div className="lp-table__cell-inner">
                    <time className="lp-table__cell-text" dateTime={scan.scannedAt}>
                      {formatScanDate(scan.scannedAt)}
                    </time>
                  </div>
                </td>
                <td className="lp-table__td">
                  <div className="lp-table__cell-inner">
                    <RiskBadge risk={scan.risk} />
                  </div>
                </td>
                <Td>{scan.findingCount}</Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        <div>
          <Link className="lp-link lp-link--standalone" href="/findings">
            View all findings
          </Link>
        </div>
      </section>
    </>
  );
}
