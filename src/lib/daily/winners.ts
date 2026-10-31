import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { dayStandings } from "@/lib/daily/boards";
import { ordinal, parsePlayer, type BoardGame } from "@/lib/daily/boardRules";
import { solvedDays } from "@/lib/daily/results";
import { answerFor, guessLimits, puzzleFor, puzzleNumber, SHUFFLE } from "@/lib/originals/daily";
import { DEX, DEX_PUZZLE, dexAnswer, dexNumber } from "@/lib/originals/dailyDex";
import { fireNumber } from "@/lib/originals/fireRound";
import { DUEL_SHOWN } from "@/lib/originals/dailies";
import { DUEL_WARMUP, duelNumber } from "@/lib/originals/duel/rules";
import { duelDayTrainer, duelWonDays } from "@/lib/originals/duel/store";
import { gsAddDays } from "@/lib/time/gsClock";
import { createNotification } from "@/lib/social/notifications";
import { MIN_FINISHERS, renumberPlaces, streakEnding, topFinishers, type WinnerRow, type WinnersGame, type WinnersSection } from "@/lib/originals/winners";

/**
 * Yesterday's top 5 (Britton's picks, 2026-10-16), from the day boards: the
 * sections for the morning winners video (/social/winners; the Daily Duel's
 * part with its trainer's picture since 2026-10-21) and the in-app
 * notes to accounts that made it (`notifyDailyWinners`, from the 9am Pacific
 * morning job). Rules in src/lib/originals/winners.ts; schema
 * supabase/daily-winners-m1.sql (opt-outs + a once-per-day claim for notes).
 */

const missing = (e: { code?: string; message?: string } | null) => !!e && (["42P01", "PGRST205"].includes(e.code ?? "") || /does not exist|schema cache/i.test(e.message ?? ""));

const SHORT: Record<BoardGame, string> = { shuffle: "Daily Shuffle", dex: "Daily Dex", fire: "Fire Round", duel: "Daily Duel" };
const PAGE: Record<BoardGame, string> = { shuffle: "/daily", dex: "/daily-dex", fire: "/daily-trivia", duel: "/daily-duel" };

/** Players who chose to be left out of winners videos (none when the table is missing). */
async function optedOut(players: string[]): Promise<Set<string>> {
  if (!players.length) return new Set();
  const { data, error } = await createServiceClient().from("daily_winner_optouts").select("player").in("player", players);
  if (error) { if (!missing(error)) console.error("[winners] opt-outs failed:", error.message); return new Set(); }
  return new Set(((data ?? []) as { player: string }[]).map((r) => r.player));
}

/**
 * Staff and admin accounts see the answers ahead (they schedule the hint
 * videos), so they're left out of the winners video and its notes (Britton,
 * 2026-10-18). They stay on the boards.
 */
async function staffPlayers(players: string[]): Promise<Set<string>> {
  const ids = players.map(parsePlayer).filter((p) => p?.kind === "u").map((p) => p!.id);
  if (!ids.length) return new Set();
  const { data, error } = await createServiceClient().from("users").select("id").in("id", ids).in("role", ["staff", "admin"]);
  if (error) { console.error("[winners] staff check failed:", error.message); return new Set(); }
  return new Set(((data ?? []) as { id: string }[]).map((r) => `u:${r.id}`));
}

/** Fire Round: each player's days with today's round played (up to `day`) and that day's longest run of right answers. */
async function fireDays(players: string[], day: string): Promise<Map<string, { days: Set<string>; bestStreak: number | null }>> {
  const out = new Map<string, { days: Set<string>; bestStreak: number | null }>();
  if (!players.length) return out;
  const { data, error } = await createServiceClient().from("fire_runs").select("player, day, best_streak")
    .in("player", players).eq("mode", "daily").eq("counts", true).eq("status", "done")
    .lte("day", day).gte("day", gsAddDays(day, -400)).limit(5000);
  if (error) { console.error("[winners] fire days failed:", error.message); return out; }
  for (const r of (data ?? []) as { player: string; day: string; best_streak: number }[]) {
    const e = out.get(r.player) ?? { days: new Set<string>(), bestStreak: null };
    e.days.add(r.day);
    if (r.day === day) e.bestStreak = r.best_streak;
    out.set(r.player, e);
  }
  return out;
}

