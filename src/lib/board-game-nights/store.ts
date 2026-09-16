import "server-only";

import { createClient } from "@/lib/supabase/server";
import { geocodePlace } from "./geocode";
import type {
  BoardGameNight,
  NightGame,
  RsvpStatus,
} from "./types";

/**
 * Board-game-night store (server-only). RLS enforces host ownership, so these
 * run under the authed server client — a host can only write their own nights;
 * public/unlisted nights read for anyone (drafts stay host-only).
 */

export interface NightInput {
  title: string;
  description?: string | null;
  place?: string | null;
  /** Coords from Places autocomplete. When present we trust them and skip the
   *  server geocode; when a place is set without coords we geocode server-side. */
  lat?: number | null;
  lng?: number | null;
  starts_at?: string | null;
  timezone?: string | null;
  capacity?: number | null;
  visibility?: "public" | "unlisted";
  genres?: string[] | null;
  level?: string | null;
  games?: NightGame[];
  status?: "draft" | "scheduled";
  series_id?: string | null;
  community_id?: string | null;
}

export async function createNight(
  input: NightInput,
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in to host a night." };

  const place = input.place?.trim().slice(0, 200) || null;
  // Trust client-provided (autocomplete) coords; otherwise geocode the text.
  const coords =
    place && Number.isFinite(input.lat) && Number.isFinite(input.lng)
      ? { lat: input.lat as number, lng: input.lng as number }
      : await geocodePlace(place);

  const { data, error } = await supabase
    .from("board_game_nights")
    .insert({
      host_id: user.id,
      title: input.title.trim().slice(0, 120),
      description: input.description?.trim().slice(0, 2000) || null,
      place,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      starts_at: input.starts_at ?? null,
      timezone: input.timezone ?? null,
      capacity: input.capacity ?? null,
      visibility: input.visibility ?? "public",
      genres: input.genres?.length ? input.genres.slice(0, 20) : null,
      level: input.level || null,
      games: input.games ?? [],
      status: input.status ?? "scheduled",
      ...(input.series_id ? { series_id: input.series_id } : {}),
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { id: data.id as string };
}

export async function updateNight(
  id: string,
  input: Partial<NightInput>,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) patch.title = input.title.trim().slice(0, 120);
  if (input.description !== undefined)
    patch.description = input.description?.trim().slice(0, 2000) || null;
  if (input.place !== undefined) {
    const place = input.place?.trim().slice(0, 200) || null;
    patch.place = place;
    // Prefer client-provided (autocomplete) coords; otherwise re-geocode so the
    // map pin stays in sync when the venue text changes.
    const coords =
      place && Number.isFinite(input.lat) && Number.isFinite(input.lng)
        ? { lat: input.lat as number, lng: input.lng as number }
        : await geocodePlace(place);
    patch.lat = coords?.lat ?? null;
    patch.lng = coords?.lng ?? null;
  }
  if (input.starts_at !== undefined) patch.starts_at = input.starts_at;
  if (input.timezone !== undefined) patch.timezone = input.timezone;
  if (input.capacity !== undefined) patch.capacity = input.capacity;
  if (input.visibility !== undefined) patch.visibility = input.visibility;
  if (input.genres !== undefined)
    patch.genres = input.genres?.length ? input.genres.slice(0, 20) : null;
  if (input.level !== undefined) patch.level = input.level || null;
  if (input.games !== undefined) patch.games = input.games;
  if (input.status !== undefined) patch.status = input.status;
  if (input.community_id !== undefined) patch.community_id = input.community_id;

  const { error } = await supabase.from("board_game_nights").update(patch).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function getNight(id: string): Promise<BoardGameNight | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("board_game_nights")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as BoardGameNight | null) ?? null;
}

export async function listNightsForHost(hostId: string): Promise<BoardGameNight[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("board_game_nights")
    .select("*")
    .eq("host_id", hostId)
    .order("starts_at", { ascending: true, nullsFirst: false });
  return (data as BoardGameNight[] | null) ?? [];
}

/**
 * Nights the user has RSVP'd to (going/maybe) but doesn't host. Guarded: if the
 * rsvp table isn't reachable we return []. Excludes nights they host (those come
 * from listNightsForHost) so the two lists don't double up.
 */
export async function listNightsAttending(userId: string): Promise<BoardGameNight[]> {
  const supabase = await createClient();
  const { data: rsvps, error } = await supabase
    .from("board_game_night_rsvps")
    .select("night_id, status")
    .eq("user_id", userId)
    .in("status", ["going", "maybe"]);
  if (error || !rsvps || rsvps.length === 0) return [];
  const ids = (rsvps as { night_id: string }[]).map((r) => r.night_id);
  const { data } = await supabase
    .from("board_game_nights")
    .select("*")
    .in("id", ids)
    .neq("host_id", userId)
    .order("starts_at", { ascending: true, nullsFirst: false });
  return (data as BoardGameNight[] | null) ?? [];
}

export async function listPublicNights(limit = 50): Promise<BoardGameNight[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("board_game_nights")
    .select("*")
    .eq("visibility", "public")
    .eq("status", "scheduled")
    .order("starts_at", { ascending: true, nullsFirst: false })
    .limit(limit);
  return (data as BoardGameNight[] | null) ?? [];
}

/**
 * Upcoming public nights posted to a community. Guarded: if the `community_id`
 * column isn't applied yet the query errors and we return [] (the community
 * page just omits the game-nights section).
 */
export async function listNightsForCommunity(communityId: string, limit = 12): Promise<BoardGameNight[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("board_game_nights")
    .select("*")
    .eq("community_id", communityId)
    .eq("visibility", "public")
    .eq("status", "scheduled")
    .order("starts_at", { ascending: true, nullsFirst: false })
    .limit(limit);
  if (error) return [];
  return (data as BoardGameNight[] | null) ?? [];
}

export async function deleteNight(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("board_game_nights").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ── RSVPs ────────────────────────────────────────────────────────────────
export async function setRsvp(
  nightId: string,
  status: RsvpStatus,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in to RSVP." };
  const { error } = await supabase
    .from("board_game_night_rsvps")
    .upsert({ night_id: nightId, user_id: user.id, status });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function getRsvps(
  nightId: string,
): Promise<{ user_id: string; status: RsvpStatus }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("board_game_night_rsvps")
    .select("user_id, status")
    .eq("night_id", nightId);
  return (data as { user_id: string; status: RsvpStatus }[] | null) ?? [];
}
