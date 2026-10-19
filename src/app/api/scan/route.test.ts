import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  scanText: vi.fn(),
  validateUpload: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }),
}));
// Pass-through wrappers so tests can prove whether these were reached.
vi.mock("@/lib/detection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/detection")>();
  mocks.scanText.mockImplementation(actual.scanText);
  return { ...actual, scanText: mocks.scanText };
});
vi.mock("@/lib/upload/validate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/upload/validate")>();
  mocks.validateUpload.mockImplementation(actual.validateUpload);
  return { ...actual, validateUpload: mocks.validateUpload };
});

import { POST } from "./route";

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "a@example.test" };
const SCAN_ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: USER }, error: null });
  mocks.rpc.mockReset().mockResolvedValue({ data: SCAN_ID, error: null });
  mocks.scanText.mockClear();
  mocks.validateUpload.mockClear();
});

const URL = "http://localhost/api/scan";
const enc = (s: string) => new TextEncoder().encode(s);

function uploadRequest(content: BlobPart, filename = "data.csv", extra?: (fd: FormData) => void) {
  const fd = new FormData();
  fd.append("file", new File([content], filename, { type: "text/csv" }));
  extra?.(fd);
  return new Request(URL, { method: "POST", body: fd });
}

const RAW_VALUES = ["alex@example.test", "07700 900123", "AB 12 34 56 C", "4111 1111 1111 1111"];
const MIXED = `name,contact\nAlex,${RAW_VALUES[0]}\nPhone,${RAW_VALUES[1]}\nNI,${RAW_VALUES[2]}\nCard,${RAW_VALUES[3]}\n`;

