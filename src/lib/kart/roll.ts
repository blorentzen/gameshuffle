/**
 * The roll (pure, client-safe): before each race the game deals your driver,
 * your kart (body and wheels), the track and a twist, all from one seed. The
 * randomizer is the game: you get one reroll, then you race what you're dealt.
 */

import { seeded } from "./rng";
import { BODIES, TRACKS, WHEELS, type BodyId, type TwistId, type WheelId } from "./content";
import { DRIVER_IDS, driverFor, YOU, type DriverId } from "./roster";

export interface Roll {
  seed: number;
  driver: DriverId;
  body: BodyId;
  wheels: WheelId;
  track: string;
  twist: TwistId;
}

/** Share of rolls that get the Mirror twist. */
export const MIRROR_CHANCE = 0.25;

function pick<T>(list: T[], rnd: () => number): T {
  return list[Math.floor(rnd() * list.length) % list.length];
}

export function dealRoll(seed: number): Roll {
  const rnd = seeded(seed);
  return {
    seed,
    driver: pick(DRIVER_IDS, rnd),
    body: pick(Object.keys(BODIES) as BodyId[], rnd),
    wheels: pick(Object.keys(WHEELS) as WheelId[], rnd),
    track: pick(Object.keys(TRACKS), rnd),
    twist: rnd() < MIRROR_CHANCE ? "mirror" : "none",
  };
}

/** A short key naming the combination (kept with a ghost so it races in the kart it was set in). */
export function rollKey(r: Pick<Roll, "driver" | "body" | "wheels">): string {
  return `${r.driver}.${r.body}.${r.wheels}`;
}

export function parseRollKey(key: string): Pick<Roll, "driver" | "body" | "wheels"> | null {
  const [driver, body, wheels] = key.split(".");
  // A renamed driver reads as who they became; an id nobody has is no key.
  const d = driver ? driverFor(driver) : null;
  if (!d || (d.id === YOU && driver !== YOU) || !(body in BODIES) || !(wheels in WHEELS)) return null;
  return { driver: d.id, body: body as BodyId, wheels: wheels as WheelId };
}
