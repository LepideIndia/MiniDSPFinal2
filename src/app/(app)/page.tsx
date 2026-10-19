import { DashboardView, type DashboardResult } from "@/components/DashboardView";
import { fetchAllScans } from "@/lib/data/read";
import { aggregateDashboard } from "@/lib/stats/aggregate";
import { requireUser } from "@/lib/supabase/require-user";

export default async function DashboardPage() {
  const { supabase } = await requireUser();
  let result: DashboardResult;
  try {
    const { rows, capped } = await fetchAllScans(supabase);
    result = { status: "ok", stats: aggregateDashboard(rows), capped };
  } catch {
    // Deliberately generic and not logged: errors can carry row content.
    result = { status: "error" };
  }
  return <DashboardView result={result} />;
}
