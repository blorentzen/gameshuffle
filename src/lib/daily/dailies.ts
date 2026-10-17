/**
 * The dailies together, server side: each game's result today, its streak and
 * last two weeks, and the Weekly's status, for the today bar, Next up, the
 * combined share and the streak cards (src/lib/originals/dailies.ts). Signed
 * in on the site, from the account (plus the Discord identity it signs in
 * with); in the Activity, from the Discord identity (plus its account).
 */

import "server-only";
import { dailyView, type DailyWho } from "@/lib/daily/results";
import { SHUFFLE, dayKey, guessLimits, puzzleFor, puzzleNumber, type DailySchedule } from "@/lib/originals/daily";
import { DEX } from "@/lib/originals/dailyDex";
import { weekNumber, weekOf } from "@/lib/originals/weekly";
import { createServiceClient } from "@/lib/supabase/admin";
import { topTenFinishes } from "@/lib/weekly/store";
import type { DailiesEntries, DailiesEntry } from "@/lib/originals/dailies";

async function dailyEntry(who: DailyWho, game: DailySchedule): Promise<DailiesEntry> {
  const day = dayKey();
  const v = await dailyView(who, game);
  const main = guessLimits(puzzleFor(day, game)).main;
  return {
    day,
    number: puzzleNumber(day, game),
    state: v.today ? "done" : v.progress?.length ? "playing" : "fresh",
    result: v.today ? { guesses: v.today.guesses, main, solved: v.today.solved, saved: v.today.solved && v.today.guesses > main } : null,
    stats: { played: v.stats.played, won: v.stats.won, streak: v.stats.streak, best: v.stats.best, saved: v.stats.saved ?? 0 },
    recent: v.recent,
  };
}

/** The Weekly needs an account: answered this week, weeks played, top 10 finishes. */
async function weeklyEntry(userId: string): Promise<DailiesEntry | null> {
  const week = weekOf();
  const admin = createServiceClient();
  const [mine, all, topTen] = await Promise.all([
    admin.from("weekly_entries").select("ballot, answer, predictions").eq("week_start", week).eq("user_id", userId).maybeSingle(),
    admin.from("weekly_entries").select("week_start", { count: "exact", head: true }).eq("user_id", userId).or("ballot.not.is.null,predictions.not.is.null,answer.not.is.null"),
    topTenFinishes(userId).catch(() => 0),
  ]);
  if (mine.error && (mine.error.code === "42P01" || mine.error.code === "PGRST205")) return null;
  const row = mine.data as { ballot: unknown; answer: string | null; predictions: unknown } | null;
  const answered = !!row && (!!row.ballot || !!row.answer || !!row.predictions);
  return { day: week, number: weekNumber(week), state: answered ? "done" : "fresh", weeks: { played: all.count ?? 0, topTen } };
}

export async function dailiesView(who: DailyWho, opts: { dex?: boolean } = {}): Promise<DailiesEntries> {
  const [shuffle, dex, weekly] = await Promise.all([
    dailyEntry(who, SHUFFLE).catch((e) => { console.error("[dailies] shuffle failed:", e); return undefined; }),
    opts.dex === false ? Promise.resolve(undefined) : dailyEntry(who, DEX).catch((e) => { console.error("[dailies] dex failed:", e); return undefined; }),
    who.userId ? weeklyEntry(who.userId).catch((e) => { console.error("[dailies] weekly failed:", e); return null; }) : Promise.resolve(null),
  ]);
  return { ...(shuffle ? { shuffle } : {}), ...(dex ? { dex } : {}), ...(weekly ? { weekly } : {}) };
}