/** The streak a player was on when `day` ended, counted the way their streak card counts it. */
async function streakFor(player: string, game: BoardGame, day: string): Promise<number> {
  const p = parsePlayer(player);
  if (!p) return 0;
  const schedule = game === "dex" ? DEX : SHUFFLE;
  if (p.kind === "u") return streakEnding(await solvedDays({ userId: p.id }, schedule).catch(() => new Set<string>()), day);
  if (p.kind === "i") return streakEnding(await solvedDays({ identityId: p.id }, schedule).catch(() => new Set<string>()), day);
  // Guests have only their board rows.
  const { data } = await createServiceClient().from("daily_scores").select("day").eq("player", player).eq("game", game).eq("solved", true).lte("day", day).order("day", { ascending: false }).limit(400);
  return streakEnding(new Set(((data ?? []) as { day: string }[]).map((r) => r.day)), day);
}

type Section = WinnersSection & { keys: { player: string; optedOut: boolean }[] };

/**
 * The Daily Duel's head: the day's trainer (their picture) and par, from the built day. Null when
 * the day was never built (nobody played it), so the duel sits the video out.
 */
export async function duelHead(day: string): Promise<Omit<WinnersSection, "rows" | "finishers"> | null> {
  const d = await duelDayTrainer(day);
  if (!d) return null;
  return { ...sectionHead("duel", day), trainer: { name: d.trainer.name, title: d.trainer.title, picture: d.trainer.picture }, par: d.par };
}

async function loadSection(game: WinnersGame, day: string): Promise<Section | null> {
  const head = game === "duel" ? await duelHead(day) : sectionHead(game, day);
  if (!head) return null;
  // The board's own order: points, then (the duel) cards left, or (Fire Round) the score, then time.
  const standings = await dayStandings(game, day, 25);
  if (!standings) return null;
  const staff = await staffPlayers(standings.map((s) => s.player));
  // Only wins count: a duel lost scores 0 points, like a puzzle missed.
  const { top, finishers } = topFinishers(renumberPlaces(standings.filter((s) => !staff.has(s.player))));
  if (finishers < MIN_FINISHERS) return null;
  const hidden = await optedOut(top.map((t) => t.player));
  const fire = game === "fire" ? await fireDays(top.map((t) => t.player), day) : null;
  const duel = game === "duel" ? await duelWonDays(top.map((t) => t.player), day) : null;
  const streaks = fire
    ? top.map((t) => streakEnding(fire.get(t.player)?.days ?? new Set<string>(), day))
    : duel ? top.map((t) => streakEnding(duel.get(t.player) ?? new Set<string>(), day))
    : await Promise.all(top.map((t) => streakFor(t.player, game, day)));
  const rows: WinnerRow[] = top.map((t, i) => {
    const out = hidden.has(t.player);
    return {
      place: t.row.place,
      name: out ? "A player" : t.row.name,
      avatar: out ? null : t.row.avatar,
      guesses: t.row.guesses,
      saved: !fire && !duel && t.row.points === 1,
      seconds: fire ? null : t.row.seconds,
      streak: streaks[i],
      ...(fire ? { score: t.row.score ?? 0, bestStreak: fire.get(t.player)?.bestStreak ?? null } : {}),
      ...(duel ? { score: t.row.score ?? 0 } : {}),
    };
  });
  return { ...head, rows, finishers, keys: top.map((t) => ({ player: t.player, optedOut: hidden.has(t.player) })) };
}

