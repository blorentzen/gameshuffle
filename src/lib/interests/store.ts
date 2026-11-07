import "server-only";

/**
 * Interests on the server (src/lib/interests/rules.ts): reading and saving an account's picks, inferring them from
 * what someone does until they pick, and which first steps are done. Every read here is an existence check (head
 * counts with limit 1), so the welcome page stays quick.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { gsDay } from "@/lib/time/gsClock";
import { personaPreview } from "@/lib/preview/server";
import { cleanInterests, INTERESTS, stepsFor, type FirstStep, type Interest, type StepCheck } from "./rules";

export interface InterestState {
  /** null = never asked or answered; [] = they chose none. */
  interests: Interest[] | null;
  source: "picked" | "inferred" | null;
  /** What we'd preselect: their picks, else what their activity suggests. */
  suggested: Interest[];
}

let ready: { at: number; ok: boolean } | null = null;
/** Whether interests-m1.sql has run (kept a minute either way). */
export async function interestsReady(): Promise<boolean> {
  if (ready && Date.now() - ready.at < 60_000) return ready.ok;
  const { error } = await createServiceClient().from("users").select("interests").limit(1);
  ready = { at: Date.now(), ok: !error };
  return ready.ok;
}

type Db = ReturnType<typeof createServiceClient>;
const exists = async (q: PromiseLike<{ count: number | null; error: unknown }>): Promise<boolean> => {
  const { count, error } = await q;
  return !error && (count ?? 0) > 0;
};
const has = (db: Db, table: string, col: string, value: string) =>
  exists(db.from(table).select(col, { count: "exact", head: true }).eq(col, value).limit(1));

/** What someone's activity says they're into, in the tiles' order. `provider` is how they signed up (twitch, discord…). */
export async function inferInterests(userId: string, opts: { provider?: string | null; favoriteGames?: string[] | null } = {}): Promise<Interest[]> {
  const db = createServiceClient();
  const p = `u:${userId}`;
  const [daily, party, triviaNight, lounge, mmr, times, cards, decks, road, twitch, sessions, organized, league] = await Promise.all([
    has(db, "daily_scores", "player", p),
    has(db, "party_nights", "host_user_id", userId),
    has(db, "trivia_games", "host_user_id", userId),
    has(db, "lounge_links", "user_id", userId),
    has(db, "mmr_cards", "user_id", userId),
    has(db, "tt_times", "player", p),
    has(db, "gs_user_cards", "user_id", userId),
    has(db, "tcg_decks", "user_id", userId),
    has(db, "road_best", "player", p),
    has(db, "twitch_connections", "user_id", userId),
    has(db, "gs_sessions", "owner_user_id", userId),
    has(db, "tournaments", "organizer_id", userId),
    has(db, "trivia_leagues", "owner_user_id", userId),
  ]);
  const pokemonGame = (opts.favoriteGames ?? []).some((g) => /pok[eé]mon/i.test(g));
  const on: Record<Interest, boolean> = {
    daily,
    home: party || triviaNight,
    competitive: lounge || mmr || times,
    pokemon: cards || decks || road || pokemonGame,
    stream: twitch || sessions || opts.provider === "twitch",
    events: organized || league,
  };
  return INTERESTS.map((i) => i.id).filter((id) => on[id]);
}

/** An account's interests, and what to preselect when it hasn't picked. A staff persona preview wins (src/lib/preview). */
export async function interestState(userId: string, opts: { provider?: string | null } = {}): Promise<InterestState> {
  const preview = await personaPreview();
  if (preview) return { interests: preview.interests, source: "picked", suggested: preview.interests };
  if (!(await interestsReady())) return { interests: null, source: null, suggested: [] };
  const { data } = await createServiceClient().from("users").select("interests, interests_source, favorite_games").eq("id", userId).maybeSingle();
  const row = (data ?? {}) as { interests?: string[] | null; interests_source?: string | null; favorite_games?: string[] | null };
  const interests = row.interests == null ? null : cleanInterests(row.interests);
  const source = row.interests_source === "picked" || row.interests_source === "inferred" ? row.interests_source : null;
  const suggested = interests !== null && source === "picked" ? interests : await inferInterests(userId, { provider: opts.provider, favoriteGames: row.favorite_games });
  return { interests: source === "picked" ? interests : null, source, suggested };
}

