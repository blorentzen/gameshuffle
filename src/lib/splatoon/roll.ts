/**
 * Pure draws for Splatoon: weapon kits, a battle (mode + stage), a Salmon Run
 * stage and Alpha/Bravo teams. No React or I/O; `rng` is injectable for tests.
 */

import { pick, shuffle, type Rng } from "@/lib/party/roll";
import type { SplatModeKind, SplatWeapon, SplatoonGame, WeaponClass } from "@/lib/splatoon/types";

export interface WeaponOptions {
  /** Limit to these classes. Empty = every class. */
  classes?: WeaponClass[];
  /** Replicas share a kit with another weapon; off by default so a kit can't come up twice. */
  replicas?: boolean;
}

export function weaponPool(game: SplatoonGame, o: WeaponOptions = {}): SplatWeapon[] {
  const rows = game.weapons.filter((w) => (o.replicas || !w.replicaOf) && (!o.classes?.length || o.classes.includes(w.cls)));
  return rows.length ? rows : game.weapons.filter((w) => !w.replicaOf);
}

/**
 * A kit for each player, all different while the pool allows. `used` leaves out
 * kits already played tonight (no repeats); once the pool runs dry it refills.
 */
export function drawWeapons(pool: SplatWeapon[], players: number, opts: { used?: string[] } = {}, rng: Rng = Math.random): SplatWeapon[] {
  const used = new Set(opts.used ?? []);
  const fresh = pool.filter((w) => !used.has(w.name));
  const source = fresh.length >= players ? fresh : pool;
  const order = shuffle(source, rng);
  return Array.from({ length: players }, (_, i) => order[i % order.length]);
}

export interface BattleRoll { modeId: string; stage: string }

/** A mode (from the chosen kinds) and a stage. */
export function rollBattle(game: SplatoonGame, kinds: SplatModeKind[], rng: Rng = Math.random): BattleRoll {
  const modes = game.modes.filter((m) => kinds.includes(m.kind));
  return { modeId: pick(modes.length ? modes : game.modes, rng)!.id, stage: pick(game.stages, rng)!.name };
}

/** A set of battles with no stage repeated (a Private Battle night). */
export function rollSet(game: SplatoonGame, kinds: SplatModeKind[], count: number, rng: Rng = Math.random): BattleRoll[] {
  const modes = game.modes.filter((m) => kinds.includes(m.kind));
  const stages = shuffle(game.stages, rng);
  return Array.from({ length: count }, (_, i) => ({ modeId: pick(modes.length ? modes : game.modes, rng)!.id, stage: stages[i % stages.length].name }));
}

export function rollSalmon(game: SplatoonGame, rng: Rng = Math.random): string {
  return pick(game.salmonStages, rng)!;
}

/** Alpha and Bravo: the players split as evenly as possible (Private Battles take up to 4 a side). */
export function splitTeams(names: string[], rng: Rng = Math.random): { alpha: string[]; bravo: string[] } {
  const order = shuffle(names, rng);
  const half = Math.ceil(order.length / 2);
  return { alpha: order.slice(0, half), bravo: order.slice(half) };
}
