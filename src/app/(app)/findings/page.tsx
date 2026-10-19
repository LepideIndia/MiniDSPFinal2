import { FindingsView, type FindingsResult } from "@/components/FindingsView";
import { fetchFindings } from "@/lib/data/read";
import { parseFindingFilters } from "@/lib/findings/filters";
import { requireUser } from "@/lib/supabase/require-user";

export default async function FindingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { supabase } = await requireUser();
  const filters = parseFindingFilters(await searchParams);
  let result: FindingsResult;
  try {
    const { rows, capped } = await fetchFindings(supabase, filters);
    result = { status: "ok", rows, capped };
  } catch {
    // Deliberately generic and not logged: errors can carry row content.
    result = { status: "error" };
  }
  return <FindingsView result={result} filters={filters} />;
}
