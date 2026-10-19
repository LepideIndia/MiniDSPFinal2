export interface CsvExportRow {
  filename: string;
  scannedAt: string;
  type: string;
  risk: string;
  matchCount: number;
  maskedExample: string;
}

function neutraliseFormula(value: string): string {
  return /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvEscape(value: string): string {
  const safe = neutraliseFormula(value);
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function findingsToCsv(rows: CsvExportRow[]): string {
  const header = ["filename", "scanned_at", "type", "risk", "match_count", "masked_example"];
  const lines = [
    header.map(csvEscape).join(","),
    ...rows.map((row) =>
      [row.filename, row.scannedAt, row.type, row.risk, String(row.matchCount), row.maskedExample]
        .map(csvEscape)
        .join(","),
    ),
  ];
  return `${lines.join("\r\n")}\r\n`;
}
