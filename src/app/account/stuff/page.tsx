import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  effectiveTier,
  hasCapability,
  normalizeTier,
} from "@/lib/subscription";
import { StuffTabs } from "@/components/account/StuffTabs";
import { createServiceClient } from "@/lib/supabase/admin";
import { getPlatformFlag } from "@/lib/platform/flags";

/** Payouts shows once paid entry is on, or for an organizer who already has a payout account. */
async function showPayoutsFor(userId: string): Promise<boolean> {
  if (await getPlatformFlag("paid_tickets_enabled")) return true;
  const { count, error } = await createServiceClient().from("gs_connect_accounts").select("user_id", { count: "exact", head: true }).eq("user_id", userId);
  return !error && (count ?? 0) > 0;
}

/**
 * "My Stuff" section page: Events, Purchases, Saved configs and My Collection. Middleware already protects
 * `/account/*` for auth; we resolve `companion.collection` (currently a free
 * capability) so the My Cards tab shows the right add/upgrade state. The
 * shared shell + sidebar live in `src/app/account/layout.tsx`.
 */
export default async function MyStuffPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/account/stuff");

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_tier, role, circuit_tier, circuit_status, timezone")
    .eq("id", user.id)
    .maybeSingle();
  const capUser = {
    tier: normalizeTier(profile?.subscription_tier as string | null),
    role: (profile?.role as string | null) ?? null,
    circuitTier: (profile?.circuit_tier as string | null) ?? null,
    circuitStatus: (profile?.circuit_status as string | null) ?? null,
  };
  const canCollect = hasCapability(capUser, "companion.collection");
  // Real GS Pro: no My Cards cap (free accounts hold MY_CARDS_FREE_LIMIT different cards).
  const isPro = effectiveTier(capUser) === "pro";

  return <StuffTabs isPro={canCollect} unlimitedCards={isPro} showPayouts={await showPayoutsFor(user.id)} timeZone={(profile?.timezone as string | null) ?? null} />;
}
