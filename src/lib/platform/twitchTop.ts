/**
 * Twitch now (game spaces picks 2026-11-09, "Keep watching Twitch", recommended): once a day, at about 7pm Pacific, the
 * cron /api/cron/twitch-top reads Twitch's 200 biggest games and counts the viewers on each one's top 100 live streams
 * (Helix games/top + streams, the app token). The readings go in `twitch_top_readings` (supabase/twitch-top-m1.sql),
 * one per Pacific day, kept 180 days. Platform admin ▸ Overview ▸ Setup ▸ Games on Twitch shows the 30-day averages,
 * matched to our catalog (a catalog entry's `twitch` name first) and our game spaces, so the next wave of spaces is
 * picked from a month of readings. Service role, server only. The averaging is src/lib/platform/twitchTopRules.ts.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { readAllPages } from "@/lib/supabase/pages";
import { gsAddDays, gsDay } from "@/lib/time/gsClock";
import { getAppAccessToken } from "@/lib/twitch/client";
import { GAME_CATALOG, catalogGame, type CatalogEntry } from "@/data/game-catalog";
import { spaceFor, spaceOpen } from "@/lib/games/spaces";
import {
  TWITCH_KEEP_DAYS, TWITCH_TOP_GAMES, TWITCH_WINDOW_DAYS, countStreams, summarizeReadings,
  type TwitchReading, type TwitchTrend,
} from "./twitchTopRules";

const HELIX = "https://api.twitch.tv/helix";
/** Streams requests in flight at once (Twitch allows 800 a minute on an app token; a reading makes about 202). */
const PARALLEL = 8;

/** A game on the card: the trend plus what we have for it. */
export interface TwitchNowGame extends TwitchTrend {
  /** Our game space for it, and whether it's open to everyone. */
  space: { id: string; name: string; open: boolean } | null;
  /** In our game catalog (and its status there: live = we have tools for it). */
  catalog: { slug: string; status: CatalogEntry["status"] } | null;
}

export type TwitchNow =
  | { ready: false }
  | { ready: true; days: number; window: number; latestDay: string | null; takenAt: string | null; games: TwitchNowGame[] };

function missingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? "");
}

async function helix<T>(path: string): Promise<T> {
  const id = process.env.TWITCH_CLIENT_ID;
  if (!id) throw new Error("TWITCH_CLIENT_ID is not set");
  const token = await getAppAccessToken();
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${HELIX}/${path}`, { headers: { "Client-Id": id, Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (res.ok) return (await res.json()) as T;
    // One wait and retry for a rate limit or a Twitch hiccup; anything else is a real failure.
    if (attempt === 0 && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    throw new Error(`Helix ${path.split("?")[0]} failed (${res.status})`);
  }
}

/** Twitch's top games, biggest first. */
async function topGames(limit: number): Promise<{ id: string; name: string }[]> {
  const out: { id: string; name: string }[] = [];
  let after = "";
  while (out.length < limit) {
    const page = await helix<{ data: { id: string; name: string }[]; pagination?: { cursor?: string } }>(
      `games/top?first=100${after ? `&after=${encodeURIComponent(after)}` : ""}`,
    );
    out.push(...page.data);
    if (!page.pagination?.cursor || !page.data.length) break;
    after = page.pagination.cursor;
  }
  return out.slice(0, limit);
}

/**
 * Take today's reading (Pacific day) and store it, replacing one already taken today. A game whose streams can't be
 * read is left out of the reading rather than stored as 0. Old readings past `TWITCH_KEEP_DAYS` are deleted.
 */
export async function takeTwitchReading(): Promise<{ ok: true; day: string; games: number; missed: number } | { ok: false; reason: "not_ready" }> {
  const db = createServiceClient();
  const probe = await db.from("twitch_top_readings").select("day").limit(1);
  if (missingTable(probe.error)) return { ok: false, reason: "not_ready" };
  if (probe.error) throw new Error(probe.error.message);

  const games = await topGames(TWITCH_TOP_GAMES);
  const day = gsDay();
  const takenAt = new Date().toISOString();
  const rows: (TwitchReading & { taken_at: string })[] = [];
  let missed = 0;
  let next = 0;
  async function worker() {
    while (next < games.length) {
      const i = next++;
      const g = games[i];
      try {
        const s = await helix<{ data: { viewer_count: number; language: string }[] }>(`streams?game_id=${encodeURIComponent(g.id)}&first=100`);
        const c = countStreams(s.data ?? []);
        rows.push({ day, game_id: g.id, name: g.name.slice(0, 200), rank: i + 1, viewers: c.viewers, en_viewers: c.en, streams: c.streams, taken_at: takenAt });
      } catch (err) {
        missed += 1;
        console.warn(`[twitch-top] streams for ${g.name} failed:`, err instanceof Error ? err.message : err);
      }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  if (!rows.length) throw new Error("No games could be read from Twitch");

  // Replace today's reading whole, so a game that dropped out since an earlier reading today doesn't linger.
  const del = await db.from("twitch_top_readings").delete().eq("day", day);
  if (del.error) throw new Error(del.error.message);
  const ins = await db.from("twitch_top_readings").insert(rows);
  if (ins.error) throw new Error(ins.error.message);
  await db.from("twitch_top_readings").delete().lt("day", gsAddDays(day, -TWITCH_KEEP_DAYS));

  return { ok: true, day, games: rows.length, missed };
}

/** When the latest reading was taken, or null before the first (or before the table exists). */
export async function lastReadingAt(): Promise<string | null> {
  const { data, error } = await createServiceClient().from("twitch_top_readings").select("taken_at").order("taken_at", { ascending: false }).limit(1);
  if (error) return null;
  return (data?.[0] as { taken_at?: string } | undefined)?.taken_at ?? null;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const BY_TWITCH = new Map<string, CatalogEntry>();
for (const g of GAME_CATALOG) if (g.twitch && !BY_TWITCH.has(norm(g.twitch))) BY_TWITCH.set(norm(g.twitch), g);

/** Our catalog entry for a Twitch category name: an entry's own Twitch name first, then its name and aliases. */
export function catalogForTwitch(name: string): CatalogEntry | null {
  return BY_TWITCH.get(norm(name)) ?? catalogGame(name);
}

/** The card's data: the last 30 days of readings, averaged, matched to our catalog and spaces. */
export async function twitchNow(): Promise<TwitchNow> {
  const db = createServiceClient();
  const today = gsDay();
  const since = gsAddDays(today, -(TWITCH_WINDOW_DAYS - 1));
  const { data, error } = await readAllPages<TwitchReading & { taken_at: string }>((from, to) =>
    db.from("twitch_top_readings")
      .select("day, game_id, name, rank, viewers, en_viewers, streams, taken_at")
      .gte("day", since)
      .order("day", { ascending: true })
      .order("game_id", { ascending: true })
      .range(from, to),
  );
  if (missingTable(error)) return { ready: false };
  if (error) throw new Error(error.message);

  const summary = summarizeReadings(data);
  const takenAt = data.reduce<string | null>((latest, r) => (!latest || r.taken_at > latest ? r.taken_at : latest), null);
  const games: TwitchNowGame[] = summary.games.map((g) => {
    const entry = catalogForTwitch(g.name);
    const space = entry ? spaceFor(entry.slug) : null;
    return {
      ...g,
      space: space ? { id: space.id, name: space.name, open: spaceOpen(space, today) } : null,
      catalog: entry ? { slug: entry.slug, status: entry.status } : null,
    };
  });
  return { ready: true, days: summary.days, window: TWITCH_WINDOW_DAYS, latestDay: summary.latestDay, takenAt, games };
}
