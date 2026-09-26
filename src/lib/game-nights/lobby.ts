import "server-only";

/**
 * A night's lobby details — how you actually get in, once you are going.
 *
 * Every night has a PUBLIC where and a PRIVATE how. In person that is the
 * venue on the map versus the door code and where to park; online it is "this
 * is an online night" versus the actual link. Same split either way, which is
 * why one shape serves both and `location_type` only decides which fields the
 * host is asked for.
 *
 * The gate is the DATABASE, not this module. board_game_night_access is its own
 * table with RLS allowing the host and anyone whose RSVP is "going" — because
 * Postgres RLS gates rows, not columns, so private columns on a publicly
 * readable night would be readable by anyone with the anon key however
 * carefully the UI hid them. Reading with the viewer's client means an
 * unauthorised read returns nothing rather than relying on us to remember.
 */

import { createClient } from "@/lib/supabase/server";

export type NightLocationType = "in_person" | "online" | "tba";

export interface NightAccess {
  joinUrl: string | null;
  roomCode: string | null;
  arrivalNote: string | null;
}

export function hasAnyAccessDetail(a: NightAccess | null): a is NightAccess {
  return !!a && !!(a.joinUrl || a.roomCode || a.arrivalNote);
}

/**
 * Returns null when the viewer is not entitled — which is the RLS policy
 * answering, not a check here. Also null before the migration is applied, so
 * the surface simply does not render rather than erroring.
 */
export async function getNightAccess(nightId: string): Promise<NightAccess | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("board_game_night_access")
      .select("join_url, room_code, arrival_note")
      .eq("night_id", nightId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      joinUrl: (data.join_url as string | null) ?? null,
      roomCode: (data.room_code as string | null) ?? null,
      arrivalNote: (data.arrival_note as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

/** Host-only; the RLS policy enforces that, this just shapes the row. */
export async function saveNightAccess(
  nightId: string,
  a: NightAccess,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const clean = (v: string | null, max: number) => {
    const t = (v ?? "").trim().slice(0, max);
    return t.length ? t : null;
  };
  const { error } = await supabase
    .from("board_game_night_access")
    .upsert({
      night_id: nightId,
      join_url: clean(a.joinUrl, 500),
      room_code: clean(a.roomCode, 60),
      arrival_note: clean(a.arrivalNote, 500),
      updated_at: new Date().toISOString(),
    });
  return error ? { error: error.message } : { ok: true };
}
