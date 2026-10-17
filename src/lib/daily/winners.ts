import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { dayStandings } from "@/lib/daily/boards";
import { ordinal, parsePlayer, type BoardGame } from "@/lib/daily/boardRules";
import { solvedDays } from "@/lib/daily/results";
import { answerFor, guessLimits, puzzleFor, puzzleNumber, SHUFFLE } from "@/lib/originals/daily";
import { DEX, DEX_PUZZLE, dexAnswer, dexNumber } from "@/lib/originals/dailyDex";
import { createNotification } from "@/lib/social/notifications";
import { MIN_FINISHERS, streakEnding, topFinishers, type WinnerRow, type WinnersSection } from "@/lib/originals/winners";

/**
 * Yesterday's top 5 (Britton's picks, 2026-10-16), from the day boards: the
 * sections for the morning winners video (/social/winners) and the in-app
 * notes to accounts that made it (`notifyDailyWinners`, from the 9am Pacific
 * morning job). Rules in src/lib/originals/winners.ts; schema
 * supabase/daily-winners-m1.sql (opt-outs + a once-per-day claim for notes).
 */

const missing = (e: { code?: string; message?: string } | null) => !!e && (["42P01", "PGRST205"].includes(e.code ?? "") || /does not exist|schema cache/i.test(e.message ?? ""));

const SHORT: Record<BoardGame, string> = { shuffle: "Daily Shuffle", dex: "Daily Dex" };
const PAGE: Record<BoardGame, string> = { shuffle: "/daily", dex: "/daily-dex" };

/** Players who chose to be left out of winners videos (none when the table is missing). */
async function optedOut(players: string[]): Promise<Set<string>> {
  if (!players.length) return new Set();
  const { data, error } = await createServiceClient().from("daily_winner_optouts").select("player").in("player", players);
  if (error) { if (!missing(error)) console.error("[winners] opt-outs failed:", error.message); return new Set(); }
  return new Set(((data ?? []) as { player: string }[]).map((r) => r.player));
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

async function loadSection(game: BoardGame, day: string): Promise<Section | null> {
  const standings = await dayStandings(game, day, 25);
  if (!standings) return null;
  const { top, finishers } = topFinishers(standings);
  if (finishers < MIN_FINISHERS) return null;
  const hidden = await optedOut(top.map((t) => t.player));
  const streaks = await Promise.all(top.map((t) => streakFor(t.player, game, day)));
  const rows: WinnerRow[] = top.map((t, i) => {
    const out = hidden.has(t.player);
    return {
      place: t.row.place,
      name: out ? "A player" : t.row.name,
      avatar: out ? null : t.row.avatar,
      guesses: t.row.guesses,
      saved: t.row.points === 1,
      seconds: t.row.seconds,
      streak: streaks[i],
    };
  });
  if (game === "dex") {
    const a = dexAnswer(day);
    return {
      game, title: DEX.title, number: dexNumber(day), main: guessLimits(DEX_PUZZLE).main, link: DEX.link,
      answer: { name: a.name, types: a.types ?? [] }, rows, finishers,
      keys: top.map((t) => ({ player: t.player, optedOut: hidden.has(t.player) })),
    };
  }
  const a = answerFor(day);
  return {
    game, title: SHUFFLE.title, number: puzzleNumber(day), main: guessLimits(puzzleFor(day)).main, link: SHUFFLE.link,
    answer: { name: a.name, img: a.img }, rows, finishers,
    keys: top.map((t) => ({ player: t.player, optedOut: hidden.has(t.player) })),
  };
}

async function loadSections(day: string): Promise<Section[]> {
  const out = await Promise.all((["shuffle", "dex"] as BoardGame[]).map((g) => loadSection(g, day).catch((e) => { console.error("[winners] section failed:", g, e); return null; })));
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
      if (claim.error.code !== "23505") console.error("[winners] claim failed:", claim.error.message);
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
