import { describe, expect, it } from "vitest";
import { SaveScanError, saveScan, toSavePayload, type RpcClient } from "./save";
import { scanText } from "@/lib/detection";

const fake = (reply: { data: unknown; error: unknown } | Error): { client: RpcClient; calls: unknown[][] } => {
  const calls: unknown[][] = [];
  return {
    calls,
    client: {
      rpc: async (fn, args) => {
        calls.push([fn, args]);
        if (reply instanceof Error) throw reply;
        return reply;
      },
    },
  };
};

describe("toSavePayload", () => {
  it("maps engine findings to snake_case save_scan fields and nothing else", () => {
    const payload = toSavePayload(scanText("alex@example.test 4111 1111 1111 1111"));
    expect(payload).toEqual([
      { type: "Payment Card", risk: "Critical", match_count: 1, masked_example: "**** **** **** 1111" },
      { type: "Email", risk: "Low", match_count: 1, masked_example: "a***@example.test" },
    ]);
    expect(JSON.stringify(payload)).not.toContain("alex@");
  });
  it("is an empty array when nothing was found", () => {
    expect(toSavePayload(scanText("nothing here"))).toEqual([]);
  });
});

describe("saveScan", () => {
  it("returns the id and never sends scan risk or count (the database derives them)", async () => {
    const { client, calls } = fake({ data: "abc", error: null });
    expect(await saveScan(client, "f.csv", scanText("a@b.test"))).toBe("abc");
    expect(Object.keys((calls[0][1] as object))).toEqual(["p_filename", "p_findings"]);
  });

  it("falls back to direct inserts when the save_scan RPC is unavailable", async () => {
    const calls: string[] = [];
    const client = {
      rpc: async () => {
        throw new Error("function does not exist");
      },
      auth: {
        getUser: async () => ({ data: { user: { id: "user-123" } }, error: null }),
      },
      from: (table: string) => ({
        insert: (rows: unknown) => {
          calls.push(`${table}:${JSON.stringify(rows)}`);
          return {
            select: () => ({
              single: async () => ({
                data: table === "scans" ? { id: "scan-123" } : null,
                error: null,
              }),
            }),
          };
        },
      }),
    };

    const result = scanText("a@b.test");
    await expect(saveScan(client as never, "f.csv", result)).resolves.toBe("scan-123");
    expect(calls.length).toBe(2);
    expect(calls[0]).toContain('"filename":"f.csv"');
    expect(calls[1]).toContain('"scan_id":"scan-123"');
  });

  it.each([
    ["error", { data: null, error: { message: "secret a@b.test" } }],
    ["no data", { data: null, error: null }],
    ["empty id", { data: "", error: null }],
    ["thrown", new Error("secret a@b.test")],
  ])("throws a generic SaveScanError on %s", async (_n, reply) => {
    const { client } = fake(reply as never);
    const err = await saveScan(client, "f.csv", scanText("a@b.test")).catch((e) => e);
    expect(err).toBeInstanceOf(SaveScanError);
    expect(err.message).toBe("save_failed");
    expect(JSON.stringify(err) + err.message + String(err.stack).split("\n")[0]).not.toContain("a@b.test");
  });
});
