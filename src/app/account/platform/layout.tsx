import { Container } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { ModerationNotice } from "@/components/account/ModerationNotice";
import { AccountSidebar } from "@/components/account/AccountSidebar";
import { effectiveTier, normalizeTier } from "@/lib/subscription";
import { previewPro } from "@/lib/preview/server";
import { accountInterests } from "@/lib/interests/store";
import type { Interest } from "@/lib/interests/rules";

/**
 * Platform admin's shell (staff and admins): the account sidebar with its ten views beside the open one. The other
 * /account pages (Studio, Discord servers, Competitive Mario Kart, Pokémon…) sit in the (settings) group and wear the
 * Settings navigation instead (Britton, 2026-11-07).
 *
 * Resolves the operational `role` server-side so the sidebar can decide what to show; the platform page also gates
 * on role, so this is presentation only. Middleware already protects `/account/*` for auth.
 */
export default async function PlatformLayout({
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
  let interests: Interest[] = [];
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
    // A staff persona preview (src/lib/preview) shows the sidebar on the preview's plan.
    isPro = await previewPro(isPro);
    // The sidebar lists the sections for these first (menus and account picks 2026-11-05, 3A).
    interests = await accountInterests(user.id).catch(() => []);
  }

  return (
    <main style={{ paddingTop: "2rem", paddingBottom: "3rem" }}>
      <Container>
        <ModerationNotice />
        <div className="account-layout">
          <AccountSidebar role={role} isPro={isPro} interests={interests} />
          <div className="account-content">{children}</div>
        </div>
      </Container>
    </main>
  );
}
