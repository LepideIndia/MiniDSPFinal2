// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DashboardView, type DashboardResult } from "./DashboardView";
import { aggregateDashboard, type ScanRow } from "@/lib/stats/aggregate";

afterEach(cleanup);

const rows: ScanRow[] = [
  { id: "a", filename: "customers.csv", scannedAt: "2026-10-19T10:00:00Z", risk: "Critical", findingCount: 9 },
  { id: "b", filename: "notes.txt", scannedAt: "2026-10-18T09:30:00Z", risk: "Low", findingCount: 2 },
  { id: "c", filename: "clean.csv", scannedAt: "2026-10-17T08:00:00Z", risk: "None", findingCount: 0 },
  { id: "d", filename: "staff.csv", scannedAt: "2026-10-16T08:00:00Z", risk: "High", findingCount: 4 },
];
const ok = (data: ScanRow[] = rows, capped = false): DashboardResult => ({ status: "ok", stats: aggregateDashboard(data), capped });

describe("DashboardView: data", () => {
  it("shows the metrics with clear labels, matching the stored rows", () => {
    render(<DashboardView result={ok()} />);
    const summary = screen.getByRole("list", { name: "Summary" });
    const card = (title: string) => within(summary).getByText(title).closest(".lp-card") as HTMLElement;

    expect(within(card("Files scanned")).getByText("4")).toBeTruthy();
    expect(within(card("Total matches")).getByText("15")).toBeTruthy(); // 9 + 2 + 0 + 4
    const hc = card("High or Critical scans");
    expect(within(hc).getByText("2")).toBeTruthy();
    expect(within(hc).getByText(/Scans whose highest risk is High or Critical/)).toBeTruthy();
  });

  it("lists the risk distribution as text, with all five risks and a labelled bar each", () => {
    render(<DashboardView result={ok()} />);
    const table = screen.getByRole("region", { name: "Risk distribution table" });
    const bodyRows = within(table).getAllByRole("row").slice(1);
    expect(bodyRows).toHaveLength(5);
    expect(bodyRows.map((r) => within(r).getAllByRole("cell")[0].textContent)).toEqual(["None", "Low", "Medium", "High", "Critical"]);
    expect(bodyRows.map((r) => within(r).getAllByRole("cell")[1].textContent)).toEqual(["1", "1", "0", "1", "1"]);
    expect(within(table).getByRole("progressbar", { name: "Critical: 1 of 4 scans" }).getAttribute("aria-valuenow")).toBe("25");
    expect(within(table).getByRole("progressbar", { name: "Medium: 0 of 4 scans" }).getAttribute("aria-valuenow")).toBe("0");
  });

  it("lists recent scans newest first with file, date, risk text and match count", () => {
    render(<DashboardView result={ok()} />);
    const table = screen.getByRole("region", { name: "Recent scans table" });
    const bodyRows = within(table).getAllByRole("row").slice(1);
    expect(bodyRows.map((r) => within(r).getAllByRole("cell")[0].textContent)).toEqual(["customers.csv", "notes.txt", "clean.csv", "staff.csv"]);
    const first = within(bodyRows[0]).getAllByRole("cell");
    expect(first[1].textContent).toBe("19 Oct 2026, 10:00 UTC");
    expect(first[2].textContent).toBe("Critical");
    expect(first[3].textContent).toBe("9");
    expect(within(table).getByText("19 Oct 2026, 10:00 UTC").getAttribute("datetime")).toBe("2026-10-19T10:00:00Z");
  });

  it("shows only the 10 most recent scans but counts them all", () => {
    const many = Array.from({ length: 14 }, (_, i): ScanRow => ({
      id: `m${i}`, filename: `f${i}.csv`, scannedAt: `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00Z`, risk: "Low", findingCount: 1,
    }));
    render(<DashboardView result={ok(many)} />);
    expect(within(screen.getByRole("region", { name: "Recent scans table" })).getAllByRole("row")).toHaveLength(11);
    expect(within(screen.getByRole("list", { name: "Summary" })).getAllByText("14").length).toBeGreaterThan(0);
  });

  it("renders filenames as plain text, never as HTML", () => {
    const hostile = "<img src=x onerror=alert(1)>.csv";
    const { container } = render(<DashboardView result={ok([{ id: "x", filename: hostile, scannedAt: "2026-10-19T10:00:00Z", risk: "Low", findingCount: 1 }])} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getAllByText(hostile).length).toBeGreaterThan(0);
  });

  it("explains when only the most recent scans are counted", () => {
    render(<DashboardView result={ok(rows, true)} />);
    expect(screen.getByRole("status").textContent).toMatch(/5,000 most recent scans/);
  });

  it("has no capped note normally", () => {
    render(<DashboardView result={ok()} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("DashboardView: empty and error", () => {
  it("empty state invites the first upload and shows no tables", () => {
    render(<DashboardView result={ok([])} />);
    expect(screen.getByText(/No scans yet/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Upload a file" }).getAttribute("href")).toBe("/upload");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("list", { name: "Summary" })).toBeNull();
  });

  it("error state is announced and generic", () => {
    const { container } = render(<DashboardView result={{ status: "error" }} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("We couldn't load your dashboard");
    expect(container.textContent).not.toMatch(/PGRST|supabase|relation|undefined|Error:/i);
    expect(screen.queryByRole("table")).toBeNull();
  });
});
