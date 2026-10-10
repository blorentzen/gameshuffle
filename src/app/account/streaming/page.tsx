import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { effectiveTier, normalizeTier } from "@/lib/subscription";
import { StreamingTabs } from "@/components/account/streaming/StreamingTabs";

/**
 * Streaming section page (/account/streaming): Stream Setup and Community &
 * Chat in one place. Resolves GS Pro server-side (free accounts get Get
 * started and the Discord bot) and the profile timezone the schedule uses.
 * The shared shell and sidebar live in src/app/account/layout.tsx.
 */
export default async function StreamingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/account/streaming");

  const { data } = await supabase
    .from("users")
    .select("role, subscription_tier, circuit_tier, circuit_status, timezone")
    .eq("id", user.id)
    .maybeSingle();
  const isPro = effectiveTier({
    tier: normalizeTier(data?.subscription_tier as string | null),
    role: (data?.role as string | null) ?? null,
    circuitTier: (data?.circuit_tier as string | null) ?? null,
    circuitStatus: (data?.circuit_status as string | null) ?? null,
  }) === "pro";

  return <StreamingTabs isPro={isPro} profileTimezone={(data?.timezone as string | null) ?? null} />;
}
