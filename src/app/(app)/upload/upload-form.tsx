"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { DataTable, Td, Th } from "@/components/DataTable";
import { Message } from "@/components/Message";
import { RiskBadge } from "@/components/RiskBadge";
import type { RiskLabel } from "@/lib/detection";

interface FindingResponse {
  type: string;
  risk: RiskLabel;
  matchCount: number;
  maskedExample: string;
}
interface ScanResponse {
  scanId?: string;
  filename: string;
  risk: RiskLabel;
  findingCount: number;
  findings: FindingResponse[];
}

const FALLBACK_ERROR = "The upload failed. Try again.";

export default function UploadForm() {
  const router = useRouter();
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem("file");
    const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
    setResult(null);
    setError(null);
    if (!file || file.size === 0) {
      setError("Choose a non-empty .csv or .txt file.");
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/scan", { method: "POST", body });
      if (response.status === 401) {
        router.replace("/sign-in");
        return;
      }
      const data: unknown = await response.json().catch(() => null);
      if (response.ok && data && typeof data === "object") {
        setResult(data as ScanResponse);
      } else {
        // Server messages are short and generic; anything else falls back to a fixed text.
        const message = (data as { message?: unknown } | null)?.message;
        setError(typeof message === "string" && message.length <= 200 ? message : FALLBACK_ERROR);
      }
    } catch {
      setError(FALLBACK_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="lp-card lp-card--elevated">
        <div className="lp-card__header">
          <div className="lp-card__title">Choose a file</div>
        </div>
        <div className="lp-card__body">
          <form className="stack" onSubmit={onSubmit} aria-busy={busy}>
            <div className="lp-input lp-input--full-width">
              <div className="lp-input__row lp-input__row--label-top">
                <label className="lp-input__label" htmlFor="upload-file">
                  File (.csv or .txt, up to 1 MiB)
                </label>
                <input
                  id="upload-file"
                  className="file-input"
                  type="file"
                  name="file"
                  accept=".csv,.txt"
                  aria-describedby="upload-hint"
                  disabled={busy}
                />
              </div>
              <div className="lp-input__message" id="upload-hint">
                Synthetic data only. The file is scanned and discarded; only masked results are saved.
              </div>
            </div>
            <div>
              <button type="submit" className="lp-button lp-button--primary lp-button--md" disabled={busy}>
                {busy ? (
                  <>
                    <span className="lp-button__icon-left">
                      <span className="lp-spinner lp-spinner--sm" role="status">
                        <svg className="lp-spinner__svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <circle className="lp-spinner__track" cx="12" cy="12" r="10" strokeWidth="3" />
                          <circle
                            className="lp-spinner__arc"
                            cx="12"
                            cy="12"
                            r="10"
                            strokeWidth="3"
                            strokeLinecap="round"
                            pathLength="100"
                            strokeDasharray="28 72"
                          />
                        </svg>
                        <span className="lp-spinner__visually-hidden">Scanning</span>
                      </span>
                    </span>
                    Scanning…
                  </>
                ) : (
                  "Scan file"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {error ? (
        <Message variant="error" title="Upload failed">
          {error}
        </Message>
      ) : null}

      {result ? <ScanResult result={result} /> : null}
    </>
  );
}

function ScanResult({ result }: { result: ScanResponse }) {
  return (
    <section className="section" aria-labelledby="result-heading">
      <Message variant="success" title="Scan saved">
        {result.findingCount === 0
          ? "No sensitive data was found."
          : `${result.findingCount} ${result.findingCount === 1 ? "match" : "matches"} found.`}
      </Message>
      <h2 id="result-heading">Results for {result.filename}</h2>
      <p className="row">
        Overall risk: <RiskBadge risk={result.risk} />
      </p>
      {result.findings.length > 0 ? (
        <DataTable label="Scan results">
          <thead>
            <tr>
              <Th>Type</Th>
              <Th>Risk</Th>
              <Th>Matches</Th>
              <Th>Masked example</Th>
            </tr>
          </thead>
          <tbody>
            {result.findings.map((f) => (
              <tr key={f.type}>
                <Td>{f.type}</Td>
                <td className="lp-table__td">
                  <div className="lp-table__cell-inner">
                    <RiskBadge risk={f.risk} />
                  </div>
                </td>
                <Td>{f.matchCount}</Td>
                <Td wrap>{f.maskedExample}</Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      ) : null}
      <div className="row">
        <Link className="lp-link lp-link--standalone" href="/findings">
          View all findings
        </Link>
        <Link className="lp-link lp-link--standalone" href="/">
          Back to dashboard
        </Link>
      </div>
    </section>
  );
}
