import { fetchFilteredFindings } from "@/lib/data/read";
import { findingsToCsv } from "@/lib/export/csv";
import { parseFindingFilters } from "@/lib/findings/filters";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function safeExportName(name: string): string {
  return name.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "findings";
}

export async function GET(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json(
      { error: "unauthorized", message: "Sign in to export findings." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const filters = parseFindingFilters(new URL(request.url).searchParams);
  const rows = await fetchFilteredFindings(supabase, filters);
  const csv = findingsToCsv(
    rows.map((row) => ({
      filename: row.filename,
      scannedAt: row.scannedAt,
      type: row.type,
      risk: row.risk,
      matchCount: row.matchCount,
      maskedExample: row.maskedExample,
    })),
  );

  const fileName = safeExportName(`findings${filters.type ? `-${filters.type}` : ""}${filters.risk ? `-${filters.risk}` : ""}`) + ".csv";

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}
