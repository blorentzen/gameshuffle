/**
 * Per-game data for tournament configuration (tracks, characters, items, build
 * restrictions), so the manage + public tournament surfaces can branch on
 * `tournaments.game_slug` instead of hardcoding MK8DX. Covers Mario Kart 8
 * Deluxe (4-part combos: character/vehicle/wheels/glider, engine class, drift)
 * and Mario Kart World (2-part combos: character/vehicle, no cc, no drift,
 * knockout rallies). Both draw from the same static JSON the randomizers use.
 */

import mk8dxData from "@/data/mk8dx-data.json";
import mkworldData from "@/data/mkworld-data.json";

export interface TournamentCourse {
  id: string; // stable `c{cupIdx}-t{courseIdx}` (handles duplicate names)
  name: string;
  img: string;
  icon?: string;
  cupIdx: number;
}

interface RawCup {
  name?: string;
  img?: string;
  courses: { name: string; img: string; icon?: string }[];
}

export interface TournamentGameData {
  gameSlug: string;
  label: string;
  cups: RawCup[];
  coursesWithIds: TournamentCourse[];
  cupName: (cupIdx: number) => string;
  characters: { name: string; img: string; weight?: string }[];
  items: { name: string; img: string; category?: string; rarity?: string }[];
  weights: string[]; // ordered, excludes "Any"
  vehicleTypes: string[]; // Kart / Bike / ATV
  hasDrift: boolean; // MK8DX inward/outward
  driftTypes: string[];
  hasCc: boolean; // MK8DX engine class
  raceCounts: number[];
  knockoutRallies: { name: string; img: string }[];
  /** Optional "random track" tile for guided selection (a mystery slot picked on
   *  the day). Set per game; absent = no random option. */
  randomTrackImg?: string;
}

const WEIGHT_ORDER = ["Light", "Medium", "Heavy"];
const VEHICLE_ORDER = ["Kart", "Bike", "ATV"];

function distinct(rows: Array<Record<string, unknown>>, key: string): string[] {
  return [...new Set(rows.map((r) => r[key]).filter((v): v is string => !!v && v !== "Any"))];
}

function ordered(values: string[], order: string[]): string[] {
  const known = order.filter((o) => values.includes(o));
  const extra = values.filter((v) => !order.includes(v));
  return [...known, ...extra];
}

function build(
  gameSlug: string,
  label: string,
  data: {
    cups?: RawCup[];
    characters?: { name: string; img: string; weight?: string }[];
    vehicles?: { name: string; img: string; type?: string; drift?: string }[];
    items?: { name: string; img: string; category?: string; rarity?: string }[];
    knockoutRallies?: { name: string; img: string }[];
  },
  opts: { hasDrift: boolean; hasCc: boolean; raceCounts: number[] },
): TournamentGameData {
  const cups = data.cups ?? [];
  const coursesWithIds: TournamentCourse[] = cups.flatMap((cup, cupIdx) =>
    (cup.courses ?? []).map((course, courseIdx) => ({
      id: `c${cupIdx}-t${courseIdx}`,
      name: course.name,
      img: course.img,
      icon: course.icon,
      cupIdx,
    })),
  );
  const vehicles = data.vehicles ?? [];
  return {
    gameSlug,
    label,
    cups,
    coursesWithIds,
    cupName: (i: number) => cups[i]?.name ?? `Cup ${i + 1}`,
    characters: data.characters ?? [],
    items: data.items ?? [],
    weights: ordered(distinct(data.characters ?? [], "weight"), WEIGHT_ORDER),
    vehicleTypes: ordered(distinct(vehicles, "type"), VEHICLE_ORDER),
    hasDrift: opts.hasDrift,
    driftTypes: opts.hasDrift ? distinct(vehicles, "drift") : [],
    hasCc: opts.hasCc,
    raceCounts: opts.raceCounts,
    knockoutRallies: data.knockoutRallies ?? [],
  };
}

const MK8DX: TournamentGameData = {
  ...build("mario-kart-8-deluxe", "Mario Kart 8 Deluxe", mk8dxData, {
    hasDrift: true,
    hasCc: true,
    raceCounts: [4, 6, 8, 12, 16, 24, 32, 48],
  }),
  // A "?" mystery-track slot for guided selection (picked on the day).
  randomTrackImg: "https://cdn.empac.co/gameshuffle/images/mk8dx/courses/random.png",
};

const MKWORLD = build("mario-kart-world", "Mario Kart World", mkworldData, {
  hasDrift: false,
  hasCc: false,
  raceCounts: [4, 6, 8, 12, 16, 32],
});

/**
 * Rich per-game data (tracks, cups, characters, build rules) for a tournament's
 * `game_slug`. Only the two Mario Kart games carry this today; any other game
 * returns null and the tournament runs on the game-agnostic engines (brackets /
 * points / heat→mains) with named participants — MK config is an optional layer.
 */
export function getTournamentGameData(gameSlug: string | null | undefined): TournamentGameData | null {
  if (gameSlug === "mario-kart-8-deluxe") return MK8DX;
  if (gameSlug === "mario-kart-world") return MKWORLD;
  return null;
}
