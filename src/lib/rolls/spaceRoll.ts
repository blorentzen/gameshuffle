import "server-only";

/**
 * Rolls in a game space (round two picks 5A to 7A, 2026-11-06). "Roll for me" rolls from the game's own randomizer
 * through its chat roll (src/lib/twitch/chatGames.ts), so a roll in a space is the same thing chat, the overlay and the
 * live page already draw. The server signs each roll it makes; "Share it here" posts only a roll that carries a good
 * signature, so a shared roll is always one the randomizer gave.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { getChatGame } from "@/lib/twitch/chatGames";
import { CHAT_SETUPS } from "@/lib/twitch/chatSetups";
import type { ChatRoll } from "@/lib/twitch/chatRoll";
import type { GameSpace } from "@/lib/games/spaces";

/** The randomizer a space rolls from: its main game's chat roll, if that game has one. */
export function spaceRoller(s: GameSpace) {
  return getChatGame(s.primary);
}

function key(): string {
  const base = process.env.ACTIVITY_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error("ACTIVITY_SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY must be set");
  return createHmac("sha256", base).update("gs-space-roll").digest("base64url");
}

/** What the signature covers, field by field in a fixed order (a cleaned copy of a roll must sign the same). */
const canonical = (roll: ChatRoll) => JSON.stringify([roll.game, roll.text, roll.title ?? "", roll.slots.map((x) => [x.label, x.name, x.kind, x.img ?? "", x.color ?? "", x.glyph ?? "", x.detail ?? ""])]);

export function signRoll(roll: ChatRoll): string {
  return createHmac("sha256", key()).update(canonical(roll)).digest("base64url");
}

export function rollSigned(roll: ChatRoll, sig: string): boolean {
  if (typeof sig !== "string" || !sig) return false;
  const want = Buffer.from(signRoll(roll));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Spaces whose roll is the night's setup with your pick as one of its parts: "Roll a party" in Mario Party gives a
 *  board, turns, rules and Bonus Stars, with your character second (other spaces pass, 2026-11-06). */
const SETUP_FIRST = new Set(["mario-party"]);

/** One roll for the space's main game, signed. Null when the game has no randomizer. */
export function rollForSpace(s: GameSpace): { roll: ChatRoll; sig: string } | null {
  const game = spaceRoller(s);
  if (!game || game.streamerOnly) return null;
  const pick = game.roll({ owned: null, arg: "", taken: [] });
  const setup = SETUP_FIRST.has(s.id) ? CHAT_SETUPS[s.primary]?.roll({ arg: "", players: 4 }) : null;
  const roll: ChatRoll = setup && setup.slots.length && pick.slots.length
    ? { ...setup, slots: [setup.slots[0], ...pick.slots, ...setup.slots.slice(1)], text: `${setup.text} · ${pick.slots.map((x) => x.name).join(", ")}` }
    : pick;
  return { roll, sig: signRoll(roll) };
}

/** A roll as it may be stored on a post: the parts as given, trimmed to sane sizes. */
export function cleanRoll(raw: unknown): ChatRoll | null {
  const r = raw as ChatRoll | null;
  if (!r || r.v !== 2 || typeof r.game !== "string" || !Array.isArray(r.slots) || typeof r.text !== "string") return null;
  const slots = r.slots.slice(0, 12).filter((x) => x && typeof x.name === "string" && typeof x.label === "string").map((x) => ({
    label: x.label.slice(0, 40), name: x.name.slice(0, 80), kind: x.kind,
    ...(typeof x.img === "string" ? { img: x.img.slice(0, 300) } : {}),
    ...(typeof x.color === "string" ? { color: x.color.slice(0, 20) } : {}),
    ...(typeof x.glyph === "string" ? { glyph: x.glyph } : {}),
    ...(typeof x.detail === "string" ? { detail: x.detail.slice(0, 80) } : {}),
  }));
  if (!slots.length) return null;
  return { v: 2, game: r.game.slice(0, 80), slots, text: r.text.slice(0, 300), ...(typeof r.title === "string" ? { title: r.title.slice(0, 80) } : {}), ...(r.kind ? { kind: r.kind } : {}) } as ChatRoll;
}
