import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, sanitizeFilename, validateUpload } from "./validate";

const bytes = (s: string) => new TextEncoder().encode(s);
const codeOf = (b: Uint8Array, name: string) => {
  const r = validateUpload(b, name);
  return r.ok ? "ok" : r.code;
};

describe("size limits (on actual bytes)", () => {
  it("rejects empty", () => expect(codeOf(new Uint8Array(0), "a.csv")).toBe("empty_file"));
  it("accepts 1 byte", () => expect(codeOf(bytes("a"), "a.csv")).toBe("ok"));
  it("accepts exactly 1,048,576 bytes", () => {
    expect(codeOf(new Uint8Array(MAX_UPLOAD_BYTES).fill(97), "a.txt")).toBe("ok");
  });
  it("rejects 1,048,577 bytes", () => {
    expect(codeOf(new Uint8Array(MAX_UPLOAD_BYTES + 1).fill(97), "a.txt")).toBe("file_too_large");
  });
});

describe("extension (MIME type is never consulted)", () => {
  it.each(["a.csv", "a.txt", "A.CSV", "b.TxT", "x.exe.csv"])("%s accepted", (n) => {
    expect(codeOf(bytes("hello"), n)).toBe("ok");
  });
  it.each(["a.pdf", "a.png", "a.exe", "a", "a.csv.exe", "a.csv.", "a.json", "a.csvx"])("%s rejected", (n) => {
    expect(codeOf(bytes("hello"), n)).toBe("unsupported_extension");
  });
  it("rejects a name that is only an extension", () => {
    expect(codeOf(bytes("hello"), ".csv")).toBe("invalid_filename");
  });
});

describe("content", () => {
  it("rejects NUL bytes in a .csv", () => {
    expect(codeOf(new Uint8Array([97, 44, 0, 98]), "a.csv")).toBe("binary_content");
  });
  it("rejects other control characters and DEL", () => {
    expect(codeOf(new Uint8Array([97, 0x01, 98]), "a.csv")).toBe("binary_content");
    expect(codeOf(new Uint8Array([97, 0x1b, 98]), "a.csv")).toBe("binary_content");
    expect(codeOf(new Uint8Array([97, 0x7f, 98]), "a.csv")).toBe("binary_content");
  });
  it("allows tab, LF and CR", () => {
    expect(codeOf(bytes("a\tb\r\nc\n"), "a.csv")).toBe("ok");
  });
  it("rejects invalid UTF-8", () => {
    expect(codeOf(new Uint8Array([0xff, 0xfe, 0x41]), "a.txt")).toBe("invalid_encoding");
    expect(codeOf(new Uint8Array([0xc3, 0x28]), "a.txt")).toBe("invalid_encoding");
    expect(codeOf(new Uint8Array([0xed, 0xa0, 0x80]), "a.txt")).toBe("invalid_encoding"); // surrogate
  });
  it("rejects UTF-16 text (NUL bytes)", () => {
    expect(codeOf(new Uint8Array([0xff, 0xfe, 0x61, 0x00]), "a.txt")).toBe("binary_content");
  });
  it("accepts valid multibyte UTF-8", () => {
    const r = validateUpload(bytes("café, 日本語, 😀"), "a.txt");
    expect(r).toEqual({ ok: true, text: "café, 日本語, 😀", filename: "a.txt" });
  });
  it("strips a leading UTF-8 BOM", () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...bytes("a@b.test")]);
    const r = validateUpload(withBom, "a.csv");
    expect(r.ok && r.text).toBe("a@b.test");
  });
});

describe("filename", () => {
  it("strips paths", () => {
    expect(sanitizeFilename("..\\x.csv")).toBe("x.csv");
    expect(sanitizeFilename("../../etc/passwd.txt")).toBe("passwd.txt");
    expect(sanitizeFilename("C:\\fakepath\\report.csv")).toBe("report.csv");
    expect(validateUpload(bytes("x"), "..\\x.csv")).toMatchObject({ ok: true, filename: "x.csv" });
  });
  it("strips control characters, newlines and bidi overrides", () => {
    expect(sanitizeFilename("a\r\nb\u0000c.csv")).toBe("abc.csv");
    expect(sanitizeFilename("evil\u202Etxt.exe")).toBe("eviltxt.exe");
    expect(codeOf(bytes("x"), "evil\u202Etxt.exe")).toBe("unsupported_extension");
    expect(validateUpload(bytes("x"), "a\nb.csv")).toMatchObject({ ok: true, filename: "ab.csv" });
  });
  it("rejects names that are empty after sanitising", () => {
    for (const n of ["", "   ", "\u0000\u0001", "dir/", "dir\\", "\n"]) expect(codeOf(bytes("x"), n), JSON.stringify(n)).toBe("invalid_filename");
  });
  it("accepts 255 characters and rejects 256", () => {
    expect(codeOf(bytes("x"), "a".repeat(251) + ".csv")).toBe("ok");
    expect(codeOf(bytes("x"), "a".repeat(252) + ".csv")).toBe("invalid_filename");
  });
  it("counts code points, like Postgres char_length", () => {
    expect(codeOf(bytes("x"), "😀".repeat(251) + ".csv")).toBe("ok"); // 255 code points, 502+4 UTF-16 units
  });
});
