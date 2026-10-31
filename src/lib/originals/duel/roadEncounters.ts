/**
 * Trainer Road's encounters (picks 2026-10-24, https://claude.ai/artifact/GRHU4zVKU8TjMpu4dQ9Kat, all
 * as recommended): each region's own villain team turns up on the road and blocks it. Pure and
 * client-safe; the store is roadProgress.ts (tables from supabase/trainer-road-m3.sql).
 *
 * - One story battle per region, where the region's game puts the villain team (Kanto's Rocket
 *   Hideout before Koga): it turns up when the Gym it stands before is the next trainer on your path.
 * - A grunt now and then: after a badge, about 1 in 4 (a lever), when the next trainer is a Gym
 *   Leader. The roll is seeded by the badge, so replaying a duel can't roll again.
 * - While a villain team is out, the next trainer on your path waits (a win there counts as free
 *   play); every other duel stays open. They swipe some tokens when they turn up (50, or what you
 *   have); beating them gives the tokens back plus a reward and XP, and a story battle adds that
 *   villain team's mark to your trainer card. A loss changes nothing: try again any time.
 */

import { duelRand } from "./rules";
import { regionPath, type RoadProgress } from "./roadPath";

export interface RegionVillains {
  region: string;
  /** The villain team (Hoenn has two, the story battle's first): its name and its person on Trainer Road ("team-rocket"). */
  teams: { name: string; person: string }[];
  /** The story battle: its team, and the index of the Gym on the path it stands before. */
  set: { team: string; before: number };
  /** Grunt teams that can turn up after a badge (team ids). */
  grunts: string[];
}

/**
 * Every region's villain teams on its path's game. Each team is in the roster (trainers.ts, with its
 * Bulbapedia source line); scripts/test-road-path.ts checks they exist and sit where these say.
 */
export const ROAD_VILLAINS: readonly RegionVillains[] = [
  // Kanto: Giovanni in the Rocket Hideout, which has to come before Koga (the Poké Flute it leads to wakes the Snorlax on the way to Fuchsia).
  { region: "kanto", teams: [{ name: "Team Rocket", person: "team-rocket" }], set: { team: "giovanni-firered-hideout", before: 4 },
    grunts: ["team-rocket-firered-mt-moon", "team-rocket-firered-hideout", "team-rocket-firered-silph"] },
  // Johto: Archer at the Goldenrod Radio Tower, after Pryce and before Clair.
  { region: "johto", teams: [{ name: "Team Rocket", person: "team-rocket" }], set: { team: "archer-heartgold", before: 7 },
    grunts: ["team-rocket-heartgold-well", "team-rocket-heartgold-warehouse", "team-rocket-heartgold-radio-tower"] },
  // Hoenn: Maxie at the top of Mt. Chimney, before Flannery. Grunts from both teams.
  { region: "hoenn", teams: [{ name: "Team Magma", person: "team-magma" }, { name: "Team Aqua", person: "team-aqua" }], set: { team: "maxie-emerald", before: 3 },
    grunts: ["team-magma-emerald-jagged-pass", "team-magma-emerald-hideout", "team-aqua-emerald-weather-institute", "team-aqua-emerald-mt-pyre"] },
  // Sinnoh: Mars at Lake Verity, after Byron and before Candice.
  { region: "sinnoh", teams: [{ name: "Team Galactic", person: "team-galactic" }], set: { team: "mars-platinum", before: 6 },
    grunts: ["team-galactic-platinum-windworks", "team-galactic-platinum-eterna", "team-galactic-platinum-celestic"] },
  // Unova: the grunts around Zinzolin in Driftveil's Cold Storage, before Clay.
  { region: "unova", teams: [{ name: "Team Plasma", person: "team-plasma" }], set: { team: "team-plasma-black-cold-storage", before: 4 },
    grunts: ["team-plasma-black-pinwheel", "team-plasma-black-chargestone", "team-plasma-black-dragonspiral"] },
  // Kalos: Xerosic in Lysandre Labs, after Olympia and before Wulfric.
  { region: "kalos", teams: [{ name: "Team Flare", person: "team-flare" }], set: { team: "xerosic-x", before: 7 },
    grunts: ["team-flare-x-glittering-cave", "team-flare-x-power-plant", "team-flare-x-poke-ball-factory"] },
  // Alola: Plumeria at the Akala Outskirts, right before Olivia's grand trial.
  { region: "alola", teams: [{ name: "Team Skull", person: "team-skull" }], set: { team: "plumeria-sun", before: 1 },
    grunts: ["team-skull-sun-route-17", "team-skull-sun-shady-house", "team-skull-sun-shady-house-upstairs"] },
  // Galar: the Team Yell grunts lining Spikemuth's street, before Piers.
  { region: "galar", teams: [{ name: "Team Yell", person: "team-yell" }], set: { team: "team-yell-sword-spikemuth", before: 6 },
    grunts: ["team-yell-sword-route-5", "team-yell-sword-route-6", "team-yell-sword-route-9"] },
  // Paldea: Atticus at the Navi Squad's Base, before Larry.
  { region: "paldea", teams: [{ name: "Team Star", person: "team-star" }], set: { team: "atticus-scarlet", before: 4 },
    grunts: ["team-star-scarlet-academy", "team-star-scarlet-caph-gate"] },
];

