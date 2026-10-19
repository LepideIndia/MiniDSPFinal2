/**
 * LIVE two-user RLS / atomicity test against the real Supabase project (publishable key only, no service role).
 * Run: npm run test:rls
 *
 * Needs, in .env.local (values are never printed):
 *   TEST_USER_A_EMAIL, TEST_USER_A_PASSWORD, TEST_USER_B_EMAIL, TEST_USER_B_PASSWORD
 * Use synthetic @example.test addresses for confirmed users (see WORK_LOG.md for setup steps).
 * Without them every test is SKIPPED, which is not a pass. Requires db/002_rls_and_save_scan.sql to have been run.
 *
 * Users cannot delete rows (by design), so each run leaves a few rows whose filename starts with "rls-test-".
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REQUIRED_ENV, loadEnvLocal } from "./env";

loadEnvLocal();

const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
const configured = missing.length === 0;

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const RAW = {
  email: "alex@example.test",
  phone: "07700 900123",
  nino: "AB 12 34 56 C",
  card: "4111 1111 1111 1111",
};
const RAW_FRAGMENTS = [...Object.values(RAW), "alex@", "900123", "12 34 56", "4111 1111", "4111111111111111"];

const MASKED_FINDINGS = [
  { type: "Payment Card", risk: "Critical", match_count: 2, masked_example: "**** **** **** 1111" },
  { type: "UK NINO", risk: "High", match_count: 1, masked_example: "AB ** ** ** *" },
  { type: "UK Phone", risk: "Medium", match_count: 3, masked_example: "***** ***123" },
  { type: "Email", risk: "Low", match_count: 4, masked_example: "a***@example.test" },
];

const stamp = Date.now();
const name = (label: string) => `rls-test-${stamp}-${label}.csv`;

function newClient(): SupabaseClient {
  return createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

async function signIn(emailVar: string, passwordVar: string) {
  const client = newClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: process.env[emailVar]!,
    password: process.env[passwordVar]!,
  });
  if (error || !data.user) {
    // Do not include the error body or credentials.
    throw new Error(`Could not sign in ${emailVar.replace("_EMAIL", "")}: check the user exists, is confirmed and the password is right.`);
  }
  return { client, id: data.user.id };
}

describe.skipIf(!configured)("LIVE: two-user RLS, ownership and atomic save", () => {
  let A: { client: SupabaseClient; id: string };
  let B: { client: SupabaseClient; id: string };
  let anon: SupabaseClient;
  let scanA: string;
  let scanB: string;
  const findingIdsA: string[] = [];

  beforeAll(async () => {
    A = await signIn("TEST_USER_A_EMAIL", "TEST_USER_A_PASSWORD");
    B = await signIn("TEST_USER_B_EMAIL", "TEST_USER_B_PASSWORD");
    anon = newClient();
    expect(A.id).not.toBe(B.id);

    const a = await A.client.rpc("save_scan", { p_filename: name("a"), p_findings: MASKED_FINDINGS });
    expect(a.error, "save_scan as A (has db/002 been run?)").toBeNull();
    scanA = a.data as string;
    const b = await B.client.rpc("save_scan", { p_filename: name("b"), p_findings: MASKED_FINDINGS.slice(3) });
    expect(b.error, "save_scan as B").toBeNull();
    scanB = b.data as string;

    const rows = await A.client.from("findings").select("id").eq("scan_id", scanA);
    findingIdsA.push(...(rows.data ?? []).map((r) => r.id as string));
  });

  afterAll(async () => {
    await A?.client.auth.signOut();
    await B?.client.auth.signOut();
  });

  describe("positive controls", () => {
    it("A sees own scan and findings; save_scan derived risk and finding_count", async () => {
      const scan = await A.client.from("scans").select("*").eq("id", scanA).single();
      expect(scan.error).toBeNull();
      expect(scan.data).toMatchObject({ user_id: A.id, filename: name("a"), risk: "Critical", finding_count: 10 });
      expect(findingIdsA).toHaveLength(4);
    });
    it("B's scan is owned by B, with risk derived from its findings", async () => {
      const scan = await B.client.from("scans").select("*").eq("id", scanB).single();
      expect(scan.data).toMatchObject({ user_id: B.id, risk: "Low", finding_count: 4 });
    });
    it("a clean scan is saved with risk None and count 0", async () => {
      const id = await A.client.rpc("save_scan", { p_filename: name("clean"), p_findings: [] });
      expect(id.error).toBeNull();
      const scan = await A.client.from("scans").select("risk,finding_count").eq("id", id.data as string).single();
      expect(scan.data).toEqual({ risk: "None", finding_count: 0 });
    });
  });

  describe("B cannot read A's data", () => {
    it("scans", async () => {
      const byId = await B.client.from("scans").select("id").eq("id", scanA);
      expect(byId.data ?? []).toEqual([]);
      const all = await B.client.from("scans").select("id,user_id");
      expect(all.error).toBeNull();
      expect((all.data ?? []).every((r) => r.user_id === B.id)).toBe(true);
      expect((all.data ?? []).map((r) => r.id)).not.toContain(scanA);
    });
    it("findings", async () => {
      const byScan = await B.client.from("findings").select("id").eq("scan_id", scanA);
      expect(byScan.data ?? []).toEqual([]);
      const all = await B.client.from("findings").select("id,user_id");
      expect((all.data ?? []).every((r) => r.user_id === B.id)).toBe(true);
      for (const id of findingIdsA) expect((all.data ?? []).map((r) => r.id)).not.toContain(id);
    });
  });

  describe("B cannot write A's data (and has no direct write access at all)", () => {
    it("cannot insert a scan with A's user_id", async () => {
      const res = await B.client.from("scans").insert({ user_id: A.id, filename: name("forged"), risk: "None", finding_count: 0 });
      expect(res.error).not.toBeNull();
    });
    it("cannot insert a scan directly even as itself (writes only via save_scan)", async () => {
      const res = await B.client.from("scans").insert({ user_id: B.id, filename: name("direct"), risk: "None", finding_count: 0 });
      expect(res.error).not.toBeNull();
    });
    it("cannot insert a finding pointing at A's scan, with A's or B's user_id", async () => {
      for (const user_id of [A.id, B.id]) {
        const res = await B.client
          .from("findings")
          .insert({ scan_id: scanA, user_id, type: "Email", risk: "Low", match_count: 1, masked_example: "a***@example.test" });
        expect(res.error, `user_id=${user_id === A.id ? "A" : "B"}`).not.toBeNull();
      }
    });
    it("update and delete of A's scan and findings affect 0 rows and change nothing", async () => {
      const updScan = await B.client.from("scans").update({ filename: "hacked.csv" }).eq("id", scanA).select();
      const delScan = await B.client.from("scans").delete().eq("id", scanA).select();
      const updFind = await B.client.from("findings").update({ match_count: 999 }).eq("scan_id", scanA).select();
      const delFind = await B.client.from("findings").delete().eq("scan_id", scanA).select();
      for (const res of [updScan, delScan, updFind, delFind]) expect((res.data ?? []).length).toBe(0);

      const scan = await A.client.from("scans").select("filename,finding_count").eq("id", scanA).single();
      expect(scan.data).toEqual({ filename: name("a"), finding_count: 10 });
      const findings = await A.client.from("findings").select("match_count").eq("scan_id", scanA);
      expect((findings.data ?? []).map((f) => f.match_count).sort()).toEqual([1, 2, 3, 4]);
    });
    it("A cannot update or delete its own rows either (append-only)", async () => {
      const upd = await A.client.from("scans").update({ filename: "x.csv" }).eq("id", scanA).select();
      const del = await A.client.from("scans").delete().eq("id", scanA).select();
      expect((upd.data ?? []).length).toBe(0);
      expect((del.data ?? []).length).toBe(0);
      const still = await A.client.from("scans").select("id").eq("id", scanA);
      expect(still.data).toHaveLength(1);
    });
  });

  describe("unauthenticated (anon)", () => {
    it("cannot read scans or findings", async () => {
      for (const table of ["scans", "findings"]) {
        const res = await anon.from(table).select("id").limit(1);
        expect(res.error, table).not.toBeNull();
        expect(res.data ?? []).toEqual([]);
      }
    });
    it("cannot insert", async () => {
      const s = await anon.from("scans").insert({ user_id: A.id, filename: name("anon"), risk: "None", finding_count: 0 });
      const f = await anon
        .from("findings")
        .insert({ scan_id: scanA, user_id: A.id, type: "Email", risk: "Low", match_count: 1, masked_example: "a***@example.test" });
      expect(s.error).not.toBeNull();
      expect(f.error).not.toBeNull();
    });
    it("cannot call save_scan, and no row is created", async () => {
      const res = await anon.rpc("save_scan", { p_filename: name("anon-rpc"), p_findings: [] });
      expect(res.error).not.toBeNull();
      const seen = await A.client.from("scans").select("id").eq("filename", name("anon-rpc"));
      expect(seen.data ?? []).toEqual([]);
    });
  });

  describe("save_scan is atomic and validates its payload (no scan row on any failure)", () => {
    const valid = { type: "Email", risk: "Low", match_count: 1, masked_example: "a***@example.test" };
    const badPayloads: [string, unknown][] = [
      ["invalid type after a valid finding", [valid, { ...valid, type: "Passport" }]],
      ["risk that does not match the type", [{ ...valid, risk: "Critical" }]],
      ["duplicate type", [valid, valid]],
      ["zero match_count", [{ ...valid, match_count: 0 }]],
      ["negative match_count", [{ ...valid, match_count: -1 }]],
      ["fractional match_count", [{ ...valid, match_count: 1.5 }]],
      ["string match_count", [{ ...valid, match_count: "1" }]],
      ["missing masked_example", [{ type: "Email", risk: "Low", match_count: 1 }]],
      ["extra field", [{ ...valid, raw: RAW.email }]],
      ["not an array", { findings: [valid] }],
      ["null", null],
      ["raw email as masked_example", [{ ...valid, masked_example: RAW.email }]],
      ["raw phone as masked_example", [{ type: "UK Phone", risk: "Medium", match_count: 1, masked_example: RAW.phone }]],
      ["raw NINO as masked_example", [{ type: "UK NINO", risk: "High", match_count: 1, masked_example: RAW.nino }]],
      ["raw card as masked_example", [{ type: "Payment Card", risk: "Critical", match_count: 1, masked_example: RAW.card }]],
      ["over-long masked_example", [{ ...valid, masked_example: "a***@" + "x".repeat(400) }]],
    ];
    it.each(badPayloads)("rejects: %s", async (label, payload) => {
      const filename = name(`bad-${String(label).replace(/\W+/g, "-")}`);
      const res = await A.client.rpc("save_scan", { p_filename: filename, p_findings: payload });
      expect(res.error).not.toBeNull();
      const leftover = await A.client.from("scans").select("id").eq("filename", filename);
      expect(leftover.data ?? [], "no scan row may remain").toEqual([]);
    });
    it("rejects bad filenames", async () => {
      for (const filename of ["", "a".repeat(256), "line\nbreak.csv"]) {
        const res = await A.client.rpc("save_scan", { p_filename: filename, p_findings: [] });
        expect(res.error, JSON.stringify(filename.slice(0, 10))).not.toBeNull();
      }
    });
    it("a failing call does not change A's scan count", async () => {
      const count = async () => (await A.client.from("scans").select("id", { count: "exact", head: true })).count;
      const before = await count();
      await A.client.rpc("save_scan", { p_filename: name("atomic"), p_findings: [valid, { ...valid, type: "Passport" }] });
      expect(await count()).toBe(before);
    });
  });

  describe("stored data holds no raw values", () => {
    it("none of the sample raw email, phone, NINO or card appear in A's or B's stored rows", async () => {
      const rows = await Promise.all(
        [A, B].flatMap((u) => [
          u.client.from("scans").select("*").like("filename", `rls-test-${stamp}-%`),
          u.client.from("findings").select("*"),
        ]),
      );
      const stored = JSON.stringify(rows.map((r) => r.data));
      expect(stored.length).toBeGreaterThan(50);
      for (const fragment of RAW_FRAGMENTS) expect(stored, fragment).not.toContain(fragment);
    });
  });
});
