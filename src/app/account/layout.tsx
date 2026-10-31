import { Container } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { ModerationNotice } from "@/components/account/ModerationNotice";
import { AccountSidebar } from "@/components/account/AccountSidebar";
import { effectiveTier, normalizeTier } from "@/lib/subscription";

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
  let isPro = false;
  if (user) {
    const { data } = await supabase
      .from("users")
      .select("role, subscription_tier, circuit_tier, circuit_status")
      .eq("id", user.id)
      .maybeSingle();
    role = (data?.role as string | null) ?? null;
    // The sidebar shows free accounts only the Streaming items they can use.
    isPro = effectiveTier({
      tier: normalizeTier(data?.subscription_tier as string | null),
      role,
      circuitTier: (data?.circuit_tier as string | null) ?? null,
      circuitStatus: (data?.circuit_status as string | null) ?? null,
    }) === "pro";
  }

  return (
    <main style={{ paddingTop: "2rem", paddingBottom: "3rem" }}>
      <Container>
        <ModerationNotice />
        <div className="account-layout">
          <AccountSidebar role={role} isPro={isPro} />
          <div className="account-content">{children}</div>
        </div>
      </Container>
    </main>
  );
}
