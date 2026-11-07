import "server-only";

/**
 * The profile as the room's front window (bring-along picks 5A to 8A, 2026-11-05): the ways a visitor can join
 * this player right now ("Play with Kai": beat their Daily today, their next public event, their live page). What
 * they're proud of is their Highlights (src/lib/profile/highlights.ts). Public things only: a daily they finished today
 * (the result, never the answer, and not when they hid themselves from the boards), published events, a live stream.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { gsDay } from "@/lib/time/gsClock";
import { DAILIES, type DailiesEntries, type DailyGameId } from "@/lib/originals/dailies";
import { gameArt, when, TESTY, type Happening } from "@/lib/home/happening";
import { getGameName } from "@/data/game-registry";
import { isStaleOpen, isStuckLive } from "@/lib/events/lifecycle";
import { isHidden } from "@/lib/daily/boards";
import type { TournamentLite } from "./enrichment";

const DAY_MS = 86_400_000;
const SOON_MS = 14 * DAY_MS;
const GAMES: DailyGameId[] = ["shuffle", "dex", "fire", "duel"];
const label = (g: DailyGameId) => (g === "fire" ? "Fire Round" : g === "duel" ? "Daily Duel" : DAILIES[g].tab);

/** Their best result today, as a card to beat. */
function dailyCard(name: string, dailies: DailiesEntries): Happening | null {
  const today = gsDay();
  for (const g of GAMES) {
    const e = dailies[g];
    if (!e || e.day !== today || e.state !== "done") continue;
    const base = { id: `fw:daily:${g}`, world: "play" as const, kicker: `Today's ${label(g)}`, href: DAILIES[g].href, weight: 3, art: { kind: "tone" as const, tone: g } };
    if (g === "fire" && e.fire?.score) return { ...base, title: `${name} scored ${e.fire.score.toLocaleString("en-US")}`, line: `${e.fire.right} right in 60 seconds. Your turn` };
    if (g === "duel" && e.duel?.won) return { ...base, title: `${name} won in ${e.duel.turns} turns`, line: "Same six cards. Your turn" };
    if ((g === "shuffle" || g === "dex") && e.result?.solved) return { ...base, title: `${name} got it in ${e.result.guesses}`, line: "Same puzzle. Your turn" };
  }
  return null;
}

/** Their next public event: a tournament they run or play in, or a public game night they host (the next two weeks). */
/**
 * Their next event. Its picture, closest first (context picks 1A): its cover, the host's banner (when it's theirs),
 * the game's art, then a photo of people playing for a game we have no art for.
 */
async function eventCard(userId: string, organized: TournamentLite[], joined: TournamentLite[], banner: string | null): Promise<Happening | null> {
  const now = Date.now();
  const soonest = (list: TournamentLite[], hosting: boolean) => list
    .filter((t) => !TESTY.test(t.title) && !isStaleOpen(t) && !isStuckLive(t) && (t.status === "in_progress" || (t.status === "open" && t.date_time && Date.parse(t.date_time) > now - 2 * 3_600_000 && Date.parse(t.date_time) - now < SOON_MS)))
    .map((t) => ({ t, hosting, at: t.status === "in_progress" ? 0 : Date.parse(t.date_time!) }));
  const tours = [...soonest(organized, true), ...soonest(joined, false)].sort((a, b) => a.at - b.at);

  const { data } = await createServiceClient().from("gs_browse_game_nights").select("id, title, starts_at, cover_image_url, going_count, games")
    .eq("host_id", userId).eq("visibility", "public").eq("status", "scheduled").is("archived_at", null)
    .gte("starts_at", new Date(now).toISOString()).lte("starts_at", new Date(now + SOON_MS).toISOString())
    .order("starts_at", { ascending: true }).limit(3);
  const night = ((data ?? []) as { id: string; title: string; starts_at: string; cover_image_url: string | null; going_count: number | null; games: string[] | null }[]).find((n) => !TESTY.test(n.title));

  const tour = tours[0];
  if (night && (!tour || Date.parse(night.starts_at) < tour.at)) {
    const going = night.going_count ?? 0;
    return {
      id: `n:${night.id}`, world: "host", kicker: when(night.starts_at, false), title: night.title,
      line: ["Hosting a game night", going ? `${going} going` : null].filter(Boolean).join(" · "),
      href: `/game-nights/${night.id}`, weight: 2,
      art: night.cover_image_url ? { kind: "img", src: night.cover_image_url }
        : banner ? { kind: "img", src: banner }
          : gameArt(night.games?.[0] ?? null) ?? { kind: "img", src: "/images/lifestyle/hero-game-nights.96d98118.jpg" },
    };
  }
  if (!tour) return null;
  const { t, hosting } = tour;
  const running = t.status === "in_progress";
  const game = t.game_slug ? getGameName(t.game_slug) : null;
  return {
    id: `t:${t.id}`, world: "compete", kicker: running ? "Tournament" : when(t.date_time, false), live: running, title: t.title,
    line: [hosting ? "Running it" : "Playing in it", game].filter(Boolean).join(" · "),
    href: `/tournament/${t.id}`, weight: running ? 4 : 2,
    art: (hosting && banner ? { kind: "img", src: banner } as const : null) ?? gameArt(t.game_slug, game) ?? { kind: "img", src: "/images/lifestyle/hero-tournaments.b274d0e2.jpg" },
  };
}

/** Their live page: live now, or where to find them when they stream. */
async function liveCard(userId: string, name: string, username: string, live: boolean): Promise<Happening> {
  if (!live) {
    return {
      id: "fw:live", world: "stream", kicker: "Streams on Twitch", title: `${name}'s live page`,
      line: "Their lobby, polls and picks while they stream", href: `/live/${username}`, weight: 1,
      art: { kind: "tone", tone: "teal", icon: "broadcast" },
    };
  }
  const { data } = await createServiceClient().from("gs_sessions").select("active_game, configured_games, feature_flags")
    .eq("owner_user_id", userId).eq("status", "active").limit(3);
  const s = ((data ?? []) as { active_game: string | null; configured_games: string[] | null; feature_flags: { test_session?: boolean } | null }[]).find((r) => !r.feature_flags?.test_session);
  const game = s?.active_game ?? s?.configured_games?.[0] ?? null;
  return {
    id: "fw:live", world: "stream", kicker: "On Twitch", live: true, title: `Watch ${name}`,
    line: game ? `${getGameName(game)} · join from chat` : "Live on Twitch · join from chat", href: `/live/${username}`, weight: 5,
    art: gameArt(game) ?? { kind: "tone", tone: "teal", icon: "broadcast" },
  };
}

/** "Play with Kai": up to three ways in, the most alive first. */
export async function joinRow(p: {
  userId: string; name: string; username: string;
  dailies: DailiesEntries; organized: TournamentLite[]; joined: TournamentLite[];
  streamer: boolean; live: boolean;
  /** Their banner (a still for a GIF), for an event of theirs with no cover. */
  banner?: string | null;
}): Promise<Happening[]> {
  const [hidden, event, live] = await Promise.all([
    isHidden(`u:${p.userId}`).catch(() => null),
    eventCard(p.userId, p.organized, p.joined, p.banner ?? null).catch(() => null),
    p.streamer ? liveCard(p.userId, p.name, p.username, p.live).catch(() => null) : Promise.resolve(null),
  ]);
  const daily = hidden?.hidden ? null : dailyCard(p.name, p.dailies);
  return [live, event, daily].filter((h): h is Happening => !!h).sort((a, b) => b.weight - a.weight);
}
