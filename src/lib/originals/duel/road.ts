/**
 * Trainer Road (picks 2026-10-23, https://claude.ai/artifact/Va86Xd5w5G44gPudmzsKDe, all as
 * recommended): every Daily Duel trainer, any time, grouped by region. Pure and client-safe: the
 * regions, which region each team belongs to, the sections of a region page, the month a duel
 * belongs to and the stars a run earns. The store is roadStore.ts.
 *
 * A trainer page is one person in one region (/pokemon-trainers/kanto/brock) with every team they
 * bring there; each team is its own duel, built ahead and the same for everyone for a month.
 */

import { personOf, TIER_LABEL } from "./rules";
import type { DuelTier, DuelTrainer } from "./types";

export interface RoadRegion {
  slug: string;
  name: string;
  /** What a Gym Leader is called there (Alola has island kahunas). */
  gymLabel: string;
}

export const ROAD_REGIONS: readonly RoadRegion[] = [
  { slug: "kanto", name: "Kanto", gymLabel: "Gym Leaders" },
  { slug: "johto", name: "Johto", gymLabel: "Gym Leaders" },
  { slug: "hoenn", name: "Hoenn", gymLabel: "Gym Leaders" },
  { slug: "sinnoh", name: "Sinnoh", gymLabel: "Gym Leaders" },
  { slug: "unova", name: "Unova", gymLabel: "Gym Leaders" },
  { slug: "kalos", name: "Kalos", gymLabel: "Gym Leaders" },
  { slug: "alola", name: "Alola", gymLabel: "Island kahunas" },
  { slug: "galar", name: "Galar", gymLabel: "Gym Leaders" },
  { slug: "paldea", name: "Paldea", gymLabel: "Gym Leaders" },
];

export const roadRegion = (slug: string): RoadRegion | null => ROAD_REGIONS.find((r) => r.slug === slug) ?? null;

/** Kanto's Gym towns: their leaders stay Kanto's in HeartGold and SoulSilver's post-game. */
const KANTO_TOWNS = /\b(Pewter|Cerulean|Vermilion|Celadon|Fuchsia|Saffron|Cinnabar|Viridian)\b/;

/** A villain team belongs to its home region, even in Ultra Sun's Team Rainbow Rocket. */
const TEAMS: [RegExp, string][] = [
  [/Team Rocket|Rainbow Rocket/, "kanto"],
  [/Team Aqua|Team Magma/, "hoenn"],
  [/Team Galactic/, "sinnoh"],
  [/Team Plasma/, "unova"],
  [/Team Flare/, "kalos"],
  [/Team Skull|Aether/, "alola"],
];

/** A region named in the title ("Champion of Sinnoh", "Former Champion of Kanto") wins over the game: Cynthia in Unova's Undella Town is still Sinnoh's Champion. */
const TITLE_REGION = /\bof (Kanto|Johto|Hoenn|Sinnoh|Unova|Kalos|Alola|Galar|Paldea)\b/;

