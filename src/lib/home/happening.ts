import "server-only";

/**
 * "What's happening on GameShuffle" (room air + discovery picks 2026-11-05, https://claude.ai/artifact/1UgjoWefVWxdeVKsHEmbLH,
 * all A): a band that rolls through the five worlds and shows up to three things happening in each right now. Signed
 * in, your worlds come first and the first one you don't follow is marked "New to you"; visitors and the sign-up
 * step see every world, busiest first.
 *
 * Britton's rule for it: be intentional. Only public, real things: events from the public browse views (open or
 * running, not stale, at least a couple of people in, or official), public game nights people are going to, streams
 * that are live and not test streams, records and leaders from the public boards (staff left out of "today's
 * leader", since they see answers ahead), and a short hand-kept list of what's new. Anything titled like a test
 * ("test", "demo", "sandbox"...) never shows. A world with nothing worth showing is left out.
 *
 * The lists are the same for everyone, so they're worked out once and kept two minutes per server instance.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { notStaleOpenFilter } from "@/lib/events/lifecycle";
import { getGameName } from "@/data/game-registry";
import { boxArt, findGame } from "@/data/game-catalog";
import { PILLARS, PILLAR_INTERESTS, type PillarId } from "@/lib/nav/pillars";
import type { Interest } from "@/lib/interests/rules";
import { DAILY_DEX_PUBLIC, FIRE_ROUND_PUBLIC, ROAD_PUBLIC } from "@/lib/games-visibility";
import { DUEL_SHOWN } from "@/lib/originals/dailies";
import { duelChallenger } from "@/lib/originals/duel/store";
import type { DuelPicture } from "@/lib/originals/duel/view";
import { dayStandings } from "@/lib/daily/boards";
import { ttTrack, trackPath, type TtGame } from "@/lib/timeTrials/tracks";
import { gsDay, GS_TIME_ZONE } from "@/lib/time/gsClock";
import { catalogGame } from "@/data/game-catalog";
import { shopVisibleToVisitors } from "@/lib/store/visibility";
import { wideArt } from "./art";
import { lifestyle, type LifestyleSlot } from "@/data/lifestyle-imagery";

export type HappeningArt =
  | { kind: "img"; src: string; focus?: string; light?: boolean }
  | { kind: "trainer"; picture: DuelPicture }
  /** A daily's own colors, no picture (a puzzle's answer is never shown); things to do and to start too, with a glyph. */
  | { kind: "tone"; tone: "shuffle" | "dex" | "fire" | "duel" | "teal" | "magenta"; icon?: ToneIcon }
  /** A Pokémon card's art window (Scrydex showcase cards, the Pokémon imagery rule): only the art shows, credited. */
  | { kind: "card"; src: string; fullArt: boolean; credit: string }
  /**
   * Small art beside the words on the card's own color (context picks 2A): a course picture is 160px wide and a racer
   * or kart a cutout, so stretched across a card they'd blur. `fit` cover for a picture, contain for cutouts.
   */
  | { kind: "inset"; tone: "shuffle" | "dex" | "fire" | "duel" | "teal" | "magenta"; images: string[]; fit: "cover" | "contain" };

/** The glyph on a colored card (drawn by HappeningBand). */
export type ToneIcon = "dice" | "flag" | "pokeball" | "sofa" | "broadcast" | "clock" | "question" | "bracket" | "tv" | "flame" | "cards" | "route" | "users" | "chart";

/** Which of a world's three slots this fills (room picks 2026-11-05, 6A and 7A). */
export type HappeningSlot = "happening" | "new" | "do" | "start";

export interface Happening {
  id: string;
  world: PillarId;
  /** One short label: "Tonight · 7:00 PM", "New record", "Live". */
  kicker: string;
  live?: boolean;
  title: string;
  line: string;
  href: string;
  art: HappeningArt;
  /** How much it's happening: live 5, running 4, today 3, this week 2, new 1. Orders worlds and items. */
  weight: number;
  /** Persona preview with sample data only. */
  sample?: boolean;
  /** Happening (the default), new on GameShuffle, something for you to do, or something to start. */
  slot?: HappeningSlot;
  /** Friends' faces over the picture (a night with friends, context picks 1A). */
  faces?: { name: string; avatar: string | null }[];
}

export interface HappeningWorld {
  id: PillarId;
  label: string;
  items: Happening[];
  /** One of the account's worlds. */
  mine: boolean;
  /** The first world the account doesn't follow (signed in only). */
  newToYou: boolean;
}

export const TESTY = /\b(test|testing|tester|demo|sandbox|e2e|qa|dummy|sample|placeholder|asdf)\b/i;
const MK_SLUGS = ["mario-kart-8-deluxe", "mario-kart-world", "mario-kart-64", "mario-kart-wii", "mario-kart-double-dash", "mario-kart-ds", "mario-kart-7", "super-mario-kart"];
const DAY_MS = 86_400_000;
type Db = ReturnType<typeof createServiceClient>;

