/**
 * Help bought with tokens at the dailies' last chance (server only).
 * Britton's picks, 2026-10-16; schema supabase/daily-help-m1.sql; rules
 * src/lib/originals/dailyHelp.ts.
 *
 * Players with a wallet buy: accounts on the site (player u:<account>, paid
 * from the account wallet) and Discord players in the Activity (i:<identity>,
 * paid from the wallet that identity uses). gs_daily_help_buy records the
 * purchase and the spend in one step under the wallet lock. The judge allows
 * a game the extra guesses its player bought (extraGuesses).
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { getBalance } from "@/lib/economy/tokens";
import { answerFor, dayKey, type DailySchedule } from "@/lib/originals/daily";
import { HELP_DEFAULTS, NO_HELP, lettersAllowed, type HelpCounts, type HelpPrices } from "@/lib/originals/dailyHelp";

const missing = (e: { code?: string } | null | undefined) => e?.code === "42P01" || e?.code === "PGRST205" || e?.code === "PGRST202";

export async function helpPrices(): Promise<HelpPrices> {
  const { data, error } = await createServiceClient().from("gs_economy_config").select("key, value").like("key", "daily_help_%");
  if (error || !data) return HELP_DEFAULTS;
  const v = new Map((data as { key: string; value: number }[]).map((r) => [r.key, Number(r.value)]));
  const n = (k: string, d: number) => (Number.isFinite(v.get(k)) ? Math.max(0, v.get(k)!) : d);
  return {
    letter: n("daily_help_letter_tokens", HELP_DEFAULTS.letter),
    guess: n("daily_help_guess_tokens", HELP_DEFAULTS.guess),
    letters: Math.min(5, n("daily_help_letters", HELP_DEFAULTS.letters)),
    guesses: Math.min(5, n("daily_help_guesses", HELP_DEFAULTS.guesses)),
  };
}

/** What a player bought for a game on a day ({0, 0} before the migration). */
export async function helpFor(player: string, game: DailySchedule["id"], day: string): Promise<HelpCounts> {
  const { data, error } = await createServiceClient().from("daily_help").select("kind").eq("player", player).eq("game", game).eq("day", day);
  if (error) return NO_HELP;
  const rows = (data ?? []) as { kind: "letter" | "guess" }[];
  return { letters: rows.filter((r) => r.kind === "letter").length, guesses: rows.filter((r) => r.kind === "guess").length };
}

/** Extra guesses the judge allows this player's game. */
export async function extraGuesses(player: string, game: DailySchedule["id"], day: string): Promise<number> {
  return (await helpFor(player, game, day)).guesses;
}

/** The letters the last chance gives free: the Dex shows the first letter, the Shuffle none. */
export const freeLetters = (game: DailySchedule["id"]) => (game === "dex" ? 1 : 0);

export interface HelpState { ready: boolean; balance: number | null; prices: HelpPrices; help: HelpCounts; lettersLeft: number }

export async function helpState(player: string, wallet: string | null, game: DailySchedule): Promise<HelpState> {
  const day = dayKey();
  const [prices, help, balance, probe] = await Promise.all([
    helpPrices(),
    helpFor(player, game.id, day),
    wallet ? getBalance(wallet).catch(() => null) : Promise.resolve(null),
    createServiceClient().from("daily_help").select("player", { head: true, count: "exact" }).limit(1),
  ]);
  const allowed = lettersAllowed(answerFor(day, game).name, freeLetters(game.id), prices.letters);
  return { ready: !missing(probe.error), balance, prices, help, lettersLeft: Math.max(0, allowed - help.letters) };
}

export type BuyResult =
  | { ok: true; help: HelpCounts; balance: number }
  | { ok: false; error: "not_ready" | "finished" | "limit" | "insufficient_balance" | "no_wallet" | "failed"; balance?: number };

/** Buys one letter or one extra guess for today's game. `finished` = the player already has a result today. */
export async function buyHelp(args: { player: string; wallet: string | null; game: DailySchedule; kind: "letter" | "guess"; finished: boolean }): Promise<BuyResult> {
  if (!args.wallet) return { ok: false, error: "no_wallet" };
  if (args.finished) return { ok: false, error: "finished" };
  const day = dayKey();
  const prices = await helpPrices();
  const cap = args.kind === "letter" ? lettersAllowed(answerFor(day, args.game).name, freeLetters(args.game.id), prices.letters) : prices.guesses;
  const { data, error } = await createServiceClient().rpc("gs_daily_help_buy", {
    p_identity_id: args.wallet, p_player: args.player, p_game: args.game.id, p_day: day, p_kind: args.kind, p_cap: cap,
    p_amount: args.kind === "letter" ? prices.letter : prices.guess,
  });
  if (error) {
    if (missing(error)) return { ok: false, error: "not_ready" };
    console.error("[daily help] buy failed:", error);
    return { ok: false, error: "failed" };
  }
  const r = data as { ok: boolean; reason?: string; balance?: number };
  if (!r.ok) return { ok: false, error: r.reason === "limit" ? "limit" : r.reason === "insufficient_balance" ? "insufficient_balance" : "failed", balance: r.balance };
  return { ok: true, help: await helpFor(args.player, args.game.id, day), balance: r.balance ?? 0 };
}
