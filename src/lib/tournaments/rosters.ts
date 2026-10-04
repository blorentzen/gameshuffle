/**
 * Rosters for the random-character tournament format: what "a random pick per
 * player" draws from for each game with a roster. Server-safe (imports game
 * data); the client only sees the labels in src/data/randomizer-games.ts.
 */

import { ULTIMATE } from "@/data/smash/ultimate";
import { JAMBOREE } from "@/data/party/jamboree";
import { SUPERSTARS } from "@/data/party/superstars";
import { PARTY_GAMES } from "@/data/party";
import { SPLATOON3 } from "@/data/splatoon/splatoon3";
import { AIR_RIDERS } from "@/data/kirby/air-riders";
import { machinePool } from "@/lib/kirby/roll";
import { getRandomNumber } from "@/lib/randomizer";

export interface RosterPick { pick: string; detail?: string }

interface Roster {
  names: string[];
  detail?: (name: string) => string | undefined;
  /** The game won't let two players pick the same one in a match (Mario Party). */
  unique?: boolean;
}

function rosterFor(slug: string): Roster | null {
  switch (slug) {
    case "super-smash-bros-ultimate":
      // Mii Fighters need a Mii made first, so they're left out.
      return { names: ULTIMATE.fighters.filter((f) => !f.mii).map((f) => f.name) };
    case "super-mario-party-jamboree":
      return { names: JAMBOREE.characters.map((c) => c.name), unique: true };
    case "mario-party-superstars":
      return { names: SUPERSTARS.characters.map((c) => c.name), unique: true };
    case "mario-party":
    case "mario-party-2":
    case "mario-party-3":
      return { names: PARTY_GAMES[slug].characters.map((c) => c.name), unique: true };
    case "splatoon-3": {
      const kits = SPLATOON3.weapons.filter((w) => !w.replicaOf);
      return { names: kits.map((w) => w.name), detail: (n) => { const w = kits.find((k) => k.name === n); return w ? `${w.sub} · ${w.special}` : undefined; } };
    }
    case "kirby-air-riders": {
      const machines = machinePool(AIR_RIDERS);
      return { names: AIR_RIDERS.riders.map((r) => r.name), unique: true, detail: () => `on ${machines[getRandomNumber(machines.length)].name}` };
    }
    default:
      return null;
  }
}

export function hasRoster(slug: string): boolean {
  return rosterFor(slug) !== null;
}

/** Whether each round's picks must all be different (the game's own rule). */
export function rosterIsUnique(slug: string): boolean {
  return !!rosterFor(slug)?.unique;
}

/**
 * A pick for one player. Ban/allow lists narrow the roster; `used` (their picks
 * in earlier rounds) is avoided when `noRepeat`, until they've played them all.
 */
export function drawPick(slug: string, opts: { used?: string[]; noRepeat?: boolean; allowed?: string[]; banned?: string[]; taken?: string[] } = {}): RosterPick | null {
  const r = rosterFor(slug);
  if (!r) return null;
  let names = r.names;
  const allow = (opts.allowed ?? []).filter((v) => v && v !== "Any");
  const ban = new Set((opts.banned ?? []).filter((v) => v && v !== "Any"));
  if (allow.length) names = names.filter((n) => allow.includes(n));
  if (ban.size) names = names.filter((n) => !ban.has(n));
  if (!names.length) names = r.names;
  // Taken this round (unique rosters) wins over no-repeat when both can't hold.
  if (opts.taken?.length) {
    const free = names.filter((n) => !opts.taken!.includes(n));
    if (free.length) names = free;
  }
  if (opts.noRepeat && opts.used?.length) {
    const fresh = names.filter((n) => !opts.used!.includes(n));
    if (fresh.length) names = fresh;
  }
  const pick = names[getRandomNumber(names.length)];
  return { pick, detail: r.detail?.(pick) };
}
