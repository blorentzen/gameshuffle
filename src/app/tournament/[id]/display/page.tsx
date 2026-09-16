import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createServiceClient } from "@/lib/supabase/admin";
import { tournamentHasFeature } from "@/lib/tournaments/circuit-resolve";
import { getOwnerThemeVars } from "@/lib/theme/owner-theme";
import { TournamentDisplay } from "@/components/tournament/TournamentDisplay";

export const metadata: Metadata = { title: "Tournament display", robots: { index: false, follow: false } };

/**
 * Chrome-free big-screen display for a tournament — the current race ("Now
 * racing", including randomized rounds) + live standings, for projecting at the
 * venue or as an OBS source. Live updates are Circuit-gated (real-time = paid);
 * free tournaments show the current snapshot.
 */
export default async function TournamentDisplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createServiceClient();
  const { data: t } = await admin
    .from("tournaments")
    .select("id, organizer_id, game_slug, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!t) notFound();
  const row = t as { id: string; organizer_id: string; game_slug: string; created_at: string };

  const live = await tournamentHasFeature(admin, row, "randomizer").catch(() => false);
  const ownerTheme = await getOwnerThemeVars(row.organizer_id).catch(() => ({}));

  return (
    <div style={ownerTheme}>
      <TournamentDisplay tournamentId={id} live={live} />
    </div>
  );
}
