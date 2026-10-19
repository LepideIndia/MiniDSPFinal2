import { describe, expect, it } from "vitest";
import { luhnValid, resolveOverlaps, scanText } from "./index";

const types = (text: string) => scanText(text).findings.map((f) => f.type);
const count = (text: string, type: string) =>
  scanText(text).findings.find((f) => f.type === type)?.matchCount ?? 0;

describe("acceptance 1: email", () => {
  it("alex@example.test -> Low, masked", () => {
    const r = scanText("contact alex@example.test today");
    expect(r.risk).toBe("Low");
    expect(r.findings).toEqual([
      { type: "Email", risk: "Low", matchCount: 1, maskedExample: "a***@example.test" },
    ]);
  });
  it("ignores malformed emails", () => {
    for (const bad of ["alex@@example.test", "alex@example", "@example.test", "a..b@example.test", "alex@-example.test", ".alex@example.test"]) {
      expect(scanText(bad).risk, bad).toBe("None");
    }
  });
  it("hides very short local parts completely", () => {
    expect(scanText("a@example.test").findings[0].maskedExample).toBe("***@example.test");
  });
});

describe("acceptance 2: UK phone", () => {
  it.each(["07700 900123", "+44 7700 900123", "07700900123", "+447700900123", "+44 (0)7700 900123", "020 7946 0958", "01632-960-001"])(
    "%s -> Medium",
    (p) => {
      expect(scanText(`call ${p} now`).risk).toBe("Medium");
    },
  );
  it("masks all but the last three digits", () => {
    expect(scanText("07700 900123").findings[0].maskedExample).toBe("***** ***123");
    expect(scanText("+44 7700 900123").findings[0].maskedExample).toBe("+** **** ***123");
  });
  it("ignores short or non-UK-shaped numbers", () => {
    for (const bad of ["12345", "0770 090012", "08001234567", "+1 415 555 0132", "00447700900123"]) {
      expect(scanText(bad).risk, bad).toBe("None");
    }
  });
  it("ignores a phone number inside a longer digit string", () => {
    for (const bad of ["9907700900123", "07700900123456", "07700 900123 4567", "123 07700 900123", "07700900123x"]) {
      expect(types(bad), bad).not.toContain("UK Phone");
    }
  });
});

describe("acceptance 3: UK NINO", () => {
  it("AB 12 34 56 C -> High", () => {
    const r = scanText("NI: AB 12 34 56 C");
    expect(r.risk).toBe("High");
    expect(r.findings[0].maskedExample).toBe("AB ** ** ** *");
  });
  it.each(["AB123456C", "ab 123456 d", "AB 12 34 56", "JK 98 76 54 A"])("%s accepted", (n) => {
    expect(types(n)).toEqual(["UK NINO"]);
  });
  it.each(["AB 12 34 5 C", "AB 12 34 56 E", "A1 12 34 56 C", "AB1234567", "ABC123456C", "AB 12 34 567 C"])(
    "malformed %s ignored",
    (n) => {
      expect(types(n)).toEqual([]);
    },
  );
  it.each(["DA", "FA", "IA", "QA", "UA", "VA", "AD", "AF", "AI", "AO", "AQ", "AU", "AV", "BG", "GB", "NK", "KN", "TN", "NT", "ZZ"])(
    "invalid prefix %s rejected",
    (p) => {
      expect(types(`${p} 12 34 56 C`)).toEqual([]);
    },
  );
});

describe("acceptance 4: payment card", () => {
  it("4111 1111 1111 1111 -> Critical; last digit 2 fails Luhn", () => {
    const ok = scanText("card 4111 1111 1111 1111");
    expect(ok.risk).toBe("Critical");
    expect(ok.findings[0].maskedExample).toBe("**** **** **** 1111");
    expect(scanText("card 4111 1111 1111 1112").risk).toBe("None");
  });
  it("accepts hyphenated and unspaced forms, and 13/15/19-digit cards", () => {
    for (const c of ["4111-1111-1111-1111", "4111111111111111", "4222222222222", "378282246310005", "6011000000000004", "4000000000000000006"]) {
      expect(luhnValid(c.replace(/\D/g, "")), c).toBe(true);
      expect(types(c), c).toEqual(["Payment Card"]);
    }
  });
  it("rejects 12- and 20-digit runs even when a sub-run is Luhn-valid", () => {
    expect(scanText("411111111111").risk).toBe("None"); // 12 digits
    expect(scanText("41111111111111111111").risk).toBe("None"); // 20 digits
    expect(scanText("4111 1111 1111 1111 1111").risk).toBe("None"); // 20 digits grouped
    expect(scanText("4111111111111111 1").risk).toBe("None");
  });
  it("does not report a card as a phone number", () => {
    expect(types("0000000000000000")).toEqual(["Payment Card"]);
  });
});

describe("acceptance 5: classification and counting", () => {
  const mixed = [
    "alex@example.test",
    "07700 900123",
    "AB 12 34 56 C",
    "4111 1111 1111 1111",
  ].join("\n");

  it("mixed file -> Critical with all four types, highest risk first", () => {
    const r = scanText(mixed);
    expect(r.risk).toBe("Critical");
    expect(r.findings.map((f) => f.type)).toEqual(["Payment Card", "UK NINO", "UK Phone", "Email"]);
    expect(r.totalMatches).toBe(4);
  });
  it("clean file and empty text -> None", () => {
    expect(scanText("Quarterly report\nrevenue: 12345, 67890")).toEqual({ risk: "None", totalMatches: 0, findings: [] });
    expect(scanText("")).toEqual({ risk: "None", totalMatches: 0, findings: [] });
  });
  it("counts repeated matches, including repeats of the same value", () => {
    const text = "a@x.test,a@x.test,b@y.test\n07700 900123;07700 900123\n4111 1111 1111 1111";
    expect(count(text, "Email")).toBe(3);
    expect(count(text, "UK Phone")).toBe(2);
    expect(count(text, "Payment Card")).toBe(1);
  });
  it("works on CSV-style rows", () => {
    const r = scanText("name,email,phone\nAnn,ann.lee@example.test,07700900123\nBob,bob@example.test,\"+44 7700 900124\"");
    expect(r.findings.find((f) => f.type === "Email")?.matchCount).toBe(2);
    expect(r.findings.find((f) => f.type === "UK Phone")?.matchCount).toBe(2);
  });
});

