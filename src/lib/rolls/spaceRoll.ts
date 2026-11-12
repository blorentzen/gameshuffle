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
import type { ChatRoll, RollSlot } from "@/lib/twitch/chatRoll";
import type { GameSpace, SpaceRollGame } from "@/lib/games/spaces";

/** A game's chat roll when it can be a space roll. A roll only the streamer gets (Pokémon Champions' team, Stadium's
 *  rentals) isn't one: no Rolls tab, and the header keeps the space's own main button. */
function roller(slug: string) {
  const game = getChatGame(slug);
  return game && !game.streamerOnly ? game : null;
}

/** The games a space's Rolls can switch between (Retro Mario Kart: Double Dash, Mario Kart DS and Mario Kart 64), only those with a
 *  roll right now (a hidden game's chat roll is off in production). Empty for a one-game space. */
export function spaceRollGames(s: GameSpace): SpaceRollGame[] {
  return (s.rollGames ?? []).filter((g) => s.games.includes(g.game) && !!roller(g.game));
}

/** The randomizer a space rolls from: the game asked for when the space can switch to it, else its first game with a
 *  roll, else its main game's chat roll. */
export function spaceRoller(s: GameSpace, game?: string | null) {
  const games = spaceRollGames(s);
  const pick = (game && games.find((g) => g.game === game)) || games[0];
  return pick ? roller(pick.game) : roller(s.primary);
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

/** Spaces whose roll adds the night's parts after your pick, as `!gs setup` words: "Roll a challenge" in Super Mario
 *  Bros. Wonder gives your character and badge, then a level and a challenge rule (game space picks 2026-11-11). */
const SETUP_AFTER: Record<string, string[]> = { "super-mario-bros-wonder": ["", "rule"] };

function makeRoll(s: GameSpace, which?: string | null): ChatRoll | null {
  const game = spaceRoller(s, which);
  if (!game || game.streamerOnly) return null;
  const pick = game.roll({ owned: null, arg: "", taken: [] });
  // The night's extra parts are the main game's (a space that switches games has none).
  if (game.slug !== s.primary) return pick;
  const after = (SETUP_AFTER[s.id] ?? []).map((arg) => CHAT_SETUPS[s.primary]?.roll({ arg, players: 4 })).filter((x): x is ChatRoll => !!x?.slots.length);
  if (after.length) return { ...pick, slots: [...pick.slots, ...after.flatMap((x) => x.slots)], text: [pick.text, ...after.map((x) => x.text)].join(" · ") };
  const setup = SETUP_FIRST.has(s.id) ? CHAT_SETUPS[s.primary]?.roll({ arg: "", players: 4 }) : null;
  return setup && setup.slots.length && pick.slots.length
    ? { ...setup, slots: [setup.slots[0], ...pick.slots, ...setup.slots.slice(1)], text: `${setup.text} · ${pick.slots.map((x) => x.name).join(", ")}` }
    : pick;
}

/** One roll for the space's main game (or the game picked on its switch), signed, with what its reel spins through
 *  first: for each part, up to 8 other picks of the same kind from more rolls of the same randomizer (never the
 *  result). Null when the game has no randomizer. */
export function rollForSpace(s: GameSpace, which?: string | null): { roll: ChatRoll; sig: string; reel: RollSlot[][] } | null {
  const roll = makeRoll(s, which);
  if (!roll) return null;
  const pools = new Map<string, Map<string, RollSlot>>(roll.slots.map((x) => [x.label, new Map()]));
  for (let i = 0; i < 14; i++) {
    for (const x of makeRoll(s, which)?.slots ?? []) {
      const pool = pools.get(x.label);
      if (pool && pool.size < 8) pool.set(x.name, x);
    }
  }
  const reel = roll.slots.map((t) => [...(pools.get(t.label)?.values() ?? [])].filter((x) => x.name !== t.name));
  return { roll, sig: signRoll(roll), reel };
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