/** A daily's title, number, guess count, link and answer for a day: everything but the rows. */
export function sectionHead(game: WinnersGame, day: string): Omit<WinnersSection, "rows" | "finishers"> {
  if (game === "fire") return { game, title: "Fire Round", number: fireNumber(day), main: 0, link: "/daily-trivia" };
  if (game === "duel") return { game, title: "The Daily Duel", number: duelNumber(day), main: 0, link: "/daily-duel" };
  if (game === "dex") {
    const a = dexAnswer(day);
    return { game, title: DEX.title, number: dexNumber(day), main: guessLimits(DEX_PUZZLE).main, link: DEX.link, answer: { name: a.name, types: a.types ?? [] } };
  }
  const a = answerFor(day);
  return { game, title: SHUFFLE.title, number: puzzleNumber(day), main: guessLimits(puzzleFor(day)).main, link: SHUFFLE.link, answer: { name: a.name, img: a.img } };
}

/** The dailies in the video for a day: Fire Round from its first round, the Daily Duel once it's public (any built day on the dev server). */
export function winnersGames(day: string): WinnersGame[] {
  const games: WinnersGame[] = fireNumber(day) >= 1 ? ["shuffle", "dex", "fire"] : ["shuffle", "dex"];
  if (DUEL_SHOWN && (duelNumber(day) >= 1 || day === DUEL_WARMUP || process.env.NODE_ENV !== "production")) games.push("duel");
  return games;
}

async function loadSections(day: string): Promise<Section[]> {
  const games = winnersGames(day);
  const out = await Promise.all(games.map((g) => loadSection(g, day).catch((e) => { console.error("[winners] section failed:", g, e); return null; })));
  return out.filter((s): s is Section => !!s);
}

/** The video's sections for a day: each daily with enough finishers, its answer and its top 5. */
export async function winnersFor(day: string): Promise<WinnersSection[]> {
  return (await loadSections(day)).map(({ keys: _keys, ...s }) => { void _keys; return s; });
}

/**
 * "You made yesterday's top 5 on the Daily Dex" for every account in a daily's
 * video, once per game and day (claimed in daily_winner_notes first). Muted
 * with the Daily games notifications group.
 */
export async function notifyDailyWinners(day: string): Promise<number> {
  const admin = createServiceClient();
  let sent = 0;
  for (const s of await loadSections(day)) {
    const claim = await admin.from("daily_winner_notes").insert({ game: s.game, day });
    if (claim.error) {
      if (missing(claim.error)) return sent;
      // 23514: the table's game list doesn't have Fire Round yet (supabase/fire-round-m3-winners.sql).
      if (claim.error.code !== "23505" && claim.error.code !== "23514") console.error("[winners] claim failed:", claim.error.message);
      continue;
    }
    let notes = 0;
    for (const [i, k] of s.keys.entries()) {
      const p = parsePlayer(k.player);
      if (!p || p.kind !== "u") continue;
      const place = s.rows[i].place;
      await createNotification({
        userId: p.id,
        type: "daily_top5",
        title: `You made yesterday's top 5 on the ${SHORT[s.game]}`,
        message: k.optedOut
          ? `You finished ${ordinal(place)}. Nice one!`
          : `You finished ${ordinal(place)}. Look for your name in today's winners post on our socials.`,
        link: PAGE[s.game],
        data: { game: s.game, day, place },
      }).then(() => { notes += 1; }, (e) => console.error("[winners] note failed:", e));
    }
    sent += notes;
    await admin.from("daily_winner_notes").update({ notes }).eq("game", s.game).eq("day", day);
  }
  return sent;
}

/** Settings ▸ Privacy: whether this player is left out of winners videos (null until the table exists). */
export async function winnersOptOut(player: string): Promise<boolean | null> {
  const { data, error } = await createServiceClient().from("daily_winner_optouts").select("player").eq("player", player).maybeSingle();
  if (error) { if (!missing(error)) console.error("[winners] opt-out read failed:", error.message); return null; }
  return !!data;
}

export async function setWinnersOptOut(player: string, out: boolean): Promise<boolean> {
  const admin = createServiceClient();
  const { error } = out
    ? await admin.from("daily_winner_optouts").upsert({ player }, { onConflict: "player" })
    : await admin.from("daily_winner_optouts").delete().eq("player", player);
  if (error) console.error("[winners] opt-out save failed:", error.message);
  return !error;
}
