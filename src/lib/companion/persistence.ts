"use server";

/**
 * Companion game-end persistence — Wave 3.
 *
 * One row per completed game per authenticated user. Guests don't
 * write anything (v1 Scope §10: "Anonymous 'guest' mode available
 * but limited (no persistence beyond the current session)"). The
 * client gates this by not calling the action when in guest mode;
 * the server gates with auth.uid() check + RLS on the table.
 *
 * Schema: see `supabase/companion-sessions-m1.sql`.
 */

import { createClient } from "@/lib/supabase/server";

export interface SaveGameResultInput {
  mode: string;
  player1Label: string;
  player2Label: string;
  /** "player_1" | "player_2" | null. The server stores this
   *  verbatim; the check constraint on the table rejects garbage. */
  winner: "player_1" | "player_2" | null;
  /** ISO timestamp from the client. Used as `started_at`. The server
   *  sets `ended_at` to `now()` for trust. */
  startedAt: string;
}

export interface SaveGameResultResult {
  ok: boolean;
  reason?: string;
  id?: string;
}

export async function saveCompanionGameResult(
  input: SaveGameResultInput,
): Promise<SaveGameResultResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, reason: "not_authenticated" };
  }

  // Light validation — the bulk of correctness lives in the table
  // constraints + RLS. We only enforce field shape to bounce obvious
  // mistakes (e.g. an unsupported mode) before the round-trip.
  if (!input.mode || input.mode.length > 32) {
    return { ok: false, reason: "invalid_mode" };
  }
  if (
    input.winner != null &&
    input.winner !== "player_1" &&
    input.winner !== "player_2"
  ) {
    return { ok: false, reason: "invalid_winner" };
  }

  const startedAt = parseIsoOrNow(input.startedAt);

  const { data, error } = await supabase
    .from("companion_sessions")
    .insert({
      account_id: user.id,
      mode: input.mode,
      player_1_label: input.player1Label.slice(0, 80),
      player_2_label: input.player2Label.slice(0, 80),
      winner: input.winner,
      started_at: startedAt,
      // ended_at defaults to now() — trust the server clock for the
      // upper bound of the duration.
    })
    .select("id")
    .single();

  if (error) {
    // Surface RLS / table-missing errors as a one-string reason. The
    // table being absent (migration not applied) is the most likely
    // production failure mode here; the client logs it but doesn't
    // block the post-game flow.
    return { ok: false, reason: error.message };
  }

  return { ok: true, id: data.id as string };
}

function parseIsoOrNow(value: string | undefined | null): string {
  if (!value) return new Date().toISOString();
  const t = Date.parse(value);
  if (Number.isNaN(t)) return new Date().toISOString();
  return new Date(t).toISOString();
}
