// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FindingsView, type FindingsResult } from "./FindingsView";
import { FINDINGS_CAP, type FindingRow } from "@/lib/data/read";
import { parseFindingFilters, type FindingFilters } from "@/lib/findings/filters";

afterEach(cleanup);

const none: FindingFilters = { type: null, risk: null, ignoredInvalid: false };
const finding = (i: number, over: Partial<FindingRow> = {}): FindingRow => ({
  id: `f${i}`,
  filename: `file${i}.csv`,
  scannedAt: "2026-10-19T10:00:00Z",
  type: "Email",
  risk: "Low",
  matchCount: 3,
  maskedExample: "a***@example.test",
  ...over,
});
const ok = (rows: FindingRow[], capped = false): FindingsResult => ({ status: "ok", rows, capped });

describe("FindingsView: data", () => {
  it("shows filename, date, type, risk text, match count and masked example per finding", () => {
    render(
      <FindingsView
        filters={none}
        result={ok([
          finding(1),
          finding(2, { type: "Payment Card", risk: "Critical", matchCount: 2, maskedExample: "**** **** **** 1111", filename: "cards.txt" }),
        ])}
      />,
    );
    expect(screen.getByRole("heading", { name: "2 findings" })).toBeTruthy();
    const rows = within(screen.getByRole("region", { name: "Findings table" })).getAllByRole("row");
    expect(within(rows[0]).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "File", "Scanned", "Type", "Risk", "Matches", "Masked example",
    ]);
    expect(within(rows[2]).getAllByRole("cell").map((c) => c.textContent)).toEqual([
      "cards.txt", "19 Oct 2026, 10:00 UTC", "Payment Card", "Critical", "2", "**** **** **** 1111",
    ]);
  });

  it("uses the singular for one finding", () => {
    render(<FindingsView filters={none} result={ok([finding(1)])} />);
    expect(screen.getByRole("heading", { name: "1 finding" })).toBeTruthy();
  });

  it("renders stored text as plain text, never HTML", () => {
    const { container } = render(
      <FindingsView filters={none} result={ok([finding(1, { filename: "<script>alert(1)</script>.csv", maskedExample: "<b>x</b>" })])} />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText("<script>alert(1)</script>.csv")).toBeTruthy();
    expect(screen.getByText("<b>x</b>")).toBeTruthy();
  });

  it("shows a visible note when the list is capped", () => {
    render(<FindingsView filters={none} result={ok(Array.from({ length: FINDINGS_CAP }, (_, i) => finding(i)), true)} />);
    expect(screen.getByRole("status").textContent).toContain(`Showing the first ${FINDINGS_CAP} findings`);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(`${FINDINGS_CAP} findings (first ${FINDINGS_CAP})`);
  });

  it("shows no capped note otherwise", () => {
    render(<FindingsView filters={none} result={ok([finding(1)])} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("FindingsView: filters", () => {
  it("is a GET form with labelled type and risk selects offering only allowlisted options", () => {
    render(<FindingsView filters={none} result={ok([])} />);
    const form = screen.getByRole("form", { name: "Filter findings" }) as HTMLFormElement;
    expect(form.method).toBe("get");
    expect(form.getAttribute("action")).toBe("/findings");
    const type = screen.getByLabelText("Type") as HTMLSelectElement;
    const risk = screen.getByLabelText("Risk") as HTMLSelectElement;
    expect(type.name).toBe("type");
    expect(risk.name).toBe("risk");
    expect([...type.options].map((o) => o.value)).toEqual(["", "Email", "UK Phone", "UK NINO", "Payment Card"]);
    expect([...risk.options].map((o) => o.value)).toEqual(["", "Low", "Medium", "High", "Critical"]);
  });

  it("reflects the active filters in the controls and offers to clear them", () => {
    render(<FindingsView filters={parseFindingFilters({ type: "UK NINO", risk: "High" })} result={ok([finding(1, { type: "UK NINO", risk: "High" })])} />);
    expect((screen.getByLabelText("Type") as HTMLSelectElement).value).toBe("UK NINO");
    expect((screen.getByLabelText("Risk") as HTMLSelectElement).value).toBe("High");
    expect(screen.getByRole("link", { name: "Clear filters" }).getAttribute("href")).toBe("/findings");
  });

  it("offers no clear link when nothing is filtered", () => {
    render(<FindingsView filters={none} result={ok([finding(1)])} />);
    expect(screen.queryByRole("link", { name: "Clear filters" })).toBeNull();
  });

  it("tells the user that unsupported filter values were ignored, and never selects them", () => {
    const filters = parseFindingFilters({ type: "Passport'; DROP TABLE findings;--", risk: "High" });
    render(<FindingsView filters={filters} result={ok([finding(1, { risk: "High" })])} />);
    expect(screen.getByRole("status").textContent).toContain("Unsupported filter ignored");
    expect((screen.getByLabelText("Type") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Risk") as HTMLSelectElement).value).toBe("High");
  });
});

describe("FindingsView: empty and error", () => {
  it("empty with no filters invites an upload", () => {
    render(<FindingsView filters={none} result={ok([])} />);
    expect(screen.getByText(/No findings yet/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Upload a file" }).getAttribute("href")).toBe("/upload");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("empty with filters says nothing matches and offers to clear", () => {
    render(<FindingsView filters={parseFindingFilters({ type: "Email", risk: "Critical" })} result={ok([])} />);
    expect(screen.getByText("No findings match these filters.")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Clear filters" }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/No findings yet/)).toBeNull();
  });

  it("error state is announced, generic, and still shows the filters", () => {
    const { container } = render(<FindingsView filters={none} result={{ status: "error" }} />);
    expect(screen.getByRole("alert").textContent).toContain("We couldn't load your findings");
    expect(container.textContent).not.toMatch(/PGRST|supabase|relation|undefined|Error:/i);
    expect(screen.getByLabelText("Type")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
