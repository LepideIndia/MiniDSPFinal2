import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  fetchFilteredFindings: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));

vi.mock("@/lib/data/read", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data/read")>();
  return { ...actual, fetchFilteredFindings: mocks.fetchFilteredFindings };
});

import { GET } from "./route";

describe("GET /api/export", () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.fetchFilteredFindings.mockReset();
  });

  it("requires a signed-in user and returns a formula-safe CSV", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mocks.fetchFilteredFindings.mockResolvedValue([
      {
        id: "f1",
        filename: "=cmd|/c calc.csv",
        scannedAt: "2026-10-20T12:00:00Z",
        type: "Email",
        risk: "Low",
        matchCount: 2,
        maskedExample: "a***@example.test",
      },
      {
        id: "f2",
        filename: "notes,final.csv",
        scannedAt: "2026-10-21T10:00:00Z",
        type: "Payment Card",
        risk: "Critical",
        matchCount: 1,
        maskedExample: '"=1+1"',
      },
    ]);

    const res = await GET(new Request("http://localhost/api/export?type=Email"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const csv = await res.text();
    expect(csv).toContain("filename,scanned_at,type,risk,match_count,masked_example");
    expect(csv).toContain("'=cmd|/c calc.csv");
    expect(csv).toContain('"notes,final.csv"');
    expect(csv).toContain('"""=1+1"""');
  });

  it("returns 401 without a user", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await GET(new Request("http://localhost/api/export"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized", message: "Sign in to export findings." });
  });
});
