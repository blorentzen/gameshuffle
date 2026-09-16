import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getNight, getRsvps } from "@/lib/board-game-nights/store";
import { getOwnerThemeVars } from "@/lib/theme/owner-theme";
import { LiveNightBoard, type NightDisplayData } from "@/components/board-game-nights/LiveNightBoard";
import { type LiveAttendee } from "@/components/board-game-nights/LiveNightAttendees";
import { effectiveTier, type SubscriptionTier } from "@/lib/subscription";

export const metadata: Metadata = { title: "Game night display", robots: { index: false, follow: false } };

/**
 * In-person display mode — a chrome-free, big-screen live board of a night to
 * project at the venue (chrome suppressed via ConditionalChrome). Server-seeds
 * the board, then LiveNightBoard keeps it in sync for paid (GS Pro) hosts.
 */
export default async function NightDisplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const night = await getNight(id);
  if (!night) notFound();

  const supabase = await createClient();
  const rsvps = await getRsvps(id);
  const going = rsvps.filter((r) => r.status === "going");

  const { data: host } = await supabase
    .from("users")
    .select("subscription_tier, role, circuit_tier, circuit_status")
    .eq("id", night.host_id)
    .maybeSingle();
  const liveEnabled = effectiveTier({
    tier: (host?.subscription_tier as SubscriptionTier | null) ?? "free",
    role: (host?.role as string | null) ?? null,
    circuitTier: (host?.circuit_tier as string | null) ?? null,
    circuitStatus: (host?.circuit_status as string | null) ?? null,
  }) === "pro";

  const attendeeIds = going.map((r) => r.user_id).slice(0, 40);
  const { data: attendees } = attendeeIds.length
    ? await supabase.from("users").select("id, username, display_name, avatar_source, avatar_seed, avatar_options, discord_avatar, twitch_avatar").in("id", attendeeIds)
    : { data: [] as LiveAttendee[] };

  const ownerTheme = await getOwnerThemeVars(night.host_id).catch(() => ({}));
  const initial: NightDisplayData = {
    title: night.title,
    starts_at: night.starts_at,
    timezone: night.timezone,
    place: night.place,
    genres: night.genres,
    level: night.level,
    cover_image_url: night.cover_image_url,
    games: night.games,
  };

  return (
    <div style={ownerTheme}>
      <LiveNightBoard
        nightId={night.id}
        initial={initial}
        initialAttendees={(attendees ?? []) as LiveAttendee[]}
        initialCount={going.length}
        live={liveEnabled}
      />
    </div>
  );
}