/** "Running now", "Today · 7:00 PM", "Tomorrow · …", "Fri · …" (Pacific). */
export const when = (iso: string | null, running: boolean): string => {
  if (running) return "Running now";
  if (!iso) return "Soon";
  const at = Date.parse(iso);
  const day = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: GS_TIME_ZONE });
  const time = new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: GS_TIME_ZONE });
  if (day(at) === day(Date.now())) return `Today · ${time}`;
  if (day(at) === day(Date.now() + DAY_MS)) return `Tomorrow · ${time}`;
  return `${new Date(at).toLocaleDateString("en-US", { weekday: "short", timeZone: GS_TIME_ZONE })} · ${time}`;
};

/** A game's wide art, else its box art. */
export const gameArt = (slug: string | null | undefined, name?: string | null): HappeningArt | null => {
  const wide = wideArt(slug);
  if (wide) return { kind: "img", src: wide };
  const box = boxArt(findGame(slug, name));
  return box ? { kind: "img", src: box } : null;
};

/** Things that just launched, by hand (shown for 30 days from `since`). Never a test or a hidden page. */
const NEW_ON_GS: { id: string; world: PillarId; title: string; line: string; href: string; since: string; art: HappeningArt; when?: () => boolean; merch?: boolean }[] = [
  { id: "time-trials", world: "compete", title: "Time trials", line: "Every track's best times; add yours from a screenshot", href: "/time-trials", since: "2026-11-01", art: { kind: "img", src: "/images/bg/mkw-randomizer-image.jpg" } },
  { id: "trainer-road", world: "pokemon", title: "Trainer Road", line: "Duel every Gym Leader with their own team", href: "/pokemon-trainers", since: "2026-10-23", art: { kind: "img", src: "/images/duel/trainers/viola.webp", focus: "center 18%", light: true }, when: () => ROAD_PUBLIC },
  { id: "pokemon-generator", world: "play", title: "Random Pokémon generator", line: "Roll 1, 3 or 6 by generation and type", href: "/randomizers/pokemon", since: "2026-10-20", art: { kind: "tone", tone: "dex" } },
  { id: "name-every-pokemon", world: "pokemon", title: "Name every Pokémon", line: "All 1,025, or one generation, against the clock", href: "/name-every-pokemon", since: "2026-10-20", art: { kind: "tone", tone: "fire" } },
  // Merch drops (pick 13A): two weeks in the Play world's "new" slot, only while visitors can see the shop. Add each
  // drop here with `merch: true` and its launch day; the first goes in when the shop opens.
  { id: "bracket-tools", world: "host", title: "Free bracket maker", line: "Single or double elimination, round robin or Swiss", href: "/bracket-generator", since: "2026-10-20", art: { kind: "img", src: "/images/lifestyle/hero-tournaments.b274d0e2.jpg" } },
];

/** Stand-in pictures for a game night with no cover; a world never shows the same picture twice (`varied`). */
const NIGHT_ART = ["/images/lifestyle/hero-game-nights.96d98118.jpg", "/images/fg/yoshi-gang.jpg", "/images/lifestyle/hero-tournaments.b274d0e2.jpg"];

function varied(list: Happening[]): Happening[] {
  const used = new Set<string>();
  return list.map((h) => {
    if (h.art.kind !== "img") return h;
    if (!used.has(h.art.src)) { used.add(h.art.src); return h; }
    const other = NIGHT_ART.find((src) => !used.has(src));
    if (!other) return h;
    used.add(other);
    return { ...h, art: { kind: "img", src: other } };
  });
}

// ─── each world ──────────────────────────────────────────────────────────────

type TourRow = { id: string; title: string; game_slug: string | null; game_label: string | null; status: string; date_time: string | null; max_participants: number | null; header_image_url: string | null; going_count: number | null; hosted_by_gs: boolean | null };

/** Open or running public tournaments in the next week with people in them (or official ones). */
async function tournaments(db: Db): Promise<TourRow[]> {
  const soon = new Date(Date.now() + 7 * DAY_MS).toISOString();
  const { data } = await db.from("gs_browse_tournaments")
    .select("id, title, game_slug, game_label, status, date_time, max_participants, header_image_url, going_count, hosted_by_gs")
    .is("archived_at", null).is("championship_id", null).in("status", ["open", "in_progress"]).or(notStaleOpenFilter())
    .lte("date_time", soon).order("date_time", { ascending: true }).limit(40);
  return ((data ?? []) as TourRow[]).filter((t) => !TESTY.test(t.title) && ((t.going_count ?? 0) >= 2 || t.hosted_by_gs));
}

