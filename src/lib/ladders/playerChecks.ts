/**
 * Instant verification and name changes that approve themselves (automation picks 2026-11-01,
 * https://claude.ai/artifact/JjiP8RDDdr6onMy1usw6My, picks 4 and 5). Pure, client-safe; the MKCentral lookup and the
 * word filter are the caller's.
 *
 *   - Verification is instant when MKCentral has the player's Discord on one profile, it isn't banned and has a Switch
 *     friend code, and no other player on this ladder holds that Discord or MKCentral profile. Anything else goes to
 *     staff with the reason (MKCentral's own bot checks the same things, then waits for staff anyway).
 *   - A name change approves itself when the wait since the last one is over (60 days, MKCentral's), the word filter
 *     passes, nobody on the ladder has it and it isn't one letter from another player's name. Otherwise staff decide.
 */

import { editDistance } from "@/lib/lounge/lookup";
import { nameKey } from "./rules";

export interface MkcProfile { id: number; name: string; banned: boolean; switchCodes: number; country: string | null }
export type VerifyOutcome =
  | { ok: true }
  | { ok: false; to: "player"; reason: "no_mkc" | "banned" | "no_fc"; text: string }
  | { ok: false; to: "staff"; reason: "discord_taken" | "mkc_taken" | "several_profiles"; text: string };

export function verificationCheck(input: { profiles: MkcProfile[]; discordOnLadder: boolean; mkcIdOnLadder: boolean }): VerifyOutcome {
  if (!input.profiles.length) return { ok: false, to: "player", reason: "no_mkc", text: "Your Discord isn't linked to an MKCentral account. Make one at mkcentral.com, link your Discord there, then try again." };
  if (input.profiles.length > 1) return { ok: false, to: "staff", reason: "several_profiles", text: "Your Discord is on more than one MKCentral profile, so staff will check which one is yours." };
  const p = input.profiles[0];
  if (p.banned) return { ok: false, to: "player", reason: "banned", text: "Your MKCentral account is banned, so you can't be verified here. Contact the lounge's staff if that's a mistake." };
  if (!p.switchCodes) return { ok: false, to: "player", reason: "no_fc", text: "Add a Switch friend code to your MKCentral profile, then try again." };
  if (input.discordOnLadder) return { ok: false, to: "staff", reason: "discord_taken", text: "Your Discord is already tied to another name here, so staff will look." };
  if (input.mkcIdOnLadder) return { ok: false, to: "staff", reason: "mkc_taken", text: "That MKCentral profile is already tied to another Discord here, so staff will look." };
  return { ok: true };
}

export const NAME_DAYS = 60;
export const NAME_MAX = 16;

export type NameOutcome = { ok: true } | { ok: false; to: "player" | "staff"; reason: string; text: string };

export function nameRequestCheck(input: { name: string; current: string; lastChangeAt: string | null; others: string[]; filterOk: boolean; days?: number; now: Date }): NameOutcome {
  const name = input.name.trim();
  const days = input.days ?? NAME_DAYS;
  if (!/^[\p{L}\p{N} ._-]{2,}$/u.test(name) || name.length > NAME_MAX) return { ok: false, to: "player", reason: "shape", text: `Names are 2 to ${NAME_MAX} letters, numbers, spaces, dots, dashes or underscores.` };
  if (nameKey(name) === nameKey(input.current)) return { ok: false, to: "player", reason: "same", text: "That's already your name." };
  if (input.lastChangeAt) {
    const next = Date.parse(input.lastChangeAt) + days * 86_400_000;
    if (input.now.getTime() < next) return { ok: false, to: "player", reason: "wait", text: `You can change your name again on ${new Date(next).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" })}.` };
  }
  const key = nameKey(name);
  const others = input.others.filter((o) => nameKey(o) !== nameKey(input.current));
  if (others.some((o) => nameKey(o) === key)) return { ok: false, to: "player", reason: "taken", text: "Someone on this lounge already has that name." };
  if (!input.filterOk) return { ok: false, to: "staff", reason: "filter", text: "Staff will look at this name before it's used." };
  const close = others.find((o) => editDistance(nameKey(o), key) === 1);
  if (close) return { ok: false, to: "staff", reason: "close", text: `It's one letter from ${close}, so staff will look.` };
  return { ok: true };
}
