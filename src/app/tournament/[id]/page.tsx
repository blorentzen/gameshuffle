import { createClient } from "@/lib/supabase/server";
import { getBaseUrl } from "@/lib/env";
import { listTiers } from "@/lib/events/tickets";
import { listMoreFromOrganizer } from "@/lib/events/more";
import { loadTournamentHost, loadTournamentRoster } from "@/lib/tournaments/organizers";
import type { TournamentRace } from "@/lib/tournaments/scoring";
import {
  TournamentPageClient,
  type Participant,
  type Tournament,
  type TournamentHost,
  type TournamentInitial,
  type TournamentResult,
} from "./TournamentPageClient";

const PARTICIPANT_COLS = "id, user_id, display_name, team, status, community_id, joined_at, checked_in_at, waitlisted_at, users(email_verified)";

/**
 * The first paint, read on the server so the title, details, standings and
 * Event structured data are in the HTML (search engines and link previews
 * don't run the page's JavaScript; they used to get a "Loading" card).
 *
 * Same reads as the browser makes, with the viewer's own session, so a draft
 * stays private (RLS). Lobby details are blanked: this HTML goes to anyone,
 * and the browser's read after mount fills them in for those allowed to see
 * them, exactly as before.
 */
async function loadInitial(id: string): Promise<TournamentInitial | null> {
  const supabase = await createClient();
  const [tRes, pRes, rRes, raceRes] = await Promise.all([
    supabase.from("tournaments").select("*").eq("id", id).maybeSingle(),
    supabase.from("tournament_participants").select(PARTICIPANT_COLS).eq("tournament_id", id).order("joined_at"),
    supabase.from("tournament_results").select("participant_id, placement, points").eq("tournament_id", id),
    supabase.from("tournament_races").select("id, race_number, placements").eq("tournament_id", id).order("race_number"),
  ]);
  const row = tRes.data as (Tournament & { community_id?: string | null }) | null;
  if (!row) return null;

  const [community, host, roster, tiers, moreFrom] = await Promise.all([
    row.community_id
      ? supabase.from("gs_communities").select("slug, display_name").eq("id", row.community_id).maybeSingle().then((r) => r.data as { slug: string; display_name: string | null } | null)
      : Promise.resolve(null),
    loadTournamentHost(id).catch(() => null),
    loadTournamentRoster(id).catch(() => []),
    listTiers("tournament", id).catch(() => []),
    listMoreFromOrganizer(row.organizer_id, { type: "tournament", id }).catch(() => []),
  ]);

  return {
    tournament: { ...row, room_code: null, friend_codes: [], community_link: null, community_name: null },
    participants: (pRes.data ?? []) as unknown as Participant[],
    results: (rRes.data ?? []) as TournamentResult[],
    races: (raceRes.data ?? []) as TournamentRace[],
    host: (host as TournamentHost | null) ?? null,
    coHosts: roster.map((o) => ({ userId: o.userId, displayName: o.displayName, username: o.username })),
    presentingCommunity: community,
    moreFrom,
    lowestTicketPrice: tiers.length > 0 ? Math.min(...tiers.map((t) => t.amountCents)) / 100 : null,
  };
}

export default async function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const initial = await loadInitial(id).catch((err) => {
    console.error("[tournament page] server read failed; the browser will load it", err);
    return null;
  });
  return <TournamentPageClient initial={initial} baseUrl={getBaseUrl()} />;
}