describe("CSV cells and rows are independent digit runs", () => {
  const CARD = "4111 1111 1111 1111";
  const PHONE = "07700 900123";
  it.each([
    ["comma", `${CARD},${PHONE}`],
    ["comma then space", `${CARD}, ${PHONE}`],
    ["newline", `${CARD}\n${PHONE}`],
    ["CRLF", `${CARD}\r\n${PHONE}`],
    ["quoted cells", `"${CARD}","${PHONE}"`],
    ["tab", `${CARD}\t${PHONE}`],
    ["semicolon", `${CARD};${PHONE}`],
  ])("card and phone are both found when separated by %s", (_name, text) => {
    expect(types(text).sort()).toEqual(["Payment Card", "UK Phone"]);
  });
  it("finds adjacent cards and adjacent phones across cells and rows", () => {
    expect(count(`${CARD},${CARD}\n${CARD}`, "Payment Card")).toBe(3);
    expect(count(`${PHONE},+44 7700 900124\n07700900125`, "UK Phone")).toBe(3);
  });
  it("finds a card at the end of one row and a phone at the start of the next", () => {
    expect(types(`id,card\n1,${CARD}\n${PHONE},x`).sort()).toEqual(["Payment Card", "UK Phone"]);
  });
  it("still treats a value glued to a neighbouring digit with comma-free text as one run", () => {
    expect(types(`${CARD}0`)).toEqual([]);
  });
});

describe("KNOWN LIMITATION: digits separated by a single space or hyphen form one run", () => {
  // Documented trade-off: this prevents partial matches inside longer numbers,
  // but a card and a phone written next to each other with only a space are both missed.
  it("a card followed by a phone with one space is not detected", () => {
    expect(scanText("4111 1111 1111 1111 07700 900123").risk).toBe("None");
  });
  it("a card followed by a phone with one hyphen is not detected", () => {
    expect(scanText("4111-1111-1111-1111-07700 900123").risk).toBe("None");
  });
  it("two spaces are enough to separate them", () => {
    expect(types("4111 1111 1111 1111  07700 900123").sort()).toEqual(["Payment Card", "UK Phone"]);
  });
});

describe("overlaps and precedence", () => {
  it("phone-like digits inside an email are counted once, as an email", () => {
    const r = scanText("07700900123@example.test");
    expect(r.findings.map((f) => [f.type, f.matchCount])).toEqual([["Email", 1]]);
  });
  it("NINO-like text inside an email is counted once, as an email", () => {
    expect(scanText("AB123456C@example.test").findings.map((f) => f.type)).toEqual(["Email"]);
  });
  it("resolveOverlaps: card beats phone, email beats NINO, ties go to earlier start", () => {
    const kept = resolveOverlaps(
      [
        { type: "UK Phone", start: 0, end: 11 },
        { type: "Payment Card", start: 0, end: 16 },
        { type: "UK NINO", start: 20, end: 29 },
        { type: "Email", start: 18, end: 40 },
        { type: "UK Phone", start: 50, end: 61 },
        { type: "UK Phone", start: 55, end: 66 },
      ],
      70,
    );
    expect(kept).toEqual([
      { type: "Payment Card", start: 0, end: 16 },
      { type: "Email", start: 18, end: 40 },
      { type: "UK Phone", start: 50, end: 61 },
    ]);
  });
  it("adjacent matches separated by punctuation are both found", () => {
    expect(count("07700900123,07700900124", "UK Phone")).toBe(2);
  });
});

describe("raw values never leave the engine", () => {
  const raws = ["alex@example.test", "07700 900123", "+44 7700 900124", "AB 12 34 56 C", "4111 1111 1111 1111"];;
  it("JSON of the result contains no raw value or unmasked fragment", () => {
    const text = raws.join(" ; ");
    const json = JSON.stringify(scanText(text));
    for (const raw of raws) expect(json).not.toContain(raw);
    for (const frag of ["alex@", "900123", "7700 90012", "12 34 56", "4111", "1111 1111"]) {
      expect(json, frag).not.toContain(frag);
    }
    // only the documented fields are present
    expect(Object.keys(scanText(text)).sort()).toEqual(["findings", "risk", "totalMatches"]);
    for (const f of scanText(text).findings) {
      expect(Object.keys(f).sort()).toEqual(["maskedExample", "matchCount", "risk", "type"]);
    }
  });
  it("rejects non-string input with a message that contains no input", () => {
    expect(() => scanText(123456 as unknown as string)).toThrow("scanText expects a string");
  });
});

describe("robustness", () => {
  it("handles 1 MiB of adversarial input quickly", () => {
    const inputs = ["a".repeat(1_048_576), "1".repeat(1_048_576), "1 ".repeat(524_288), "a.".repeat(524_288), "0".repeat(1_048_576)];
    const start = Date.now();
    for (const input of inputs) scanText(input);
    expect(Date.now() - start).toBeLessThan(10_000);
  });
});
