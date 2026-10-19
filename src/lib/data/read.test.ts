import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  DataError,
  FINDINGS_CAP,
  MAX_DASHBOARD_SCANS,
  fetchAllScans,
  fetchFindings,
  parseFindingRows,
  parseScanRows,
} from "./read";

const scanRaw = (i: number, over: Record<string, unknown> = {}) => ({
  id: `s${i}`,
  filename: `file${i}.csv`,
  scanned_at: "2026-10-19T10:00:00+00:00",
  risk: "Low",
  finding_count: 2,
  ...over,
});
const findingRaw = (i: number, over: Record<string, unknown> = {}) => ({
  id: `f${i}`,
  type: "Email",
  risk: "Low",
  match_count: 3,
  masked_example: "a***@example.test",
  scans: { filename: `file${i}.csv`, scanned_at: "2026-10-19T10:00:00+00:00" },
  ...over,
});

/** Chainable stand-in for the Supabase query builder that records every call and replays scripted pages. */
function fakeClient(pages: { data?: unknown; error?: unknown }[] | (() => never)) {
  const calls: { method: string; args: unknown[] }[] = [];
  let page = 0;
  const builder: Record<string, unknown> = {};
  const record = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args });
    return builder;
  };
  for (const m of ["select", "eq", "order", "range", "limit"]) builder[m] = record(m);
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
    try {
      if (typeof pages === "function") pages();
      const next = (pages as { data?: unknown; error?: unknown }[])[Math.min(page++, pages.length - 1)];
      return Promise.resolve({ data: next.data ?? null, error: next.error ?? null }).then(resolve, reject);
    } catch (e) {
      return Promise.reject(e).then(resolve, reject);
    }
  };
  return { client: { from: (table: string) => (calls.push({ method: "from", args: [table] }), builder) } as unknown as SupabaseClient, calls };
}

describe("parseScanRows", () => {
  it("maps database rows to camelCase", () => {
    expect(parseScanRows([scanRaw(1)])).toEqual([
      { id: "s1", filename: "file1.csv", scannedAt: "2026-10-19T10:00:00+00:00", risk: "Low", findingCount: 2 },
    ]);
  });
  it("accepts an empty list", () => expect(parseScanRows([])).toEqual([]));
  it.each([
    ["not an array", { rows: [] }],
    ["null", null],
    ["unknown risk", [scanRaw(1, { risk: "Severe" })]],
    ["negative count", [scanRaw(1, { finding_count: -1 })]],
    ["fractional count", [scanRaw(1, { finding_count: 1.5 })]],
    ["string count", [scanRaw(1, { finding_count: "2" })]],
    ["bad date", [scanRaw(1, { scanned_at: "yesterday" })]],
    ["missing filename", [scanRaw(1, { filename: undefined })]],
    ["row is not an object", ["x"]],
  ])("rejects malformed data (%s) with a generic error", (_n, data) => {
    expect(() => parseScanRows(data)).toThrow(DataError);
  });
});

describe("parseFindingRows", () => {
  it("maps rows and the embedded scan (object or one-element array)", () => {
    const expected = {
      id: "f1",
      filename: "file1.csv",
      scannedAt: "2026-10-19T10:00:00+00:00",
      type: "Email",
      risk: "Low",
      matchCount: 3,
      maskedExample: "a***@example.test",
    };
    expect(parseFindingRows([findingRaw(1)])).toEqual([expected]);
    expect(parseFindingRows([findingRaw(1, { scans: [{ filename: "file1.csv", scanned_at: "2026-10-19T10:00:00+00:00" }] })])).toEqual([expected]);
  });
  it.each([
    ["unknown type", [findingRaw(1, { type: "Passport" })]],
    ["risk None", [findingRaw(1, { risk: "None" })]],
    ["zero-or-negative count", [findingRaw(1, { match_count: -3 })]],
    ["missing embedded scan", [findingRaw(1, { scans: null })]],
    ["non-string masked example", [findingRaw(1, { masked_example: 42 })]],
    ["not an array", "oops"],
  ])("rejects malformed data (%s)", (_n, data) => {
    expect(() => parseFindingRows(data)).toThrow(DataError);
  });
  it("keeps hostile text as plain strings", () => {
    const row = parseFindingRows([findingRaw(1, { scans: { filename: "<img src=x onerror=alert(1)>.csv", scanned_at: "2026-10-19T10:00:00Z" } })])[0];
    expect(row.filename).toBe("<img src=x onerror=alert(1)>.csv");
  });
});

