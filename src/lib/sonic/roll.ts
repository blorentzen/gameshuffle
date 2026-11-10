/**
 * Pure draws for Sonic Racing: CrossWorlds: a racer, machine and Gadget Plate per player, races (a track and the
 * CrossWorld on lap 2), and a Grand Prix. No React or I/O; `rng` is injectable for tests.
 */

import { pick, shuffle, type Rng } from "@/lib/party/roll";
import type { SonicCup, SonicGadget, SonicGame, SonicMachine, SonicPack, SonicPlate, SonicRacer, SonicStat } from "@/lib/sonic/types";

export interface SonicPoolOptions {
  /** Racer types to draw from. Empty = every type. */
  racerTypes?: SonicStat[];
  /** Machine types to draw from. Empty = every type. */
  machineTypes?: SonicStat[];
  /** Guest racers from other series (the free ones; paid guests also need their pack). Default on. */
  guests?: boolean;
  /** Super Sonic and Super Shadow (Grand Prix only). Default off. */
  supers?: boolean;
  /** Paid packs the players own. Default none. */
  packs?: SonicPack[];
  /** Only machines open on a new save. */
  newSave?: boolean;
}

const owned = (pack: SonicPack | undefined, packs: SonicPack[] | undefined) => !pack || (packs ?? []).includes(pack);

export function racerPool(game: SonicGame, o: SonicPoolOptions = {}): SonicRacer[] {
  const base = game.racers.filter((r) =>
    owned(r.pack, o.packs)
    && (o.guests !== false || !r.guest)
    && (!!o.supers || !r.super)
    && (!o.newSave || r.access !== "unlock"));
  const typed = o.racerTypes?.length ? base.filter((r) => o.racerTypes!.includes(r.type)) : base;
  // A type filter that leaves nobody (Boost with guests off) falls back to everyone allowed.
  return typed.length ? typed : base.length ? base : game.racers.filter((r) => r.access === "start");
}

export function machinePool(game: SonicGame, o: SonicPoolOptions = {}): SonicMachine[] {
  const base = game.machines.filter((x) => owned(x.pack, o.packs) && (!o.newSave || x.access === "start"));
  const typed = o.machineTypes?.length ? base.filter((x) => o.machineTypes!.includes(x.type)) : base;
  return typed.length ? typed : base.length ? base : game.machines.filter((x) => x.access === "start");
}

export function gadgetPool(game: SonicGame, o: { kits?: boolean } = {}): SonicGadget[] {
  return o.kits === false ? game.gadgets.filter((g) => !g.kit) : game.gadgets;
}

export interface SonicPlateRoll {
  /** The gadgets on the plate, biggest first; their slots add up to the plate's. */
  gadgets: string[];
  /** The Super Slot's gadget (Grand Master Plate only). */
  superSlot: string | null;
}

/** Fills a plate: gadgets in a random order, each one that still fits goes on, until every slot is used. */
export function rollPlate(pool: SonicGadget[], plate: SonicPlate, rng: Rng = Math.random): SonicPlateRoll {
  let left = plate.slots;
  const on: SonicGadget[] = [];
  const order = shuffle(pool, rng);
  for (const g of order) {
    if (!left) break;
    if (g.slots <= left) { on.push(g); left -= g.slots; }
  }
  const superSlot = plate.superSlot ? order.find((g) => g.slots === 1 && !on.includes(g))?.name ?? null : null;
  const sorted = [...on].sort((a, b) => b.slots - a.slots);
  return { gadgets: sorted.map((g) => g.name), superSlot };
}

export interface SonicLoadout extends SonicPlateRoll { racer: string; machine: string }

/**
 * A loadout for each player. Racers stay different while the pool allows (`repeats` lets them match);
 * machines and gadgets can repeat, like the game.
 */
export function drawLoadouts(
  racers: SonicRacer[], machines: SonicMachine[], gadgets: SonicGadget[], plate: SonicPlate, players: number,
  o: { repeats?: boolean } = {}, rng: Rng = Math.random,
): SonicLoadout[] {
  const order = shuffle(racers, rng);
  return Array.from({ length: players }, (_, i) => ({
    racer: o.repeats ? pick(racers, rng)!.name : order[i % order.length].name,
    machine: pick(machines, rng)!.name,
    ...rollPlate(gadgets, plate, rng),
  }));
}

/** Tracks and cups the players own. */
export function trackPool(game: SonicGame, packs: SonicPack[] = []): string[] {
  return game.tracks.filter((t) => owned(t.pack, packs)).map((t) => t.name);
}
export function cupPool(game: SonicGame, packs: SonicPack[] = []): SonicCup[] {
  return game.cups.filter((c) => (c.packs ?? []).every((p) => packs.includes(p)));
}

export interface SonicRace { track: string; crossWorld: string | null }

/** `count` races with no track twice and no CrossWorld twice (each until its pool runs out), each with a CrossWorld
 *  unless they're off. */
export function rollRaces(game: SonicGame, o: { count: number; packs?: SonicPack[]; crossWorlds?: boolean }, rng: Rng = Math.random): SonicRace[] {
  const tracks = trackPool(game, o.packs);
  const out: SonicRace[] = [];
  let deck: string[] = [];
  let worlds: string[] = [];
  for (let i = 0; i < Math.max(1, o.count); i++) {
    if (!deck.length) deck = shuffle(tracks, rng);
    let crossWorld: string | null = null;
    if (o.crossWorlds !== false) {
      if (!worlds.length) worlds = shuffle(game.crossWorlds, rng);
      crossWorld = worlds.shift()!;
    }
    out.push({ track: deck.shift()!, crossWorld });
  }
  return out;
}

export function rollGrandPrix(game: SonicGame, packs: SonicPack[] = [], rng: Rng = Math.random): SonicCup {
  return pick(cupPool(game, packs), rng)!;
}

/** The type label for a racer or machine ("Speed"). */
export function statLabel(game: SonicGame, t: SonicStat): string {
  return game.stats.find((s) => s.id === t)?.label ?? t;
}
export function statColor(game: SonicGame, t: SonicStat): string {
  return game.stats.find((s) => s.id === t)?.color ?? "#3b4a6b";
}