describe("POST /api/scan: success", () => {
  it("mixed file -> Critical with masked values only", async () => {
    const res = await POST(uploadRequest(MIXED, "mixed.csv"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({
      scanId: SCAN_ID,
      filename: "mixed.csv",
      risk: "Critical",
      findingCount: 4,
      findings: [
        { type: "Payment Card", risk: "Critical", matchCount: 1, maskedExample: "**** **** **** 1111" },
        { type: "UK NINO", risk: "High", matchCount: 1, maskedExample: "AB ** ** ** *" },
        { type: "UK Phone", risk: "Medium", matchCount: 1, maskedExample: "***** ***123" },
        { type: "Email", risk: "Low", matchCount: 1, maskedExample: "a***@example.test" },
      ],
    });
    const out = JSON.stringify(body);
    for (const raw of RAW_VALUES) expect(out).not.toContain(raw);
  });

  it("clean file -> None", async () => {
    const res = await POST(uploadRequest("quarter,revenue\nQ1,12345\n", "clean.txt"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ scanId: SCAN_ID, filename: "clean.txt", risk: "None", findingCount: 0, findings: [] });
  });

  it("returns the sanitised filename, never the client path", async () => {
    const res = await POST(uploadRequest("a", "..\\..\\secret\\x.csv"));
    expect((await res.json()).filename).toBe("x.csv");
  });

  it("accepts a file of exactly 1,048,576 bytes", async () => {
    const res = await POST(uploadRequest(new Uint8Array(1_048_576).fill(97), "big.txt"));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/scan: rejections never echo content", () => {
  const secretFile = `${MIXED}\u0000`; // NUL makes it binary but still contains raw values

  const cases: { name: string; make: () => Request; status: number; error: string }[] = [
    { name: "empty file", make: () => uploadRequest("", "e.csv"), status: 400, error: "empty_file" },
    { name: "1,048,577 bytes", make: () => uploadRequest(new Uint8Array(1_048_577).fill(97), "big.txt"), status: 413, error: "file_too_large" },
    { name: ".pdf", make: () => uploadRequest(MIXED, "x.pdf"), status: 415, error: "unsupported_extension" },
    { name: ".exe", make: () => uploadRequest(MIXED, "x.exe"), status: 415, error: "unsupported_extension" },
    { name: "NUL bytes in .csv", make: () => uploadRequest(secretFile, "x.csv"), status: 415, error: "binary_content" },
    { name: "invalid UTF-8", make: () => uploadRequest(new Uint8Array([...enc(MIXED), 0xff, 0xfe]), "x.csv"), status: 415, error: "invalid_encoding" },
    { name: "over-long filename", make: () => uploadRequest(MIXED, "a".repeat(300) + ".csv"), status: 400, error: "invalid_filename" },
    { name: "extension-only filename", make: () => uploadRequest(MIXED, ".csv"), status: 400, error: "invalid_filename" },
    {
      name: "two file fields",
      make: () => uploadRequest(MIXED, "a.csv", (fd) => fd.append("file", new File([MIXED], "b.csv"))),
      status: 400,
      error: "multiple_files",
    },
    {
      name: "file plus extra field",
      make: () => uploadRequest(MIXED, "a.csv", (fd) => fd.append("note", MIXED)),
      status: 400,
      error: "multiple_files",
    },
    {
      name: "missing file (no fields)",
      make: () => new Request(URL, { method: "POST", body: new FormData() }),
      status: 400,
      error: "missing_file",
    },
    {
      name: "wrong field name",
      make: () => {
        const fd = new FormData();
        fd.append("upload", new File([MIXED], "a.csv"));
        return new Request(URL, { method: "POST", body: fd });
      },
      status: 400,
      error: "missing_file",
    },
    {
      name: "text field instead of a file",
      make: () => {
        const fd = new FormData();
        fd.append("file", MIXED);
        return new Request(URL, { method: "POST", body: fd });
      },
      status: 400,
      error: "missing_file",
    },
    {
      name: "not multipart",
      make: () => new Request(URL, { method: "POST", body: MIXED, headers: { "content-type": "text/csv" } }),
      status: 415,
      error: "unsupported_media_type",
    },
    {
      name: "malformed multipart body",
      make: () =>
        new Request(URL, { method: "POST", body: MIXED, headers: { "content-type": "multipart/form-data; boundary=zzz" } }),
      status: 400,
      error: "invalid_request",
    },
    {
      name: "oversized Content-Length (rejected before reading)",
      make: () => {
        const req = uploadRequest("tiny", "a.csv");
        return new Request(URL, { method: "POST", body: req.body, headers: { "content-type": req.headers.get("content-type")!, "content-length": "99999999" }, duplex: "half" } as RequestInit);
      },
      status: 413,
      error: "file_too_large",
    },
    {
      name: "non-numeric Content-Length",
      make: () => {
        const req = uploadRequest("tiny", "a.csv");
        return new Request(URL, { method: "POST", body: req.body, headers: { "content-type": req.headers.get("content-type")!, "content-length": "abc" }, duplex: "half" } as RequestInit);
      },
      status: 400,
      error: "invalid_request",
    },
  ];

  it.each(cases)("$name -> $status $error", async ({ make, status, error }) => {
    const res = await POST(make());
    const text = await res.text();
    expect(res.status).toBe(status);
    expect(JSON.parse(text).error).toBe(error);
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(["error", "message"]);
    for (const raw of [...RAW_VALUES, "alex", "x.pdf", "x.exe", "x.csv"]) expect(text).not.toContain(raw);
  });

  it("stops reading a chunked body with no Content-Length once it exceeds the cap", async () => {
    let pulled = 0;
    const boundary = "----cap";
    const head = enc(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.csv"\r\n\r\n`);
    const chunk = new Uint8Array(65_536).fill(97);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulled === 0) controller.enqueue(head);
        pulled++;
        controller.enqueue(chunk);
        if (pulled > 1000) controller.close(); // would be 64 MiB if never stopped
      },
    });
    const req = new Request(URL, {
      method: "POST",
      body: stream,
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      duplex: "half",
    } as RequestInit);
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(pulled).toBeLessThan(100);
  });
});

describe("POST /api/scan: authentication (checked first)", () => {
  it.each([
    ["no session", { data: { user: null }, error: null }],
    ["auth error", { data: { user: null }, error: { message: "jwt expired" } }],
    ["error with a user object", { data: { user: USER }, error: { message: "bad" } }],
  ])("%s -> 401 and the body, validator, scanner and save are never reached", async (_name, authResult) => {
    mocks.getUser.mockResolvedValue(authResult);
    const request = uploadRequest(MIXED, "mixed.csv");
    const res = await POST(request);
    const text = await res.text();
    expect(res.status).toBe(401);
    expect(JSON.parse(text)).toEqual({ error: "unauthorized", message: "Sign in to upload files." });
    expect(request.bodyUsed).toBe(false);
    expect(mocks.validateUpload).not.toHaveBeenCalled();
    expect(mocks.scanText).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    for (const raw of RAW_VALUES) expect(text).not.toContain(raw);
  });

  it("an unauthenticated invalid upload gets 401, not a validation error", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST(uploadRequest("", "x.exe"));
    expect(res.status).toBe(401);
  });

  it("a thrown auth client failure becomes a generic 500 with no body echo", async () => {
    mocks.getUser.mockRejectedValue(new Error(`boom ${RAW_VALUES[0]}`));
    const res = await POST(uploadRequest(MIXED, "mixed.csv"));
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(text).not.toContain(RAW_VALUES[0]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("POST /api/scan: saving", () => {
  it("calls save_scan once with masked, aggregated findings only", async () => {
    const res = await POST(uploadRequest(MIXED, "mixed.csv"));
    expect(res.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = mocks.rpc.mock.calls[0];
    expect(fn).toBe("save_scan");
    expect(args).toEqual({
      p_filename: "mixed.csv",
      p_findings: [
        { type: "Payment Card", risk: "Critical", match_count: 1, masked_example: "**** **** **** 1111" },
        { type: "UK NINO", risk: "High", match_count: 1, masked_example: "AB ** ** ** *" },
        { type: "UK Phone", risk: "Medium", match_count: 1, masked_example: "***** ***123" },
        { type: "Email", risk: "Low", match_count: 1, masked_example: "a***@example.test" },
      ],
    });
    const sent = JSON.stringify(mocks.rpc.mock.calls);
    for (const raw of RAW_VALUES) expect(sent).not.toContain(raw);
    for (const frag of ["900123", "4111", "12 34 56", "alex@"]) expect(sent).not.toContain(frag);
  });

  it("saves a clean file as an empty findings array", async () => {
    await POST(uploadRequest("a,b\n1,2\n", "clean.csv"));
    expect(mocks.rpc).toHaveBeenCalledWith("save_scan", { p_filename: "clean.csv", p_findings: [] });
  });

  it("does not save rejected uploads", async () => {
    await POST(uploadRequest(`${MIXED}\u0000`, "bad.csv"));
    await POST(uploadRequest(MIXED, "bad.pdf"));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  const failures: [string, () => void][] = [
    ["an error object", () => mocks.rpc.mockResolvedValue({ data: null, error: { message: `leaks ${RAW_VALUES[0]}`, details: RAW_VALUES[3] } })],
    ["a rejected promise", () => mocks.rpc.mockRejectedValue(new Error(`leaks ${RAW_VALUES[1]}`))],
    ["no id returned", () => mocks.rpc.mockResolvedValue({ data: null, error: null })],
    ["a non-string id", () => mocks.rpc.mockResolvedValue({ data: { id: SCAN_ID }, error: null })],
  ];
  it.each(failures)("save failure (%s) -> generic 500 and no success body", async (_name, arrange) => {
    arrange();
    const res = await POST(uploadRequest(MIXED, "mixed.csv"));
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(JSON.parse(text)).toEqual({ error: "save_failed", message: "The scan could not be saved." });
    for (const raw of [...RAW_VALUES, SCAN_ID, "risk", "findings"]) expect(text).not.toContain(raw);
  });
});

describe("POST /api/scan: no content in server output", () => {
  it("does not write to console on success, rejection, 401 or save failure", async () => {
    const calls: unknown[][] = [];
    const methods = ["log", "info", "warn", "error", "debug"] as const;
    const originals = methods.map((m) => console[m]);
    methods.forEach((m) => (console[m] = (...args: unknown[]) => void calls.push(args)));
    try {
      await POST(uploadRequest(MIXED, "mixed.csv"));
      await POST(uploadRequest(`${MIXED}\u0000`, "bad.csv"));
      mocks.rpc.mockResolvedValue({ data: null, error: { message: RAW_VALUES[0] } });
      await POST(uploadRequest(MIXED, "mixed.csv"));
      mocks.rpc.mockRejectedValue(new Error(RAW_VALUES[3]));
      await POST(uploadRequest(MIXED, "mixed.csv"));
      mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
      await POST(uploadRequest(MIXED, "mixed.csv"));
    } finally {
      methods.forEach((m, i) => (console[m] = originals[i]));
    }
    expect(calls).toEqual([]);
  });
});
