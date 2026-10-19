const formatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** Fixed locale and UTC so the server and any test render the same text. Returns "Unknown date" for bad input. */
export function formatScanDate(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "Unknown date" : `${formatter.format(new Date(t))} UTC`;
}