/** The region of a game, by its name. Legends: Arceus (old Sinnoh) counts as Sinnoh. */
const GAMES: [RegExp, string][] = [
  [/HeartGold|SoulSilver|Gold, Silver|Crystal/, "johto"],
  [/FireRed|LeafGreen|Let's Go|Yellow|Red and Blue/, "kanto"],
  [/Ruby|Sapphire|Emerald/, "hoenn"],
  [/Diamond|Pearl|Platinum|Legends: Arceus/, "sinnoh"],
  [/Black|White/, "unova"],
  [/Pokémon X|\bX and Y\b/, "kalos"],
  [/Sun|Moon/, "alola"],
  [/Sword|Shield/, "galar"],
  [/Scarlet|Violet/, "paldea"],
];

/** Which region a team belongs to: its title first (Kanto's Gym towns, villain teams, a region named in it), else its game. */
export function regionOf(t: Pick<DuelTrainer, "title" | "game" | "tier">): string | null {
  if (t.tier === "gym" && KANTO_TOWNS.test(t.title)) return "kanto";
  for (const [re, slug] of TEAMS) if (re.test(t.title)) return slug;
  const named = t.title.match(TITLE_REGION);
  if (named) return named[1].toLowerCase();
  for (const [re, slug] of GAMES) if (re.test(t.game)) return slug;
  return null;
}

/** The games in release order: a person's teams list earliest first (a rematch right after its game). */
const RELEASE: RegExp[] = [
  /Red and Blue/, /Yellow/, /Gold, Silver|Crystal/, /Ruby, Sapphire|^Pokémon Ruby/, /FireRed|LeafGreen/, /Emerald/, /Diamond and Pearl/, /Platinum/,
  /HeartGold|SoulSilver/, /Black 2|White 2/, /Black|White/, /Pokémon X|X and Y/, /Omega Ruby|Alpha Sapphire/, /Ultra Sun|Ultra Moon/, /Sun|Moon/,
  /Let's Go/, /Sword|Shield/, /Brilliant Diamond|Shining Pearl/, /Legends: Arceus/, /Indigo Disk/, /Scarlet|Violet/,
];
// Black 2 before Black and Ultra Sun before Sun only so the more specific name matches first; the years decide the order.
const YEAR = [1998, 1999, 2000, 2002, 2004, 2004.5, 2006, 2008, 2009, 2012, 2010, 2013, 2014, 2017, 2016, 2018, 2019, 2021, 2022, 2023.9, 2022.9];
const gameYear = (game: string) => {
  const i = RELEASE.findIndex((re) => re.test(game));
  return (i < 0 ? 2100 : YEAR[i]) + (/rematch|post-game|title defense|Academy Ace/i.test(game) ? 0.5 : 0);
};

/** A region page's sections, in order. */
export const ROAD_SECTIONS: readonly DuelTier[] = ["gym", "elite", "champion", "rival", "boss"];

/**
 * Whether a team's title really holds its tier's role. The Duel's tiers set the difficulty, so a few
 * teams sit in a tier their person didn't hold in that game: Molayne's Sun and Moon title defense (a
 * trial captain then, Elite Four only in Ultra Sun), and Alola's last battles (Kukui and Hau challenge
 * the player for the new title; Alola had no Champion before). Re-checked 2026-10-23.
 */
const ROLE: Partial<Record<DuelTier, RegExp>> = { elite: /Elite Four/, champion: /^(Champion of|Former Champion|Top Champion)/ };
export const holdsRole = (t: Pick<DuelTrainer, "tier" | "title">) => ROLE[t.tier]?.test(t.title) ?? true;

/** A team's role as its page shows it: the tier's name, or the title itself when the title doesn't hold that role. */
export function teamRole(t: Pick<DuelTrainer, "tier" | "title">): string {
  if (holdsRole(t)) return TIER_LABEL[t.tier];
  return t.tier === "champion" ? "Final battle" : t.title;
}

export function sectionLabel(tier: DuelTier, region: RoadRegion, count: number, real = true): string {
  if (tier === "gym") return region.gymLabel;
  if (tier === "elite") return "Elite Four";
  if (tier === "champion") return real ? (count === 1 ? "Champion" : "Champions") : (count === 1 ? "Final battle" : "Final battles");
  if (tier === "rival") return "Rivals";
  return "Villain team bosses";
}

/** One person in one region, with every team they bring there (earliest game first). */
export interface RoadPerson {
  slug: string;
  name: string;
  region: string;
  /** Their tiers in this region, in section order. */
  tiers: DuelTier[];
  teams: DuelTrainer[];
}

/** The road: each region's people, in roster order, each with their teams earliest game first. */
export function roadPeople(trainers: readonly DuelTrainer[]): Map<string, RoadPerson[]> {
  const out = new Map<string, RoadPerson[]>(ROAD_REGIONS.map((r) => [r.slug, []]));
  for (const t of trainers) {
    const region = regionOf(t);
    if (!region || !out.has(region)) continue;
    const list = out.get(region)!;
    const slug = personOf(t);
    let p = list.find((x) => x.slug === slug);
    if (!p) { p = { slug, name: t.name, region, tiers: [], teams: [] }; list.push(p); }
    p.teams.push(t);
    if (!p.tiers.includes(t.tier)) p.tiers.push(t.tier);
  }
  for (const list of out.values()) for (const p of list) {
    p.tiers.sort((a, b) => ROAD_SECTIONS.indexOf(a) - ROAD_SECTIONS.indexOf(b));
    p.teams = p.teams.map((t, i) => ({ t, i })).sort((a, b) => gameYear(a.t.game) - gameYear(b.t.game) || a.i - b.i).map((x) => x.t);
  }
  return out;
}

/**
 * Each region's people in the order the games meet them (Gym badges in order, the Elite Four in
 * battle order, then the Champions); anyone not listed follows in roster order.
 */
const ORDER: Record<string, readonly string[]> = {
  kanto: ["brock", "misty", "lt-surge", "erika", "koga", "janine", "sabrina", "blaine", "giovanni", "lorelei", "bruno", "agatha", "lance", "blue", "red"],
  johto: ["falkner", "bugsy", "whitney", "morty", "chuck", "jasmine", "pryce", "clair", "will", "koga", "bruno", "karen", "lance"],
  hoenn: ["roxanne", "brawly", "wattson", "flannery", "norman", "winona", "tate-liza", "juan", "wallace", "sidney", "phoebe", "glacia", "drake", "steven"],
  sinnoh: ["roark", "gardenia", "maylene", "crasher-wake", "fantina", "byron", "candice", "volkner", "aaron", "bertha", "flint", "lucian", "cynthia"],
  unova: ["cilan", "cheren", "lenora", "roxie", "burgh", "elesa", "clay", "skyla", "brycen", "drayden", "iris", "marlon", "shauntal", "grimsley", "caitlin", "marshal", "alder", "cynthia"],
  kalos: ["viola", "grant", "korrina", "ramos", "clemont", "valerie", "olympia", "wulfric", "malva", "siebold", "wikstrom", "drasna", "diantha"],
  alola: ["hala", "olivia", "nanu", "hapu", "molayne", "acerola", "kahili", "kukui", "hau"],
  galar: ["milo", "nessa", "kabu", "bea", "allister", "opal", "gordie", "melony", "piers", "raihan", "leon"],
  paldea: ["katy", "brassius", "iono", "kofu", "larry", "ryme", "tulip", "grusha", "rika", "poppy", "hassel", "crispin", "amarys", "lacey", "drayton", "geeta", "kieran"],
};

const rank = (region: string, slug: string) => {
  const i = ORDER[region]?.indexOf(slug) ?? -1;
  return i < 0 ? 999 : i;
};

/** A region's sections: each tier with the people who have a team in it there, in the order the games meet them. */
export function regionSections(people: readonly RoadPerson[]): { tier: DuelTier; people: RoadPerson[] }[] {
  return ROAD_SECTIONS.map((tier) => ({
    tier,
    people: people.filter((p) => p.tiers.includes(tier)).map((p, i) => ({ p, i })).sort((a, b) => rank(a.p.region, a.p.slug) - rank(b.p.region, b.p.slug) || a.i - b.i).map((x) => x.p),
  })).filter((s) => s.people.length);
}

/** One person's page in a region (null when they have no team there). */
export function roadPerson(trainers: readonly DuelTrainer[], region: string, slug: string): RoadPerson | null {
  return roadPeople(trainers).get(region)?.find((p) => p.slug === slug) ?? null;
}

/** A trainer page's address. */
export const roadPath = (region: string, slug?: string) => `/pokemon-trainers/${region}${slug ? `/${slug}` : ""}`;

/** The month a Trainer Road duel belongs to ("2026-10-01"): duels are rebuilt each Pacific month. */
export const roadMonth = (pacificDay: string) => `${pacificDay.slice(0, 8)}01`;

/** Stars for a run (picks: win, win within 2 turns of par, par or better). */
export function roadStars(won: boolean, turns: number, par: number): 0 | 1 | 2 | 3 {
  if (!won) return 0;
  if (turns <= par) return 3;
  if (turns <= par + 2) return 2;
  return 1;
}

/** Turns a team's game into a short label for a team picker ("FireRed and LeafGreen", "HeartGold and SoulSilver (rematch)"). */
export const gameLabel = (game: string) => game.replace(/^Pokémon:?\s*/, "");
