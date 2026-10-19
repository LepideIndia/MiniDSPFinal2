import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Server-side gate for every signed-in page: verifies the user with getUser() and redirects otherwise. */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  return { supabase, user };
}
