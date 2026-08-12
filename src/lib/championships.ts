/**
 * Championship Series (leagues) — a season of Heat → Mains events whose points
 * accumulate into a season table. Backed by `championships`, `championship_members`,
 * `championship_invitations`, and per-event `tournaments` (format `heat_mains`,
 * linked by `championship_id`). See supabase/championship-m1.sql.
 *
 * DB helpers take a Supabase client so they work from the browser (RLS: owner)
 * or the server (service role for invite-accept). `computeSeason` is pure.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { heatMainsStage, type HeatMains } from "@/lib/tournaments/heatMains";
import { computeEventPoints, accumulateSeason, type PointsConfig, type SeasonRow } from "@/lib/tournaments/championship";

export interface Championship {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  game_slug: string;
  points_config: PointsConfig | null;
  settings: { series?: number; heatSize?: number | "auto"; dropWorst?: number; mode?: string; items?: string; pointsPreset?: string };
  status: string;
  share_token: string | null;
  created_at: string;
}

export interface ChampionshipMember {
  id: string;
  championship_id: string;
  user_id: string;
  status: "invited" | "joined" | "removed";
  invited_at: string;
  joined_at: string | null;
  display_name: string;
  username: string | null;
}

export interface ChampionshipEvent {
  id: string;
  title: string;
  status: string;
  event_number: number | null;
  heat_mains: HeatMains | null;
}

/**
 * Season standings from a set of events. Only COMPLETE events count. Points are
 * computed per event on participant ids, remapped to user ids (so a driver's
 * points follow their account across events), then accumulated. `dropWorst`
 * discards each member's N lowest events before summing.
 */
export function computeSeason(
  events: { heat_mains: HeatMains | null; participants: { id: string; user_id: string | null }[] }[],
  cfg?: PointsConfig,
  dropWorst = 0,
): SeasonRow[] {
  const eventMaps: Record<string, number>[] = [];
  for (const ev of events) {
    if (!ev.heat_mains || heatMainsStage(ev.heat_mains) !== "complete") continue;
    const pts = computeEventPoints(ev.heat_mains, cfg);
    const partToUser = new Map(ev.participants.map((p) => [p.id, p.user_id]));
    const m: Record<string, number> = {};
    for (const row of pts) {
      const uid = partToUser.get(row.participantId);
      if (uid) m[uid] = row.total;
    }
    eventMaps.push(m);
  }
  return accumulateSeason(eventMaps, dropWorst);
}

/** Joined roster with display info (public read). */
export async function listMembers(supabase: SupabaseClient, championshipId: string): Promise<ChampionshipMember[]> {
  const { data } = await supabase
    .from("championship_members")
    .select("id, championship_id, user_id, status, invited_at, joined_at, users(display_name, username)")
    .eq("championship_id", championshipId)
    .neq("status", "removed")
    .order("joined_at", { nullsFirst: false });
  return (data ?? []).map((m) => {
    const u = (m as { users?: { display_name?: string; username?: string } | null }).users;
    return {
      id: m.id as string,
      championship_id: m.championship_id as string,
      user_id: m.user_id as string,
      status: m.status as ChampionshipMember["status"],
      invited_at: m.invited_at as string,
      joined_at: (m.joined_at as string | null) ?? null,
      display_name: u?.display_name || u?.username || "Player",
      username: u?.username ?? null,
    };
  });
}

/**
 * Create the next event: a `heat_mains` tournament linked to the championship,
 * seeded with the joined members as participants. Returns the new tournament id.
 */
export async function createNextEvent(
  supabase: SupabaseClient,
  championship: Championship,
  members: ChampionshipMember[],
  shareToken: string,
): Promise<string | null> {
  const joined = members.filter((m) => m.status === "joined");
  const { data: existing } = await supabase
    .from("tournaments")
    .select("event_number")
    .eq("championship_id", championship.id)
    .order("event_number", { ascending: false })
    .limit(1);
  const eventNumber = ((existing?.[0]?.event_number as number | null) ?? 0) + 1;

  const { data, error } = await supabase
    .from("tournaments")
    .insert({
      organizer_id: championship.owner_id,
      championship_id: championship.id,
      event_number: eventNumber,
      title: `${championship.name}: Event ${eventNumber}`,
      game_slug: championship.game_slug,
      format: "heat_mains",
      mode: championship.settings.mode || "ffa",
      acceptance_mode: "auto",
      status: "in_progress",
      share_token: shareToken,
      settings: { raceCount: 4, items: championship.settings.items || "normal" },
    })
    .select("id")
    .single();
  if (error || !data) return null;
  const tournamentId = data.id as string;

  if (joined.length) {
    await supabase.from("tournament_participants").insert(
      joined.map((m) => ({
        tournament_id: tournamentId,
        user_id: m.user_id,
        display_name: m.display_name,
        status: "confirmed",
      })),
    );
  }
  return tournamentId;
}