/**
 * The interests that order an account's menus and sidebar: a staff persona preview, else what's stored (picked, or
 * inferred earlier), else inferred once now and stored as inferred, so later pages read one column. Picks always win:
 * an inferred value never replaces a pick, and the welcome page still asks anyone who hasn't picked.
 */
export async function accountInterests(userId: string): Promise<Interest[]> {
  const preview = await personaPreview();
  if (preview) return preview.interests;
  if (!(await interestsReady())) return [];
  const db = createServiceClient();
  const { data } = await db.from("users").select("interests, interests_source, favorite_games").eq("id", userId).maybeSingle();
  const row = (data ?? {}) as { interests?: string[] | null; interests_source?: string | null; favorite_games?: string[] | null };
  if (row.interests != null) return cleanInterests(row.interests);
  const inferred = await inferInterests(userId, { favoriteGames: row.favorite_games });
  await db.from("users").update({ interests: inferred, interests_source: "inferred", interests_at: new Date().toISOString() }).eq("id", userId).is("interests", null);
  return inferred;
}

/** Saves someone's own picks (an empty list is a choice too: they picked none). */
export async function saveInterests(userId: string, raw: unknown): Promise<{ ok: true; interests: Interest[] } | { ok: false; error: "not_ready" | "failed" }> {
  if (!(await interestsReady())) return { ok: false, error: "not_ready" };
  const interests = cleanInterests(raw);
  const { error } = await createServiceClient().from("users").update({ interests, interests_source: "picked", interests_at: new Date().toISOString() }).eq("id", userId);
  return error ? { ok: false, error: "failed" } : { ok: true, interests };
}

/** Which checks are done for this account (only the ones asked for). */
export async function checksDone(userId: string, checks: Set<StepCheck>): Promise<Set<StepCheck>> {
  const db = createServiceClient();
  const p = `u:${userId}`;
  const today = gsDay();
  const ask: Partial<Record<StepCheck, () => Promise<boolean>>> = {
    lounge: () => has(db, "lounge_links", "user_id", userId),
    times: () => has(db, "tt_times", "player", p),
    mmr: () => has(db, "mmr_cards", "user_id", userId),
    daily: () => exists(db.from("daily_scores").select("game", { count: "exact", head: true }).eq("player", p).eq("game", "shuffle").eq("day", today).limit(1)),
    dex: () => exists(db.from("daily_scores").select("game", { count: "exact", head: true }).eq("player", p).eq("game", "dex").eq("day", today).limit(1)),
    games: async () => {
      const { data } = await db.from("users").select("favorite_games").eq("id", userId).maybeSingle();
      return ((data as { favorite_games?: string[] | null } | null)?.favorite_games ?? []).length > 0;
    },
    profile: async () => {
      const { data } = await db.from("users").select("gamertags, avatar_source").eq("id", userId).maybeSingle();
      const u = (data ?? {}) as { gamertags?: Record<string, string> | null; avatar_source?: string | null };
      return Object.values(u.gamertags ?? {}).some((v) => typeof v === "string" && v.trim() !== "") || (!!u.avatar_source && u.avatar_source !== "dicebear");
    },
    road: () => has(db, "road_best", "player", p),
    cards: async () => (await has(db, "gs_user_cards", "user_id", userId)) || has(db, "tcg_decks", "user_id", userId),
    party: () => has(db, "party_nights", "host_user_id", userId),
    trivia: async () => (await has(db, "trivia_games", "host_user_id", userId)) || has(db, "trivia_leagues", "owner_user_id", userId),
    twitch: () => has(db, "twitch_connections", "user_id", userId),
    discord: () => has(db, "discord_guilds", "owner_user_id", userId),
    stream: () => has(db, "gs_sessions", "owner_user_id", userId),
    event: () => has(db, "tournaments", "organizer_id", userId),
  };
  const list = [...checks].filter((c) => c !== "none" && ask[c]);
  const results = await Promise.all(list.map((c) => ask[c]!().catch(() => false)));
  return new Set(list.filter((_, i) => results[i]));
}

export interface StepView extends FirstStep { done: boolean }

/** The first steps for these interests, each with whether it's done. */
export async function firstStepsFor(userId: string, interests: Interest[]): Promise<StepView[]> {
  const steps = stepsFor(interests);
  const done = await checksDone(userId, new Set(steps.map((s) => s.check)));
  return steps.map((s) => ({ ...s, done: done.has(s.check) }));
}
