import AppNav from "@/components/AppNav";
import { requireUser } from "@/lib/supabase/require-user";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="app-header">
        <AppNav email={user.email ?? "Signed in"} />
      </header>
      <main id="main" className="app-main">
        {children}
      </main>
    </>
  );
}