function tourItem(t: TourRow, world: PillarId): Happening {
  const running = t.status === "in_progress";
  const name = t.game_label || (t.game_slug ? getGameName(t.game_slug) : null);
  const going = t.going_count ?? 0;
  return {
    // Running: the Live chip says it, so the kicker says what it is (not "Live · Running now").
    id: `t:${t.id}`, world, kicker: running ? "Tournament" : when(t.date_time, false), live: running, title: t.title,
    line: [t.max_participants ? `${going} of ${t.max_participants} in` : `${going} in`, name].filter(Boolean).join(" · "),
    href: `/tournament/${t.id}`,
    art: t.header_image_url ? { kind: "img", src: t.header_image_url } : gameArt(t.game_slug, name) ?? { kind: "img", src: "/images/lifestyle/hero-tournaments.b274d0e2.jpg" },
    weight: running ? 4 : t.date_time && Date.parse(t.date_time) - Date.now() < DAY_MS ? 3 : 2,
  };
}

/** New best times on the open boards this week (each the fastest on its board). */
async function records(db: Db): Promise<Happening[]> {
  const since = new Date(Date.now() - 7 * DAY_MS).toISOString();
  const { data } = await db.from("tt_times").select("player, game, track, cc, time_ms, created_at").eq("status", "ok").eq("items", "shrooms")
    .gte("created_at", since).order("created_at", { ascending: false }).limit(120);
  const recent = (data ?? []) as { player: string; game: TtGame; track: string; cc: number; time_ms: number }[];
  const out: Happening[] = [];
  const seen = new Set<string>();
  for (const t of recent) {
    const key = `${t.game}|${t.track}|${t.cc}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (seen.size > 12 || out.length >= 2) break;
    const { data: best } = await db.from("tt_times").select("time_ms").eq("status", "ok").eq("items", "shrooms").eq("game", t.game).eq("track", t.track).eq("cc", t.cc)
      .order("time_ms", { ascending: true }).limit(1);
    if ((best?.[0] as { time_ms?: number } | undefined)?.time_ms !== t.time_ms) continue;
    const track = ttTrack(t.game, t.track);
    if (!track) continue;
    const who = await playerName(db, t.player);
    if (!who) continue;
    out.push({
      // Kirby Air Riders has no speed class: its game's name instead.
      id: `r:${key}`, world: "compete", kicker: "New record", title: `${track.name}, ${t.game === "kar" ? "Kirby Air Riders" : `${t.cc}cc`}`, line: `${who}, ${fmtTime(t.time_ms)}`,
      href: trackPath(track, t.cc as 150 | 200), art: track.image ? { kind: "img", src: track.image } : gameArt(t.game === "mk8dx" ? "mario-kart-8-deluxe" : t.game === "kar" ? "kirby-air-riders" : "mario-kart-world") ?? { kind: "tone", tone: "teal" }, weight: 2,
    });
  }
  return out;
}

const fmtTime = (ms: number) => `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(3).padStart(6, "0")}`;

/** A public name: an account's display name or a Discord player's; null for staff (they test things). */
async function playerName(db: Db, player: string): Promise<string | null> {
  const [kind, id] = player.split(":");
  if (kind === "u") {
    const { data } = await db.from("users").select("display_name, username, role").eq("id", id).maybeSingle();
    const r = data as { display_name?: string | null; username?: string | null; role?: string | null } | null;
    if (!r || r.role === "staff" || r.role === "admin") return null;
    return r.display_name || r.username || null;
  }
  const { data } = await db.from("gs_identities").select("display_name").eq("id", id).maybeSingle();
  return (data as { display_name?: string | null } | null)?.display_name || null;
}

/**
 * This week's biggest climb among GameShuffle's own lounge players (confirmed links, public profiles, not staff): MMR
 * since Monday from the lounge sync (`week_mmr`). People here, not a stranger at the bottom of the ladder.
 */
async function climber(db: Db): Promise<Happening | null> {
  const { data } = await db.from("lounge_links").select("user_id, game, name, mmr, week_mmr, division").not("mmr", "is", null).not("week_mmr", "is", null).limit(500);
  const rows = ((data ?? []) as { user_id: string; game: string; name: string; mmr: number; week_mmr: number; division: string | null }[])
    .map((r) => ({ ...r, gain: r.mmr - r.week_mmr })).filter((r) => r.gain >= 50).sort((a, b) => b.gain - a.gain).slice(0, 8);
  if (!rows.length) return null;
  const { data: people } = await db.from("users").select("id, role, is_public").in("id", rows.map((r) => r.user_id));
  const ok = new Set(((people ?? []) as { id: string; role: string | null; is_public: boolean | null }[]).filter((u) => u.is_public !== false && u.role !== "staff" && u.role !== "admin").map((u) => u.id));
  const top = rows.find((r) => ok.has(r.user_id));
  if (!top) return null;
  return {
    id: `l:${top.user_id}:${top.game}`, world: "compete", kicker: "This week", title: `${top.name} is up ${top.gain.toLocaleString("en-US")} MMR`,
    line: [top.division, `${top.mmr.toLocaleString("en-US")} MMR`].filter(Boolean).join(" · "),
    href: `/lounge/${encodeURIComponent(top.name)}?game=${top.game}`, art: { kind: "img", src: "/images/fg/mario-holding-trophy.jpg" }, weight: 2,
  };
}

/** Today's leader on a daily (staff left out), or null with too few players to call it. */
async function leader(game: "shuffle" | "dex" | "fire", day: string): Promise<{ name: string; guesses: number; seconds: number | null; score: number | null; total: number } | null> {
  const rows = await dayStandings(game, day, 8).catch(() => null);
  if (!rows || rows.length < 3) return null;
  const ids = rows.map((r) => r.player).filter((p) => p.startsWith("u:")).map((p) => p.slice(2));
  const staff = new Set<string>();
  if (ids.length) {
    const { data } = await createServiceClient().from("users").select("id, role").in("id", ids);
    for (const u of (data ?? []) as { id: string; role: string | null }[]) if (u.role === "staff" || u.role === "admin") staff.add(`u:${u.id}`);
  }
  const top = rows.find((r) => !staff.has(r.player) && r.row.name && r.row.name !== "A player");
  return top ? { name: top.row.name, guesses: top.row.guesses, seconds: top.row.seconds, score: top.row.score, total: rows.length } : null;
}

async function playWorld(day: string): Promise<Happening[]> {
  const out: Happening[] = [];
  const [shuffle, fire] = await Promise.all([leader("shuffle", day), FIRE_ROUND_PUBLIC ? leader("fire", day) : Promise.resolve(null)]);
  if (shuffle) out.push({ id: "d:shuffle", world: "play", kicker: "Today's leader", title: `${shuffle.name} solved the Shuffle in ${shuffle.guesses}`, line: shuffle.seconds ? `In ${Math.floor(shuffle.seconds / 60)}:${String(shuffle.seconds % 60).padStart(2, "0")}` : "Can you do it in fewer?", href: "/daily", art: { kind: "tone", tone: "shuffle" }, weight: 3 });
  if (fire?.score) out.push({ id: "d:fire", world: "play", kicker: "Fire Round today", title: `Top score: ${fire.score.toLocaleString("en-US")}`, line: `${fire.name} · 60 seconds of trivia`, href: "/daily-trivia", art: { kind: "tone", tone: "fire" }, weight: 3 });
  return out;
}

async function pokemonWorld(db: Db, day: string, tours: TourRow[]): Promise<Happening[]> {
  const out: Happening[] = [];
  if (DUEL_SHOWN) {
    const duel = await duelChallenger(day).catch(() => null);
    if (duel) {
      const { count } = await db.from("duel_runs").select("id", { count: "exact", head: true }).eq("day", day).eq("official", true);
      out.push({
        id: "duel", world: "pokemon", kicker: "Today's Daily Duel", title: `${duel.name} challenged you`, line: count ? `${count.toLocaleString("en-US")} ${count === 1 ? "has" : "have"} played · ${duel.title}` : duel.title,
        href: "/daily-duel", art: duel.picture ? { kind: "trainer", picture: duel.picture } : { kind: "tone", tone: "duel" }, weight: 3,
      });
    }
  }
  if (DAILY_DEX_PUBLIC) {
    const dex = await leader("dex", day);
    if (dex) out.push({ id: "d:dex", world: "pokemon", kicker: "Today's Daily Dex", title: `${dex.name} got it in ${dex.guesses}`, line: "Guess today's Pokémon", href: "/daily-dex", art: { kind: "tone", tone: "dex" }, weight: 3 });
  }
  out.push(...tours.filter((t) => (t.game_slug ?? "").startsWith("pokemon")).slice(0, 2).map((t) => tourItem(t, "pokemon")));
  return out;
}

async function hostWorld(db: Db, tours: TourRow[]): Promise<Happening[]> {
  const soon = new Date(Date.now() + 7 * DAY_MS).toISOString();
  const { data } = await db.from("gs_browse_game_nights").select("id, title, starts_at, place, cover_image_url, going_count, games")
    .eq("visibility", "public").eq("status", "scheduled").is("archived_at", null).gte("starts_at", new Date().toISOString()).lte("starts_at", soon)
    .order("starts_at", { ascending: true }).limit(20);
  const nights = ((data ?? []) as { id: string; title: string; starts_at: string | null; place: string | null; cover_image_url: string | null; going_count: number | null }[])
    .filter((n) => !TESTY.test(n.title) && (n.going_count ?? 0) >= 1)
    .slice(0, 2)
    .map((n): Happening => ({
      id: `n:${n.id}`, world: "host", kicker: when(n.starts_at, false), title: n.title,
      line: [`${n.going_count} going`, n.place || "Online"].join(" · "), href: `/game-nights/${n.id}`,
      art: n.cover_image_url ? { kind: "img", src: n.cover_image_url } : { kind: "img", src: NIGHT_ART[0] },
      weight: n.starts_at && Date.parse(n.starts_at) - Date.now() < DAY_MS ? 3 : 2,
    }));
  const others = tours.filter((t) => !MK_SLUGS.includes(t.game_slug ?? "") && !(t.game_slug ?? "").startsWith("pokemon")).slice(0, 2).map((t) => tourItem(t, "host"));
  return [...nights, ...others];
}

async function streamWorld(db: Db): Promise<Happening[]> {
  const { data } = await db.from("gs_sessions").select("id, name, owner_user_id, active_game, configured_games, feature_flags").eq("status", "active").limit(30);
  const rows = ((data ?? []) as { id: string; name: string; owner_user_id: string; active_game: string | null; configured_games: string[] | null; feature_flags: { test_session?: boolean } | null }[])
    .filter((s) => !s.feature_flags?.test_session && !TESTY.test(s.name));
  if (!rows.length) return [];
  const owners = [...new Set(rows.map((r) => r.owner_user_id))];
  const [{ data: live }, { data: people }, { data: lobby }] = await Promise.all([
    db.from("twitch_connections").select("user_id, is_live, twitch_display_name").in("user_id", owners),
    db.from("users").select("id, username, display_name, role, is_public").in("id", owners),
    db.from("session_participants").select("session_id").in("session_id", rows.map((r) => r.id)).limit(2000),
  ]);
  const onAir = new Map(((live ?? []) as { user_id: string; is_live: boolean | null; twitch_display_name: string | null }[]).filter((c) => c.is_live).map((c) => [c.user_id, c.twitch_display_name]));
  const who = new Map(((people ?? []) as { id: string; username: string | null; display_name: string | null; role: string | null; is_public: boolean | null }[])
    .filter((u) => u.username && u.is_public !== false && u.role !== "staff" && u.role !== "admin").map((u) => [u.id, u]));
  const count = new Map<string, number>();
  for (const p of (lobby ?? []) as { session_id: string }[]) count.set(p.session_id, (count.get(p.session_id) ?? 0) + 1);
  return rows.filter((r) => onAir.has(r.owner_user_id) && who.has(r.owner_user_id)).slice(0, 3).map((r): Happening => {
    const u = who.get(r.owner_user_id)!;
    const game = r.active_game ?? r.configured_games?.[0] ?? null;
    const n = count.get(r.id) ?? 0;
    return {
      id: `s:${r.id}`, world: "stream", kicker: u.display_name || onAir.get(r.owner_user_id) || u.username!, live: true, title: r.name,
      line: [game ? getGameName(game) : null, n ? `${n} in the lobby` : null].filter(Boolean).join(" · ") || "Live on Twitch",
      href: `/live/${u.username}`, art: gameArt(game) ?? { kind: "tone", tone: "teal" }, weight: 5,
    };
  });
}

/** What's new: 30 days from launch (merch drops 14, and only while the shop is open to visitors). */
function newOnGs(day: string, shopOpen: boolean): Happening[] {
  const now = Date.parse(`${day}T12:00:00Z`);
  return NEW_ON_GS.filter((n) => (!n.when || n.when()) && (!n.merch || shopOpen) && now >= Date.parse(`${n.since}T00:00:00Z`)
    && now - Date.parse(`${n.since}T12:00:00Z`) <= (n.merch ? 14 : 30) * DAY_MS)
    .map((n) => ({ id: `new:${n.id}`, world: n.world, kicker: n.merch ? "Merch" : "New", title: n.title, line: n.line, href: n.href, art: n.art, weight: 1, slot: "new" as const }));
}

// ─── all of it ───────────────────────────────────────────────────────────────

let copy: { at: number; worlds: Record<PillarId, Happening[]> } | null = null;
const KEEP_MS = 2 * 60_000;

/** Every world's happenings (up to six, most happening first), the same for everyone; kept two minutes. */
export async function happeningsByWorld(): Promise<Record<PillarId, Happening[]>> {
  if (copy && Date.now() - copy.at < KEEP_MS) return copy.worlds;
  const db = createServiceClient();
  const day = gsDay();
  const tours = await tournaments(db).catch(() => [] as TourRow[]);
  const safe = <T,>(p: Promise<T[]>) => p.catch((e) => { console.warn("[happening]", e?.message ?? e); return [] as T[]; });
  const [rec, climb, play, poke, host, stream] = await Promise.all([
    safe(records(db)),
    climber(db).then((c) => (c ? [c] : []), () => []),
    safe(playWorld(day)),
    safe(pokemonWorld(db, day, tours)),
    safe(hostWorld(db, tours)),
    safe(streamWorld(db)),
  ]);
  const mk = tours.filter((t) => MK_SLUGS.includes(t.game_slug ?? "")).slice(0, 3).map((t) => tourItem(t, "compete"));
  const sorted = (list: Happening[]) => [...list].sort((a, b) => b.weight - a.weight).slice(0, 6);
  const worlds: Record<PillarId, Happening[]> = {
    compete: sorted([...mk, ...rec, ...climb]),
    pokemon: sorted(poke),
    play: sorted(play),
    host: sorted(host),
    stream: sorted(stream),
  };
  copy = { at: Date.now(), worlds };
  return worlds;
}

/** Made-up examples for a staff persona preview with sample data, for a world with nothing real in it. */
const SAMPLES: Record<PillarId, Omit<Happening, "world" | "sample">[]> = {
  compete: [
    { id: "x:c1", kicker: "Today · 7:00 PM", title: "Thursday Night Cup", line: "12 of 16 in · Mario Kart 8 Deluxe", href: "/tournament", art: { kind: "img", src: "/images/fg/mk8dx-kart-selection-screen.jpg" }, weight: 3 },
    { id: "x:c2", kicker: "This week", title: "Kevo climbed 212 places", line: "Diamond 2 · 11,480 MMR", href: "/lounge", art: { kind: "img", src: "/images/fg/mario-holding-trophy.jpg" }, weight: 2 },
  ],
  pokemon: [{ id: "x:p1", kicker: "Saturday · 1:00 PM", title: "Swiss with deck lists", line: "18 of 32 in · Pokémon TCG", href: "/tournament", art: { kind: "img", src: "/images/box-art/pokemon-tcg.webp" }, weight: 2 }],
  play: [{ id: "x:d1", kicker: "Today's leader", title: "Riley solved the Shuffle in 2", line: "In 0:42", href: "/daily", art: { kind: "tone", tone: "shuffle" }, weight: 3 }],
  host: [{ id: "x:h1", kicker: "Saturday · 6:00 PM", title: "Saturday couch night", line: "6 going · Seattle", href: "/game-nights", art: { kind: "img", src: "/images/lifestyle/hero-game-nights.96d98118.jpg" }, weight: 2 }],
  stream: [{ id: "x:s1", kicker: "Rory", live: true, title: "Friday Kart Night", line: "Mario Kart World · 14 in the lobby", href: "/hub", art: { kind: "img", src: "/images/bg/mkw-main-image.jpg" }, weight: 5 }],
};

// ─── things to do, and things to start ───────────────────────────────────────

/** What we know about the viewer that shapes "for you to do" (signed in), or nothing (visitors). */
export interface BandContext {
  /** Favorite games (users.favorite_games). */
  favorites: string[];
  /** Their next trainer on Trainer Road, when the room isn't already showing it. */
  roadNext: { name: string; href: string; label: string; picture: DuelPicture | null } | null;
  /** Times on the boards (0: point them at adding one; null: not known, say nothing). */
  times: number | null;
  /** The viewer's zone, for the time-of-day lean. */
  tz: string;
}

const DO = (id: string, world: PillarId, kicker: string, title: string, line: string, href: string, tone: "shuffle" | "dex" | "fire" | "duel" | "teal" | "magenta", icon: ToneIcon): Happening =>
  ({ id: `do:${id}`, world, kicker, title, line, href, art: { kind: "tone", tone, icon }, weight: 0, slot: "do" });

/** Things for you to do in a world, from your games and progress (or the evergreen ones for visitors). */
function toDo(world: PillarId, ctx: BandContext | null): Happening[] {
  const fav = (ctx?.favorites ?? []).map((n) => catalogGame(n)).filter((g): g is NonNullable<ReturnType<typeof catalogGame>> => !!g?.href?.startsWith("/randomizers/"));
  switch (world) {
    case "play": return [
      ...fav.slice(0, 2).map((g) => DO(`roll-${g.slug}`, "play", "Your game", `Roll ${g.name}`, "Who plays what, for tonight", g.href!, "shuffle", "dice")),
      DO("wheel", "play", "Free tool", "Spin a wheel", "Make your own, or load a ready-made one", "/wheel-spinner", "magenta", "dice"),
      ...(FIRE_ROUND_PUBLIC ? [DO("fire", "play", "Fire Round", "60 seconds of trivia", "Pick a category, beat your best", "/daily-trivia", "fire", "flame")] : []),
    ];
    case "compete": return [
      ...(ctx && ctx.times === 0 ? [{ ...DO("tt-add", "compete", "Time trials", "Add your first time", "From a screenshot, or import from Quaxly", "/time-trials/import", "teal", "clock"), art: photoArt("pick-time-trial", { kind: "tone", tone: "teal", icon: "clock" }) }] : []),
      ...fav.filter((g) => g.slug.startsWith("mario-kart")).slice(0, 1).map((g) => DO(`roll-${g.slug}`, "compete", "Your game", `Roll ${g.name}`, "Karts and tracks for tonight", g.href!, "shuffle", "dice")),
      ...(FIRE_ROUND_PUBLIC ? [DO("fire-mk", "compete", "Fire Round", "A Mario Kart category", "60 seconds, against the clock", "/daily-trivia?category=mario-kart", "fire", "flame")] : []),
      DO("lounge", "compete", "Lounge", "Look up any lounge player", "Their season, nights and partners", "/lounge", "teal", "chart"),
    ];
    case "pokemon": return [
      ...(ctx?.roadNext ? [{ ...DO("road", "pokemon", "Next on your road", ctx.roadNext.name, ctx.roadNext.label, ctx.roadNext.href, "duel", "route"), art: ctx.roadNext.picture ? { kind: "trainer" as const, picture: ctx.roadNext.picture } : { kind: "tone" as const, tone: "duel" as const, icon: "route" as const } }] : []),
      DO("name-every", "pokemon", "Quiz", "Name every Pokémon", "All 1,025, or one generation", "/name-every-pokemon", "dex", "pokeball"),
      ...(FIRE_ROUND_PUBLIC ? [DO("fire-pk", "pokemon", "Fire Round", "A Pokémon category", "60 seconds, against the clock", "/daily-trivia?category=pokemon", "fire", "flame")] : []),
      DO("companion", "pokemon", "At the table", "TCG Companion", "Damage, prizes and coin flips", "/tcg-companion", "dex", "cards"),
    ];
    case "host": return [
      { ...DO("odd-one-out", "host", "Party game", "Odd One Out", "On everyone's phones, 3 to 12 players", "/game-nights/tools/odd-one-out", "magenta", "users"), art: photoArt("pick-odd-one-out", { kind: "tone", tone: "magenta", icon: "users" }) },
      { ...DO("trivia", "host", "Trivia night", "Host one from a template", "Party, office, fundraiser or bar", "/trivia", "teal", "question"), art: photoArt("pick-trivia", { kind: "tone", tone: "teal", icon: "question" }) },
      DO("jackbox", "host", "Tonight", "Jackbox picker", "A game that fits your count", "/game-nights/tools/jackbox-picker", "magenta", "tv"),
    ];
    case "stream": return [
      { ...DO("chat-games", "stream", "Guide", "Games your chat can play", "Twelve, with the commands", "/twitch-chat-games", "teal", "broadcast"), art: photoArt("pick-stream", { kind: "tone", tone: "teal", icon: "broadcast" }) },
      DO("mmr-card", "stream", "Overlay", "Your MMR card on stream", "Live, in your look", "/mmr-card", "shuffle", "chart"),
    ];
  }
}

/** When a world has nothing happening: something to start, so a quiet world becomes an invitation. */
/** A lifestyle photo (Pexels, provenance in src/data/lifestyle-imagery.ts) at card size, else the icon tile. */
export function photoArt(slot: LifestyleSlot, fallback: HappeningArt): HappeningArt {
  const p = lifestyle(slot);
  return p ? { kind: "img", src: p.src.replace(/\.jpg$/, ".card.webp"), ...(p.focus ? { focus: p.focus } : {}) } : fallback;
}

const START: Record<PillarId, Happening> = {
  compete: { id: "start:compete", world: "compete", kicker: "Nothing on yet", title: "Run a Mario Kart tournament", line: "Random rounds, guests welcome", href: "/tournament/create", art: photoArt("pick-bracket", { kind: "tone", tone: "teal", icon: "bracket" }), weight: 0, slot: "start" },
  pokemon: { id: "start:pokemon", world: "pokemon", kicker: "Nothing on yet", title: "Run a Pokémon TCG event", line: "Swiss with deck lists, for your shop or crew", href: "/tournament/create", art: { kind: "tone", tone: "teal", icon: "bracket" }, weight: 0, slot: "start" },
  play: { id: "start:play", world: "play", kicker: "Nothing on yet", title: "Start a party night", line: "Everyone joins on their phone", href: "/game-nights/tools/night-planner", art: photoArt("pick-most-likely", { kind: "tone", tone: "teal", icon: "tv" }), weight: 0, slot: "start" },
  host: { id: "start:host", world: "host", kicker: "Nothing on yet", title: "Host a game night", line: "Public or friends only, with RSVPs", href: "/game-nights/create", art: { kind: "tone", tone: "teal", icon: "sofa" }, weight: 0, slot: "start" },
  stream: { id: "start:stream", world: "stream", kicker: "Nothing live yet", title: "Plan a stream", line: "Your lobby, rolls and chat games", href: "/hub", art: photoArt("pick-stream", { kind: "tone", tone: "teal", icon: "broadcast" }), weight: 0, slot: "start" },
};

/** The time-of-day lean (8A), in the viewer's zone: evenings bring live and tonight forward, weekends events, mornings the dailies. */
function leanOf(tz: string): { evening: boolean; weekend: boolean; morning: boolean } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23", weekday: "short" }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 12);
  const day = parts.find((p) => p.type === "weekday")?.value ?? "";
  return { evening: hour >= 17 || hour < 2, weekend: day === "Sat" || day === "Sun", morning: hour >= 5 && hour < 12 };
}

function leaned(h: Happening, lean: ReturnType<typeof leanOf>): number {
  let w = h.weight;
  if (lean.evening && (h.live || /^Today|^Running|^Tonight/.test(h.kicker))) w += 2;
  if (lean.weekend && (h.id.startsWith("t:") || h.id.startsWith("n:"))) w += 1;
  if (lean.morning && h.world === "play") w += 1;
  return w;
}

const worldOf = (i: Interest): PillarId => (Object.entries(PILLAR_INTERESTS).find(([, list]) => list.includes(i))?.[0] as PillarId) ?? "play";

/**
 * The band for a viewer (6A, 7A, 8A). Each world has three slots: what's happening (live first, then today, then this
 * week, leaned by the time of day), at most one new thing, then things for you to do; a world with nothing happening
 * also gets a "Start something" card, so no world is ever empty. Signed in (`interests` given): your worlds first in
 * the order of your interests (in the evening or at the weekend, one of yours with something live or on today
 * jumps to the front; in the morning, Play), then the rest busiest first, the first marked "New to you". Visitors
 * (`interests` null): every world, busiest first.
 */
export async function bandFor(interests: Interest[] | null, opts: { sample?: boolean; ctx?: BandContext | null } = {}): Promise<HappeningWorld[]> {
  const [all, shopOpen] = await Promise.all([happeningsByWorld().catch(() => null), shopVisibleToVisitors().catch(() => false)]);
  const lists: Record<PillarId, Happening[]> = all ?? { compete: [], pokemon: [], play: [], host: [], stream: [] };
  const lean = leanOf(opts.ctx?.tz ?? GS_TIME_ZONE);
  const news = newOnGs(gsDay(), shopOpen);
  const happening = (id: PillarId): Happening[] => {
    const real = lists[id];
    const list = real.length || !opts.sample ? real : SAMPLES[id].map((s) => ({ ...s, world: id, sample: true }));
    return [...list].sort((a, b) => leaned(b, lean) - leaned(a, lean));
  };
  const fill = (id: PillarId): Happening[] => {
    const h = happening(id).slice(0, 3);
    const out: Happening[] = [...h];
    const fresh = news.find((n) => n.world === id);
    if (out.length < 3 && fresh) out.push(fresh);
    if (!h.length) out.splice(Math.min(out.length, 2), 0, START[id]);
    for (const d of toDo(id, opts.ctx ?? null)) { if (out.length >= 3) break; if (!out.some((x) => x.href === d.href)) out.push(d); }
    // The start card goes last, after the things to do.
    const start = out.findIndex((x) => x.slot === "start");
    if (start >= 0 && start !== out.length - 1) out.push(out.splice(start, 1)[0]);
    return varied(out.slice(0, 3));
  };
  const busy = (id: PillarId) => happening(id).reduce((n, x) => n + leaned(x, lean), 0);
  const label = (id: PillarId) => PILLARS.find((p) => p.id === id)?.label ?? id;
  let mine = interests ? [...new Set(interests.map(worldOf))] : [];
  if (mine.length > 1) {
    const jump = (lean.evening || lean.weekend) ? mine.find((id) => happening(id).some((x) => x.live || /^Today|^Running|^Tonight/.test(x.kicker)))
      : lean.morning && mine.includes("play") ? "play" : undefined;
    if (jump) mine = [jump, ...mine.filter((id) => id !== jump)];
  }
  const rest = (PILLARS.map((p) => p.id) as PillarId[]).filter((id) => !mine.includes(id)).sort((a, b) => busy(b) - busy(a));
  return [...mine, ...rest].map((id, k) => {
    const isMine = mine.includes(id);
    return { id, label: label(id), items: fill(id), mine: isMine, newToYou: !!interests && !isMine && k === mine.length };
  });
}

/** The band for an account, loading what shapes it (the band's own refresh, `/api/home/band`); matches the room's. */
export async function bandForUser(userId: string, opts: { sample?: boolean; interests: Interest[] }): Promise<HappeningWorld[]> {
  const db = createServiceClient();
  const [row, times] = await Promise.all([
    db.from("users").select("favorite_games, timezone").eq("id", userId).maybeSingle().then((r) => (r.data ?? {}) as { favorite_games?: string[] | null; timezone?: string | null }),
    opts.interests.includes("competitive")
      ? db.from("tt_times").select("id", { count: "exact", head: true }).eq("player", `u:${userId}`).eq("status", "ok").then((r) => r.count ?? 0)
      : Promise.resolve(null),
  ]);
  const ctx: BandContext = { favorites: row.favorite_games ?? [], roadNext: null, times, tz: row.timezone || GS_TIME_ZONE };
  return bandFor(opts.interests, { sample: opts.sample, ctx });
}
