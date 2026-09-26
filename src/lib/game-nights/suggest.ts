import "server-only";

/**
 * "Who fits this night" — suggest players whose PUBLIC board-game preferences
 * match a night's genres/level, so a host can invite the right people. Reads
 * only public profiles that opted into board games (the same prefs already shown
 * on /u), excludes the host and anyone who already RSVP'd, and scores with the
 * shared pure matcher. Host-facing: call it from the night's manage page.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { getNight } from "./store";
import { matchScore, type ViewerPrefs } from "./match";

export interface SuggestedPlayer {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  level: string | null;
  sharedGenres: string[];
  score: number;
}

interface PlayerRow {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  board_game_genres: string[] | null;
  board_game_level: string | null;
}

export async function suggestPlayersForNight(nightId: string, limit = 8): Promise<SuggestedPlayer[]> {
  const night = await getNight(nightId);
  if (!night) return [];
  const nightGenres = night.genres ?? [];
  // Nothing to match on if the host set neither genres nor a level.
  if (nightGenres.length === 0 && !night.level) return [];

  const admin = createServiceClient();

  // People already in (host + any RSVP) don't need suggesting.
  const { data: rsvps } = await admin
    .from("board_game_night_rsvps")
    .select("user_id")
    .eq("night_id", nightId);
  const exclude = new Set<string>([night.host_id, ...((rsvps ?? []) as { user_id: string }[]).map((r) => r.user_id)]);

  // Bounded scan of public players who opted into board games. Fine for the
  // current base; a growing directory would push scoring into the query.
  const { data: players } = await admin
    .from("users")
    .select("id, display_name, username, avatar_url, board_game_genres, board_game_level")
    .eq("plays_board_games", true)
    .eq("is_public", true)
    .limit(300);

  const scored: SuggestedPlayer[] = [];
  for (const p of (players ?? []) as PlayerRow[]) {
    if (exclude.has(p.id) || !p.username) continue;
    const prefs: ViewerPrefs = {
      genres: p.board_game_genres ?? [],
      level: p.board_game_level ?? null,
      lengths: [],
    };
    const score = matchScore(prefs, { genres: nightGenres, level: night.level, gameLengths: [] });
    if (score <= 0) continue;
    const shared = (p.board_game_genres ?? []).filter((g) =>
      nightGenres.some((ng) => ng.toLowerCase().trim() === g.toLowerCase().trim()),
    );
    scored.push({
      userId: p.id,
      displayName: p.display_name || p.username,
      username: p.username,
      avatarUrl: p.avatar_url,
      level: p.board_game_level,
      sharedGenres: shared,
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName));
  return scored.slice(0, limit);
}
