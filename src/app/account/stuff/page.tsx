import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  effectiveTier,
  hasCapability,
  normalizeTier,
} from "@/lib/subscription";
import { StuffTabs } from "@/components/account/StuffTabs";

/**
 * "My Stuff" section page — a player's personal content: Setups & Games,
 * Tournaments, and My Cards (the collection). Middleware already protects
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
    .select("subscription_tier, role")
    .eq("id", user.id)
    .maybeSingle();
  const capUser = {
    tier: normalizeTier(profile?.subscription_tier as string | null),
    role: (profile?.role as string | null) ?? null,
  };
  effectiveTier(capUser); // upgrades staff/admin for the capability check
  const isPro = hasCapability(capUser, "companion.collection");

  return <StuffTabs isPro={isPro} />;
}
