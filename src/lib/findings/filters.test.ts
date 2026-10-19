import { describe, expect, it } from "vitest";
import { FINDING_RISKS, parseFindingFilters } from "./filters";

const none = { type: null, risk: null, ignoredInvalid: false };

describe("parseFindingFilters", () => {
  it("no parameters -> no filters", () => {
    expect(parseFindingFilters({})).toEqual(none);
    expect(parseFindingFilters(new URLSearchParams())).toEqual(none);
  });

  it.each(["Email", "UK Phone", "UK NINO", "Payment Card"])("accepts the type %s", (type) => {
    expect(parseFindingFilters({ type })).toEqual({ type, risk: null, ignoredInvalid: false });
  });

  it.each(FINDING_RISKS)("accepts the risk %s", (risk) => {
    expect(parseFindingFilters({ risk })).toEqual({ type: null, risk, ignoredInvalid: false });
  });

  it("accepts both together and via URLSearchParams", () => {
    expect(parseFindingFilters({ type: "UK NINO", risk: "High" })).toEqual({ type: "UK NINO", risk: "High", ignoredInvalid: false });
    expect(parseFindingFilters(new URLSearchParams("type=Payment+Card&risk=Critical"))).toEqual({
      type: "Payment Card",
      risk: "Critical",
      ignoredInvalid: false,
    });
  });

  it("treats empty values as 'all' without flagging them", () => {
    expect(parseFindingFilters({ type: "", risk: "" })).toEqual(none);
  });

  it.each([
    "email", // wrong case
    "EMAIL",
    " Email",
    "Email ",
    "Passport",
    "None", // never stored on a finding
    "toString",
    "__proto__",
    "constructor",
    "Email' OR '1'='1",
    "Email;DROP TABLE findings;--",
    "Low,Critical",
    "Low)&risk.eq.Critical",
    "*",
    "%",
    "<script>alert(1)</script>",
    "Email\u0000",
    "Email\nHigh",
    "0",
    "true",
    "A".repeat(10_000),
  ])("ignores the unknown or injection-like value %j", (value) => {
    const t = parseFindingFilters({ type: value });
    const r = parseFindingFilters({ risk: value });
    expect(t).toEqual({ type: null, risk: null, ignoredInvalid: true });
    expect(r).toEqual({ type: null, risk: null, ignoredInvalid: true });
  });

  it("ignores repeated parameters instead of picking one", () => {
    expect(parseFindingFilters({ type: ["Email", "UK Phone"] })).toEqual({ type: null, risk: null, ignoredInvalid: true });
    expect(parseFindingFilters(new URLSearchParams("risk=Low&risk=High"))).toEqual({ type: null, risk: null, ignoredInvalid: true });
  });

  it("keeps a valid filter when the other one is invalid", () => {
    expect(parseFindingFilters({ type: "Email", risk: "Bogus" })).toEqual({ type: "Email", risk: null, ignoredInvalid: true });
  });

  it("never returns a value that was not on the allowlist", () => {
    for (const raw of ["Email", "x", "email", "UK Phone'--", ["Email"], undefined]) {
      const { type } = parseFindingFilters({ type: raw as string });
      expect([null, "Email", "UK Phone", "UK NINO", "Payment Card"]).toContain(type);
    }
  });

  it("ignores unrelated parameters", () => {
    expect(parseFindingFilters({ page: "2", sort: "x" })).toEqual(none);
  });
});