describe("fetchAllScans", () => {
  it("reads the scans table once when the first page is not full", async () => {
    const { client, calls } = fakeClient([{ data: [scanRaw(1), scanRaw(2)] }]);
    const out = await fetchAllScans(client);
    expect(out.rows).toHaveLength(2);
    expect(out.capped).toBe(false);
    expect(calls.filter((c) => c.method === "range")).toEqual([{ method: "range", args: [0, 999] }]);
    expect(calls[0]).toEqual({ method: "from", args: ["scans"] });
  });

  it("pages through more than 1000 rows", async () => {
    const full = Array.from({ length: 1000 }, (_, i) => scanRaw(i));
    const { client, calls } = fakeClient([{ data: full }, { data: [scanRaw(1000), scanRaw(1001)] }]);
    const out = await fetchAllScans(client);
    expect(out.rows).toHaveLength(1002);
    expect(calls.filter((c) => c.method === "range").map((c) => c.args)).toEqual([[0, 999], [1000, 1999]]);
  });

  it(`flags when there are more than ${MAX_DASHBOARD_SCANS} scans and returns exactly that many`, async () => {
    const full = Array.from({ length: 1000 }, (_, i) => scanRaw(i));
    const pages = [{ data: full }, { data: full }, { data: full }, { data: full }, { data: full }, { data: [scanRaw(5000)] }];
    const { client } = fakeClient(pages);
    const out = await fetchAllScans(client);
    expect(out.capped).toBe(true);
    expect(out.rows).toHaveLength(MAX_DASHBOARD_SCANS);
  });

  it("exactly the cap is not flagged", async () => {
    const full = Array.from({ length: 1000 }, (_, i) => scanRaw(i));
    const { client } = fakeClient([{ data: full }, { data: full }, { data: full }, { data: full }, { data: full }, { data: [] }]);
    const out = await fetchAllScans(client);
    expect(out.capped).toBe(false);
    expect(out.rows).toHaveLength(MAX_DASHBOARD_SCANS);
  });

  it("turns a Supabase error into a generic DataError that carries no payload", async () => {
    const { client } = fakeClient([{ error: { message: "secret alex@example.test", details: "4111 1111 1111 1111" } }]);
    const err = await fetchAllScans(client).catch((e) => e);
    expect(err).toBeInstanceOf(DataError);
    expect(`${err.message}${JSON.stringify(err)}${err.stack?.split("\n")[0]}`).not.toMatch(/alex|4111/);
  });

  it("turns a thrown client failure into a DataError", async () => {
    const { client } = fakeClient(() => {
      throw new Error("network down alex@example.test");
    });
    const err = await fetchAllScans(client).catch((e) => e);
    expect(err).toBeInstanceOf(DataError);
    expect(err.message).toBe("data_error");
  });

  it("fails closed on malformed rows", async () => {
    const { client } = fakeClient([{ data: [scanRaw(1, { risk: "Weird" })] }]);
    await expect(fetchAllScans(client)).rejects.toBeInstanceOf(DataError);
  });
});

describe("fetchFindings", () => {
  it("applies no filter calls when none are set and asks for cap + 1 rows", async () => {
    const { client, calls } = fakeClient([{ data: [findingRaw(1)] }]);
    await fetchFindings(client, { type: null, risk: null });
    expect(calls.some((c) => c.method === "eq")).toBe(false);
    expect(calls.find((c) => c.method === "limit")?.args).toEqual([FINDINGS_CAP + 1]);
    expect(calls[0]).toEqual({ method: "from", args: ["findings"] });
  });

  it("applies exactly the validated type and risk filters", async () => {
    const { client, calls } = fakeClient([{ data: [] }]);
    await fetchFindings(client, { type: "UK NINO", risk: "High" });
    expect(calls.filter((c) => c.method === "eq").map((c) => c.args)).toEqual([["type", "UK NINO"], ["risk", "High"]]);
  });

  it("returns up to the cap and flags when more exist", async () => {
    const rows = Array.from({ length: FINDINGS_CAP + 1 }, (_, i) => findingRaw(i));
    const out = await fetchFindings(fakeClient([{ data: rows }]).client, { type: null, risk: null });
    expect(out.rows).toHaveLength(FINDINGS_CAP);
    expect(out.capped).toBe(true);
  });

  it("does not flag when exactly the cap is returned", async () => {
    const rows = Array.from({ length: FINDINGS_CAP }, (_, i) => findingRaw(i));
    const out = await fetchFindings(fakeClient([{ data: rows }]).client, { type: null, risk: null });
    expect(out.rows).toHaveLength(FINDINGS_CAP);
    expect(out.capped).toBe(false);
  });

  it("sorts newest scan first", async () => {
    const rows = [
      findingRaw(1, { scans: { filename: "old.csv", scanned_at: "2026-10-01T00:00:00Z" } }),
      findingRaw(2, { scans: { filename: "new.csv", scanned_at: "2026-10-18T00:00:00Z" } }),
    ];
    const out = await fetchFindings(fakeClient([{ data: rows }]).client, { type: null, risk: null });
    expect(out.rows.map((r) => r.filename)).toEqual(["new.csv", "old.csv"]);
  });

  it("returns a generic DataError on a query error", async () => {
    const { client } = fakeClient([{ error: { message: "relation scans leaks 07700 900123" } }]);
    const err = await fetchFindings(client, { type: null, risk: null }).catch((e) => e);
    expect(err).toBeInstanceOf(DataError);
    expect(err.message).toBe("data_error");
  });
});
