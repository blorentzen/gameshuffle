import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { recordOverlayEvent } from "@/lib/overlay/events";
import { sendChatMessage } from "@/lib/twitch/client";
import { listRaces, raceIndex, adjacentRaceKey, type RaceRef, type RaceSource } from "./races";

/** Minimal tournament shape for race operations. */
interface TournamentRow extends RaceSource {
  id: string;
  title: string;
  organizer_id: string;
}

// `select("*")` so a not-yet-migrated column (e.g. `bracket`) doesn't error the
// query; listRaces reads whatever's present and treats absent blobs as empty.
const SELECT = "*";

async function load(admin: ReturnType<typeof createServiceClient>, id: string): Promise<TournamentRow | null> {
  const { data } = await admin.from("tournaments").select(SELECT).eq("id", id).maybeSingle();
  return (data as TournamentRow | null) ?? null;
}

export interface CurrentRaceResult {
  ok: boolean;
  error?: string;
  key: string | null;
  index: number;
  total: number;
  race: RaceRef | null;
  /** Whether the pointer actually changed (false when a step hit an end). */
  moved?: boolean;
}

/** Push the current race to the organizer's OBS overlay + Twitch chat. Both are
 *  best-effort and owner-keyed, so they work with or without a live GS session
 *  (and silently no-op if the organizer isn't a connected streamer). */
async function broadcast(
  admin: ReturnType<typeof createServiceClient>,
  t: TournamentRow,
  race: RaceRef | null,
  index: number,
  total: number,
): Promise<void> {
  // Persistent overlay card (ttlMs null): replaces the prior one and survives an
  // OBS reload; `cleared` tells the overlay to show nothing.
  await recordOverlayEvent({
    ownerUserId: t.organizer_id,
    type: "tournament_race",
    payload: {
      tournamentId: t.id,
      tournamentTitle: t.title,
      label: race?.label ?? null,
      name: race?.sublabel ?? null,
      img: race?.img ?? null,
      index,
      total,
      cleared: race == null,
    },
    ttlMs: null,
  });

  if (!race) return; // clearing → no chat spam.

  const { data: conn } = await admin
    .from("twitch_connections")
    .select("twitch_user_id")
    .eq("user_id", t.organizer_id)
    .maybeSingle();
  const botId = process.env.TWITCH_BOT_USER_ID;
  if (conn?.twitch_user_id && botId) {
    const what = race.sublabel ? `${race.label}: ${race.sublabel}` : race.label;
    await sendChatMessage({
      broadcasterId: conn.twitch_user_id as string,
      senderId: botId,
      message: `🏁 Now up: ${what} (${index + 1}/${total}) · ${t.title}`,
    });
  }
}

/** Set the current race to an explicit key (or null to clear), persist it, and
 *  broadcast. */
export async function setTournamentCurrentRace(opts: {
  tournamentId: string;
  key: string | null;
  broadcast?: boolean;
}): Promise<CurrentRaceResult> {
  const admin = createServiceClient();
  const t = await load(admin, opts.tournamentId);
  if (!t) return { ok: false, error: "not_found", key: null, index: -1, total: 0, race: null };

  const races = listRaces(t);
  const index = raceIndex(races, opts.key);
  const key = opts.key != null && index >= 0 ? opts.key : null;

  const settings = { ...(t.settings ?? {}), currentRaceKey: key };
  const { error } = await admin.from("tournaments").update({ settings }).eq("id", opts.tournamentId);
  if (error) return { ok: false, error: error.message, key: null, index: -1, total: races.length, race: null };

  const race = key != null ? races[index] : null;
  if (opts.broadcast !== false) await broadcast(admin, t, race, index, races.length);
  return { ok: true, key, index: key != null ? index : -1, total: races.length, race, moved: true };
}

/** Move the pointer one step (+1 next / -1 prev); no-op past the ends. */
export async function stepTournamentCurrentRace(opts: {
  tournamentId: string;
  dir: 1 | -1;
}): Promise<CurrentRaceResult> {
  const admin = createServiceClient();
  const t = await load(admin, opts.tournamentId);
  if (!t) return { ok: false, error: "not_found", key: null, index: -1, total: 0, race: null };
  const races = listRaces(t);
  const nextKey = adjacentRaceKey(races, t.settings?.currentRaceKey ?? null, opts.dir);
  if (nextKey == null) {
    // Already at the end/start — report current without change.
    const idx = raceIndex(races, t.settings?.currentRaceKey ?? null);
    return { ok: true, key: t.settings?.currentRaceKey ?? null, index: idx, total: races.length, race: idx >= 0 ? races[idx] : null, moved: false };
  }
  return setTournamentCurrentRace({ tournamentId: opts.tournamentId, key: nextKey });
}

/** The organizer's currently-running tournament (status in_progress), most
 *  imminent first. Used by /live and the `!gs-race` chat command to know which
 *  tournament "next race" applies to when none is named. */
export async function getLiveTournamentForOrganizer(ownerUserId: string): Promise<TournamentRow | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("tournaments")
    .select(SELECT)
    .eq("organizer_id", ownerUserId)
    .eq("status", "in_progress")
    .order("date_time", { ascending: true, nullsFirst: false })
    .limit(1);
  return ((data?.[0] as TournamentRow | undefined) ?? null) as TournamentRow | null;
}
