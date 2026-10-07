/**
 * Pure draws for Kirby Air Riders: a rider and machine per player, a course,
 * and a City Trial Stadium. No React or I/O; `rng` is injectable for tests.
 */

import { pick, shuffle, type Rng } from "@/lib/party/roll";
import type { KirbyGame, KirbyMachine, KirbyRider, MachineType, StadiumKind } from "@/lib/kirby/types";

export interface KirbyPoolOptions {
  /** Machine types to draw from. Empty = every type except Legendary. */
  types?: MachineType[];
  /** Only what's unlocked from the start (a new save). */
  startersOnly?: boolean;
}

export function riderPool(game: KirbyGame, o: KirbyPoolOptions = {}): KirbyRider[] {
  return game.riders.filter((r) => !o.startersOnly || r.starter);
}

export function machinePool(game: KirbyGame, o: KirbyPoolOptions = {}): KirbyMachine[] {
  const types = o.types?.length ? o.types : (["Star", "Bike", "Chariot", "Tank"] as MachineType[]);
  const rows = game.machines.filter((m) => types.includes(m.type) && (!o.startersOnly || m.starter));
  return rows.length ? rows : game.machines.filter((m) => m.starter);
}

export interface KirbyRoll { rider: string; machine: string }

/** A rider and machine for each player. Riders stay different while the pool allows; machines can repeat, like the game. */
export function drawCombos(riders: KirbyRider[], machines: KirbyMachine[], players: number, rng: Rng = Math.random): KirbyRoll[] {
  const order = shuffle(riders, rng);
  return Array.from({ length: players }, (_, i) => ({ rider: order[i % order.length].name, machine: pick(machines, rng)!.name }));
}

export function rollCourse(game: KirbyGame, kind: "air" | "top", startersOnly = false, rng: Rng = Math.random): string {
  const list = (kind === "air" ? game.airRideCourses : game.topRideCourses).filter((c) => !startersOnly || c.starter);
  return pick(list.length ? list : kind === "air" ? game.airRideCourses : game.topRideCourses, rng)!.name;
}

export function rollStadium(game: KirbyGame, kinds: StadiumKind[], rng: Rng = Math.random): string {
  const list = game.stadiums.filter((s) => kinds.includes(s.kind));
  return pick(list.length ? list : game.stadiums.filter((s) => s.kind !== "boss"), rng)!.name;
}
