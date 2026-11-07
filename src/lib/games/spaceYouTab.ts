import "server-only";

/**
 * A game space's You tab (journeys picks 2026-11-06, step 6, all A): what's yours in that game. Everything a game
 * doesn't have stays empty: the time trials for Mario Kart, the season for Mario Party and Smash, the dailies, trainer
 * card and cards for Pokémon. Read for the signed-in viewer only.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import type { GameSpace } from "./spaces";
import { playerBests } from "@/lib/timeTrials/store";
import { ttTrack, trackPath } from "@/lib/timeTrials/tracks";
import { formatTime, ttPlayer } from "@/lib/timeTrials/rules";
import { streakOf, weekCheckins } from "@/lib/spaces/challenges";
import { spaceSeason } from "./spaceData";
import { dailiesView } from "@/lib/daily/dailies";
import { roadProgressView } from "@/lib/originals/duel/roadProgress";
import type { RoadProgressView } from "@/lib/originals/duel/roadView";
import type { DailiesStats } from "@/lib/originals/dailies";

export interface YouTime { key: string; track: string; image: string | null; time: string; place: number; total: number; href: string }
export interface YouSetup { id: string; title: string; line: string; img: string | null; href: string }

export interface SpaceYouTab {
  streak: number;
  week: { days: string[]; done: string[]; today: string };
  times: YouTime[];
  timesCount: number;
  setups: YouSetup[];
  season: { place: number; points: number; of: number; month: string } | null;
  dailies: { dex: DailiesStats | null; duel: DailiesStats | null } | null;
  road: RoadProgressView | null;
  cards: { cards: number; decks: number } | null;
}

type ConfigRow = { id: string; randomizer_slug: string; config_name: string | null; config_data: { type?: string; character?: { name?: string; img?: string }; vehicle?: { name?: string }; wheels?: { name?: string }; glider?: { name?: string } } | null };

function setupOf(r: ConfigRow): YouSetup {
  const d = r.config_data ?? {};
  if (d.type === "kart-build" && d.character?.name) {
    return {
      id: r.id, title: d.character.name, line: [d.vehicle?.name, d.wheels?.name, d.glider?.name].filter(Boolean).join(" · "),
      img: d.character.img ?? null, href: `/randomizers/${r.randomizer_slug}?config=${r.id}`,
    };
  }
  return { id: r.id, title: r.config_name || "Saved setup", line: (d.type ?? "setup").replace(/-/g, " "), img: null, href: `/randomizers/${r.randomizer_slug}?config=${r.id}` };
}

export async function spaceYouTab(s: GameSpace, userId: string): Promise<SpaceYouTab> {
  const db = createServiceClient();
  const pokemon = s.id === "pokemon";
  const [streak, week, bests, configs, season, dailies, road, cards] = await Promise.all([
    streakOf(userId, s.id).catch(() => 0),
    weekCheckins(userId, s.id).catch(() => ({ days: [], done: [], today: "" })),
    s.tt ? playerBests(ttPlayer("u", userId)).catch(() => []) : Promise.resolve([]),
    db.from("saved_configs").select("id, randomizer_slug, config_name, config_data").eq("user_id", userId).in("randomizer_slug", s.games).order("created_at", { ascending: false }).limit(6)
      .then((r) => (r.data ?? []) as ConfigRow[], () => [] as ConfigRow[]),
    !s.tt && !pokemon ? spaceSeason(s, userId, 500).catch(() => null) : Promise.resolve(null),
    pokemon ? dailiesView({ userId }, { fire: false }).catch(() => null) : Promise.resolve(null),
    pokemon ? roadProgressView(userId).catch(() => null) : Promise.resolve(null),
    pokemon ? Promise.all([
      db.from("gs_user_cards").select("id", { count: "exact", head: true }).eq("user_id", userId).then((r) => r.count ?? 0),
      db.from("tcg_decks").select("id", { count: "exact", head: true }).eq("user_id", userId).then((r) => r.count ?? 0),
    ]).then(([c, d]) => ({ cards: c, decks: d })).catch(() => ({ cards: 0, decks: 0 })) : Promise.resolve(null),
  ]);
  const mine = bests.filter((b) => b.game === s.tt && b.vehicle === "any").sort((a, b) => a.place / a.total - b.place / b.total);
  const times = mine.slice(0, 4).flatMap((b) => {
    const t = ttTrack(b.game, b.track);
    return t ? [{ key: `${b.track}-${b.cc}-${b.items}`, track: t.name, image: t.image, time: formatTime(b.timeMs), place: b.place, total: b.total, href: trackPath(t, b.cc, { items: b.items }) }] : [];
  });
  const meIndex = season ? season.rows.findIndex((r) => r.you) : -1;
  return {
    streak, week, times, timesCount: mine.length,
    // Mario Kart's tile is Your builds: kart builds only (rulesets and track lists aren't builds).
    setups: configs.filter((c) => !s.tt || c.config_data?.type === "kart-build").map(setupOf).slice(0, 4),
    season: season && meIndex >= 0 ? { place: meIndex + 1, points: season.rows[meIndex].points, of: season.rows.length, month: season.month } : null,
    dailies: dailies ? { dex: dailies.dex?.stats ?? null, duel: dailies.duel?.stats ?? null } : null,
    road, cards,
  };
}
