import { Container } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { ModerationNotice } from "@/components/account/ModerationNotice";
import { AccountSidebar } from "@/components/account/AccountSidebar";

/**
 * Shared shell for the /account section pages (Account · Streamer · Platform
 * Admin). Owns the CDS Container, the ModerationNotice, and the two-column
 * layout + sticky sidebar — so the sidebar persists as you move between
 * section routes. Each section page renders its tab content into `{children}`
 * (the right column).
 *
 * Resolves the operational `role` server-side so the sidebar can decide
 * whether to surface the Platform Admin group; the platform page also gates
 * on role, so this is presentation only. Middleware already protects
 * `/account/*` for auth.
 */
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role: string | null = null;
  if (user) {
    const { data } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    role = (data?.role as string | null) ?? null;
  }

  return (
    <main style={{ paddingTop: "2rem", paddingBottom: "3rem" }}>
      <Container>
        <ModerationNotice />
        <div className="account-layout">
          <AccountSidebar role={role} />
          <div className="account-content">{children}</div>
        </div>
      </Container>
    </main>
  );
}
