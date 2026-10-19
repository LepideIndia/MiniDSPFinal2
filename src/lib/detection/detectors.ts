import type { FindingType } from "./types";

export interface Detector {
  type: FindingType;
  /** Global pattern that finds candidate tokens; `accept` makes the final decision. */
  pattern: RegExp;
  accept(candidate: string): boolean;
  /** Returns a masked form of an accepted candidate. Never returns the raw value. */
  mask(candidate: string): string;
}

export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return digits.length > 0 && sum % 10 === 0;
}

const digitsOf = (s: string) => s.replace(/\D/g, "");

/** Replaces every digit with `*` except the last `keep` digits; other characters are preserved. */
function maskDigits(s: string, keep: number): string {
  let remaining = digitsOf(s).length;
  return s.replace(/\d/g, (d) => (remaining-- > keep ? "*" : d));
}

const email: Detector = {
  type: "Email",
  pattern:
    /(?<![A-Za-z0-9._%+@-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(?![A-Za-z0-9@-])(?!\.[A-Za-z0-9])/g,
  accept(s) {
    const at = s.indexOf("@");
    const local = s.slice(0, at);
    const labels = s.slice(at + 1).split(".");
    return (
      s.length <= 254 &&
      local.length <= 64 &&
      !local.startsWith(".") &&
      !local.endsWith(".") &&
      !local.includes("..") &&
      labels.every((l) => l.length >= 1 && l.length <= 63 && !l.startsWith("-") && !l.endsWith("-"))
    );
  },
  mask(s) {
    const at = s.indexOf("@");
    const local = s.slice(0, at);
    return `${local.length >= 3 ? local[0] : ""}***${s.slice(at)}`;
  },
};

// Mobile (07…) and geographic (01…/02…) numbers, 11 digits nationally, written with 0 or +44.
// Digits joined by single spaces/hyphens count as one run, so a phone inside a longer run is rejected.
const phone: Detector = {
  type: "UK Phone",
  pattern:
    /(?<![\w@.+-])(?<!\d[ -])(?:\+44[ -]?(?:\(0\)[ -]?)?|0)\d(?:[ -]?\d){9}(?![\w@])(?![ -]\d)(?!\.\w)/g,
  accept(s) {
    const digits = digitsOf(s);
    const national = s.startsWith("+") ? "0" + digits.slice(s.includes("(0)") ? 3 : 2) : digits;
    return /^0(?:7\d{9}|[12]\d{9})$/.test(national);
  },
  mask: (s) => maskDigits(s, 3),
};

const NINO_BANNED_PREFIXES = new Set(["BG", "GB", "NK", "KN", "TN", "NT", "ZZ"]);

const nino: Detector = {
  type: "UK NINO",
  pattern:
    /(?<![\w@.+-])[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z] ?\d{2} ?\d{2} ?\d{2}(?: ?[A-D])?(?![\w@])(?!\.\w)(?! ?[A-Za-z](?![A-Za-z0-9]))/gi,
  accept: (s) => !NINO_BANNED_PREFIXES.has(s.slice(0, 2).toUpperCase()),
  mask(s) {
    let seen = 0;
    return s.replace(/[A-Za-z0-9]/g, (c) => (seen++ < 2 ? c.toUpperCase() : "*"));
  },
};

// 13–19 digits, optional single space/hyphen between digits, Luhn-valid.
const card: Detector = {
  type: "Payment Card",
  pattern: /(?<![\w@])(?<!\d[ -])\d(?:[ -]?\d){12,18}(?![\w@])(?![ -]\d)/g,
  accept: (s) => luhnValid(digitsOf(s)),
  mask: (s) => maskDigits(s, 4),
};

/** Ordered by precedence: when matches overlap, the earlier detector in this list wins. */
export const DETECTORS: readonly Detector[] = [card, email, nino, phone];