export const villainsOf = (region: string): RegionVillains | null => ROAD_VILLAINS.find((v) => v.region === region) ?? null;

/** The encounter's cause for a story battle (one per region, ever). A grunt's cause is the badge it followed. */
export const setCause = (region: string) => `set:${region}`;

/** Which villain team a team belongs to (by its region's list), for its name and picture. */
export function villainTeamOf(teamId: string): { region: string; name: string; person: string; kind: "set" | "grunt" } | null {
  for (const v of ROAD_VILLAINS) {
    const kind = v.set.team === teamId ? "set" : v.grunts.includes(teamId) ? "grunt" : null;
    if (!kind) continue;
    return { region: v.region, ...teamFor(v, teamId), kind };
  }
  return null;
}

/** Hoenn's two teams: a team id names its own ("team-magma-…", "team-aqua-…"); the story battle belongs to the first. */
function teamFor(v: RegionVillains, teamId: string): { name: string; person: string } {
  return v.teams.find((t) => teamId.startsWith(t.person)) ?? v.teams[0];
}

/**
 * The story battle due now: the next trainer on your path is the Gym it stands before. The store
 * checks it hasn't turned up before (one per region, ever).
 */
export function setDue(next: { region: string; kind: string; index: number } | null): { region: string; team: string } | null {
  if (!next || next.kind !== "gym") return null;
  const v = villainsOf(next.region);
  return v && v.set.before === next.index ? { region: v.region, team: v.set.team } : null;
}

/**
 * A grunt after a badge: about `chance` percent of the time, when the next trainer is a Gym Leader
 * in a region with grunts (not the League, the end-game battle, or a Gym with a story battle in front
 * of it). Seeded by the player and the badge, so the same badge always rolls the same.
 */
export function gruntAfter(userId: string, cause: string, next: { region: string; kind: string; index: number } | null, chance: number): string | null {
  if (!next || next.kind !== "gym" || setDue(next)) return null;
  const v = villainsOf(next.region);
  if (!v?.grunts.length) return null;
  const rand = duelRand(`road-encounter:${userId}:${cause}`);
  if (rand() * 100 >= chance) return null;
  return v.grunts[Math.floor(rand() * v.grunts.length)];
}

/** The Gym a story battle stands before, as words ("Koga's badge"); null when the data is off. */
export function blockedLabel(region: string, index: number, name: string): string | null {
  const p = regionPath(region);
  if (!p || !p.gyms[index]) return null;
  return region === "alola" ? `${name}'s grand trial` : `${name}'s badge`;
}

/** Marks on a player's card: the villain team whose story battle each one stands for (a region's first team; Hoenn's is Team Magma at Mt. Chimney). */
export function markNames(progress: Pick<RoadProgress, "marks">): { region: string; name: string; person: string }[] {
  return progress.marks.flatMap((region) => {
    const t = villainsOf(region)?.teams[0];
    return t ? [{ region, name: t.name, person: t.person }] : [];
  });
}
