/**
 * Players coming from MKCentral (lounge system picks 2026-11-01, https://claude.ai/artifact/1nWqceDvxZpTToXyaem9vm,
 * picks 15A to 19A). Pure, client-safe; the lookup (by Discord id, src/lib/mmr/mkcentral.ts loungeBasic) is the store's.
 *
 *   - Which number: this season's if they've played `MKC_MIN_EVENTS` (10) events in it, else last season's final.
 *   - Same scale (our 150cc and MK World modes use MKCentral's divisions and model): they start at that MMR.
 *   - Another scale (200cc, Knockout Tour): their rank becomes a share of players (top 18%), and they start at the MMR
 *     this ladder's player at that share has, once the ladder has `MIN_RATED` (50) rated players; before that, the
 *     ladder's usual placement. 200cc reads the 150cc lounge, Knockout Tour the MK World 24-player lounge.
 *   - Their first `SETTLE_TABLES` (2) tables move double, to settle it.
 */

export const MKC_MIN_EVENTS = 10;
export const MIN_RATED = 50;
import { SETTLE_TABLES } from "./rules";
export { SETTLE_TABLES };

export interface MkcSeason { season: number; mmr: number | null; events: number; rank: number | null; total: number | null }
export interface MkcRecord { name: string; division: string | null; current: MkcSeason | null; previous: MkcSeason | null }

export type MatchResult =
  | { how: "same_scale"; start: number; from: MkcSeason; line: string }
  | { how: "share"; start: number; from: MkcSeason; share: number; line: string }
  | { how: "none"; reason: "no_record" | "no_number" | "too_few_rated"; line: string };

/** The MKCentral season a match reads: this one with enough events, else the last one's final. */
export function seasonToUse(r: MkcRecord): MkcSeason | null {
  if (r.current && r.current.mmr != null && r.current.events >= MKC_MIN_EVENTS) return r.current;
  if (r.previous && r.previous.mmr != null) return r.previous;
  if (r.current && r.current.mmr != null) return r.current;
  return null;
}

/** The MMR at a share of a ladder's players (`sorted` best first): top 18% → the player 18% of the way down. */
export function mmrAtShare(sorted: number[], share: number): number | null {
  if (sorted.length < MIN_RATED) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(share * sorted.length) - 1));
  return sorted[i];
}

const pct = (share: number) => `top ${Math.max(1, Math.round(share * 100))}%`;
const n = (v: number) => v.toLocaleString("en-US");

/**
 * Where a player starts on a ladder. `ladderMmrs`: this season's rated players' MMR, best first (only read for another
 * scale). `mkcLabel`: "MKCentral's 150cc lounge".
 */
export function matchStart(record: MkcRecord | null, opts: { sameScale: boolean; ladderMmrs: number[]; ladderName: string; mkcLabel: string }): MatchResult {
  if (!record) return { how: "none", reason: "no_record", line: "No MKCentral lounge record for your Discord, so you start with this lounge's placement." };
  const from = seasonToUse(record);
  if (!from || from.mmr == null) return { how: "none", reason: "no_number", line: "Your MKCentral record has no MMR yet, so you start with this lounge's placement." };
  if (opts.sameScale) {
    return { how: "same_scale", start: Math.max(1, Math.round(from.mmr)), from,
      line: `Found you on ${opts.mkcLabel} through your Discord: ${from === record.current && record.division ? `${record.division}, ` : ""}${n(from.mmr)} (Season ${from.season}${from.events ? `, ${from.events} events` : ""}). You start at ${n(from.mmr)}. Your first ${SETTLE_TABLES} tables move double, to settle it.` };
  }
  if (!from.rank || !from.total) return { how: "none", reason: "no_number", line: "Your MKCentral record has no rank yet, so you start with this lounge's placement." };
  // MKCentral ranks everyone with a number but counts only players with an event this season, so a rank can pass the count.
  const share = Math.min(1, from.rank / from.total);
  const at = mmrAtShare(opts.ladderMmrs, share);
  if (at == null) return { how: "none", reason: "too_few_rated", line: `${opts.ladderName} needs ${MIN_RATED} rated players before a rank can be matched, so you start with its placement.` };
  return { how: "share", start: Math.max(1, at), from, share,
    line: `On ${opts.mkcLabel} you're #${n(from.rank)} of ${n(from.total)} (${pct(share)}). On ${opts.ladderName}, ${pct(share)} is ${n(at)}. You start at ${n(at)}. Your first ${SETTLE_TABLES} tables move double, to settle it.` };
}
