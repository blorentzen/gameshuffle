/**
 * Shuffle Kart's content, in one place (pure, client-safe): every name (the
 * track, the cups and maps, the karts, the wheels, the items, the cast, the
 * twists), the track's shape, its props and every color it's painted in.
 * Names are Britton's picks (2026-11-12); swapping any of them is an edit to
 * this file only. How each kart drives lives in TUNING (physics.ts), keyed by
 * the ids below. The racers' 1-5 stats, their quirks, the items and the Item
 * Box rows only count in races against the cast (field.ts, quirks.ts, items.ts,
 * grandprix.ts); the time trial ignores them.
 */

import type { TileTone } from "@/components/ui/IconTile";
import type { AvatarOptions } from "@/lib/avatar/dicebear";
import type { WeightClass } from "./physics";
import type { TrackDef } from "./track";

// ───────────────────────── Track ─────────────────────────

/** Colors the track is painted in (the 3D world and the map). */
export interface TrackLook {
  /** Lawn, mown in two shades. */
  grass: [string, string];
  road: string;
  roadSpeck: string;
  edgeLine: string;
  centerLine: string;
  curb: [string, string];
  /** The concrete curb along the straights, and the sidewalks. */
  concrete: string;
  sidewalk: string;
  /** The hedge around the edge of the world (where the walls are). */
  boundary: string;
  boundaryTop: string;
  /** Haze at the horizon and in the distance (also the fog), as 0..1 RGB. */
  haze: [number, number, number];
  puddle: string;
  puddleEdge: string;
  ramp: string;
  rampSide: string;
  /** The ramp's lip: hazard stripes. */
  rampLip: [string, string];
  finish: [string, string];
  /** The start/finish arch: posts and trim. */
  arch: [string, string];
  /** Zenith and horizon. */
  sky: [string, string];
  /** The sun and the sky's fill light. */
  sun: string;
  fill: [string, string];
  /** Houses round the outside: roofs, walls, trim, doors, garage doors, glass. */
  homes: { roofs: string[]; walls: string[]; trim: string; doors: string[]; garage: string; glass: string };
  /** Trees and bushes: leaf shades and trunks. */
  leaves: string[];
  trunk: string;
  fence: string;
  soil: string;
}

export type PropKind = "tree" | "bush" | "cone" | "rock" | "island" | "mailbox" | "stand" | "car" | "sprinkler";

/** How each prop is drawn (simple shapes in these colors). */
export const PROP_LOOK: Record<PropKind, { name: string; colors: string[] }> = {
  tree: { name: "Tree", colors: ["#2f7d3a", "#3f9a48", "#6b4a2b", "#b0563b"] },
  bush: { name: "Bush", colors: ["#2f7d3a", "#48a454"] },
  cone: { name: "Cone", colors: ["#f07a1c", "#ffffff", "#2b3040"] },
  rock: { name: "Rock", colors: ["#8d8f99", "#b2b5bf"] },
  island: { name: "Island", colors: ["#c9ccd2", "#3f9a48", "#2f7d3a"] },
  mailbox: { name: "Mailbox", colors: ["#3d6ff0", "#6b4a2b", "#e5533c"] },
  stand: { name: "Lemonade stand", colors: ["#f6d743", "#ffffff", "#c99a63", "#e8c25a"] },
  car: { name: "Parked car", colors: ["#6aa6d8", "#2b3040", "#dfe9f2"] },
  sprinkler: { name: "Sprinkler", colors: ["#2b3040", "#cfe8ff"] },
};

export const TRACK_LOOK: TrackLook = {
  grass: ["#62ab4f", "#57a046"],
  road: "#5d636f",
  roadSpeck: "#6d7480",
  edgeLine: "#f4f4f2",
  centerLine: "#f2c94c",
  curb: ["#d8323e", "#f4f4f2"],
  concrete: "#d3d0c8",
  sidewalk: "#dedbd2",
  boundary: "#2e6b34",
  boundaryTop: "#3f8a45",
  haze: [0.82, 0.9, 0.96],
  puddle: "#3f8fd6",
  puddleEdge: "#2a679f",
  ramp: "#d9b27c",
  rampSide: "#a77e4a",
  rampLip: ["#f2c94c", "#2b3040"],
  finish: ["#ffffff", "#15182a"],
  arch: ["#f7f7f5", "#2f66ec"],
  sky: ["#5b9ce8", "#d2e8fb"],
  sun: "#fff1d8",
  fill: ["#d9ecff", "#7d9a5a"],
  homes: {
    roofs: ["#8a4b3c", "#5d6474", "#9a6a4e", "#4b5a73", "#6f4a3f"],
    walls: ["#efe4d2", "#d9e2ea", "#f3d9c2", "#e3e8d6", "#f1ead9", "#d8e4dd"],
    trim: "#fbfbf8",
    doors: ["#2f66ec", "#b42318", "#1d7a3a", "#5a3fd6", "#3b3f4c"],
    garage: "#eceae4",
    glass: "#9fc7ea",
  },
  leaves: ["#2f7d3a", "#3f9a48", "#4c9f3c", "#367f44"],
  trunk: "#6b4a2b",
  fence: "#fbfbf8",
  soil: "#6b4a2b",
};

/**
 * The first track, Maple Heights (Day Cup): a suburban loop with curbs and
 * sidewalks, a wide bend round a planted island, a puddle, a ramp, and houses
 * all round the hedge. Props are drawn by kind (PROP_LOOK); r is the collider
 * (0 = scenery you drive through), so changing a prop's kind never changes how
 * the track drives.
 */
export const FIRST_TRACK: TrackDef = {
  id: "maple-heights",
  name: "Maple Heights",
  world: 2048,
  table: { x0: 96, y0: 192, x1: 1952, y1: 1856 },
  halfWidth: 64,
  points: [
    { x: 700, y: 1560 },
    { x: 1150, y: 1585 },
    { x: 1520, y: 1530 },
    { x: 1735, y: 1340 },
    { x: 1760, y: 1180, w: 118 },
    { x: 1760, y: 960, w: 118 },
    { x: 1730, y: 780 },
    { x: 1620, y: 600 },
    { x: 1390, y: 470 },
    { x: 1120, y: 540 },
    { x: 860, y: 450 },
    { x: 590, y: 480 },
    { x: 400, y: 640 },
    { x: 420, y: 860 },
    { x: 640, y: 965 },
    { x: 1040, y: 965 },
    { x: 1270, y: 1060 },
    { x: 1190, y: 1250 },
    { x: 880, y: 1270 },
    { x: 600, y: 1230 },
    { x: 380, y: 1330 },
    { x: 390, y: 1490 },
  ],
  gates: 12,
  gateMargin: 90,
  startBack: 34,
  props: [
    // On the road: drive round it either side.
    { kind: "island", x: 1760, y: 1070, r: 42, h: 46 },
    // Infields.
    { kind: "tree", x: 1000, y: 740, r: 26, h: 96 },
    { kind: "bush", x: 760, y: 700, r: 24, h: 30 },
    { kind: "cone", x: 1245, y: 790, r: 9, h: 18 },
    { kind: "cone", x: 1282, y: 806, r: 9, h: 18 },
    { kind: "tree", x: 560, y: 760, r: 26, h: 96 },
    { kind: "stand", x: 900, y: 1112, r: 30, h: 26 },
    { kind: "bush", x: 1460, y: 1250, r: 24, h: 30 },
    { kind: "mailbox", x: 1545, y: 1100, r: 8, h: 30 },
    { kind: "cone", x: 640, y: 1395, r: 9, h: 18 },
    { kind: "cone", x: 1000, y: 1420, r: 9, h: 18 },
    // Around the edge.
    { kind: "tree", x: 890, y: 300, r: 26, h: 96 },
    { kind: "tree", x: 1150, y: 1720, r: 26, h: 96 },
    { kind: "car", x: 330, y: 1720, r: 30, h: 26 },
    { kind: "bush", x: 1810, y: 1700, r: 24, h: 30 },
    { kind: "tree", x: 220, y: 330, r: 26, h: 96 },
    { kind: "tree", x: 1800, y: 340, r: 26, h: 96 },
    { kind: "bush", x: 200, y: 1000, r: 24, h: 30 },
    { kind: "bush", x: 200, y: 1060, r: 24, h: 30 },
    // Sprinklers on the lawns (scenery: you drive through the spray).
    { kind: "sprinkler", x: 250, y: 1400, r: 0, h: 4 },
    { kind: "sprinkler", x: 1330, y: 300, r: 0, h: 4 },
    { kind: "sprinkler", x: 1380, y: 1720, r: 0, h: 4 },
  ],
  slick: [
    { x: 870, y: 428, r: 30 },
    { x: 842, y: 452, r: 22 },
    { x: 902, y: 448, r: 24 },
    { x: 930, y: 430, r: 14 },
  ],
  ramp: { near: [770, 965], length: 84, halfWidth: 44, height: 12 },
  // Flat patches on the grass (flower beds, in tile colors).
  mats: [
    { x: 560, y: 1660, w: 170, h: 60, angle: 0.04, tone: "magenta" },
    { x: 1640, y: 470, w: 150, h: 60, angle: -0.6, tone: "orange" },
    { x: 260, y: 760, w: 60, h: 170, angle: 0.06, tone: "violet" },
    { x: 1320, y: 1700, w: 160, h: 60, angle: -0.05, tone: "red" },
  ],
  coasters: [],
  laps: 3,
  // Item Box rows (races with items only): on the start straight, the long left
  // bend, before the ramp and on the back straight, away from the island,
  // the puddle and the ramp itself.
  boxes: [
    { at: 0.06, lanes: [-0.6, -0.2, 0.2, 0.6] },
    { at: 0.3, lanes: [-0.6, -0.2, 0.2, 0.6] },
    { at: 0.61, lanes: [-0.6, -0.2, 0.2, 0.6] },
    { at: 0.81, lanes: [-0.6, -0.2, 0.2, 0.6] },
  ],
};

export const TRACKS: Record<string, TrackDef> = { [FIRST_TRACK.id]: FIRST_TRACK };

/** The cups and their maps (Britton's picks, 2026-11-12). Only Maple Heights is built; the rest are the plan. */
export type CupId = "day" | "night";
export const CUPS: Record<CupId, { id: CupId; name: string }> = {
  day: { id: "day", name: "Day Cup" },
  night: { id: "night", name: "Night Cup" },
};

export interface MapPlan {
  id: string;
  name: string;
  cup: CupId;
  /** Where it is and what's on it. */
  setting: string;
  features: string[];
  /** In TRACKS and playable. */
  built: boolean;
}

export const MAPS: MapPlan[] = [
  { id: "maple-heights", name: "Maple Heights", cup: "day", setting: "A suburb", features: ["cul-de-sacs", "sprinklers", "a garage shortcut"], built: true },
  { id: "harbor-point", name: "Harbor Point", cup: "day", setting: "The docks", features: ["a fish market", "forklifts", "a drawbridge"], built: false },
  { id: "highway-9", name: "Highway 9", cup: "day", setting: "A desert highway past a diner and a truck stop", features: ["one big jump"], built: false },
  { id: "pine-ridge", name: "Pine Ridge", cup: "day", setting: "Mountain switchbacks up to a ski lodge", features: ["switchbacks", "a ski lodge"], built: false },
  { id: "downtown-loop", name: "Downtown Loop", cup: "night", setting: "The city at night", features: ["neon", "taxis"], built: false },
  { id: "terminal-4", name: "Terminal 4", cup: "night", setting: "An airport after the last flight", features: ["moving walkways", "a baggage carousel"], built: false },
  { id: "riverside-mall", name: "Riverside Mall", cup: "night", setting: "An empty mall", features: ["escalators", "a fountain jump", "shutters"], built: false },
  { id: "sunset-boardwalk", name: "Sunset Boardwalk", cup: "night", setting: "A beach boardwalk and pier", features: ["the boardwalk", "the pier"], built: false },
];

/** The cup a track belongs to (for the roll card). */
export function cupOf(trackId: string): string | null {
  const m = MAPS.find((x) => x.id === trackId);
  return m ? CUPS[m.cup].name : null;
}

// ───────────────────────── Karts ─────────────────────────

/**
 * The karts are everyday rides. Their ids stay box/round/low because TUNING.parts
 * (how each drives) and saved ghosts use them; the names and models are new.
 */
export type BodyId = "box" | "round" | "low";
export type WheelId = "chunky" | "slim" | "small";
/** Rides that are modeled but not dealt yet (they join the roll once all eight look right). */
export type WaitingBodyId = "scooter" | "moped" | "sedan" | "icecream" | "mower";
/** Any ride the renderer can draw. */
export type RideId = BodyId | WaitingBodyId;

export interface Body {
  id: RideId;
  name: string;
  /** What it is, in a few words. */
  what: string;
  /** The weight class it's built for (a label: how it drives is TUNING.parts). */
  size: WeightClass;
}

export const BODIES: Record<BodyId, Body> = {
  box: { id: "box", name: "Minivan", what: "a family minivan, driven from the sunroof", size: "heavy" },
  round: { id: "round", name: "Shopping Cart", what: "a shopping cart with a seat in the basket", size: "light" },
  low: { id: "low", name: "Golf Cart", what: "a two-seat golf cart with a sunshade", size: "medium" },
};

/**
 * Built and drawn, but not in the roll yet (Britton: they join once all eight
 * look good). `drivesLike` is the body whose TUNING.parts they'll borrow.
 */
export const WAITING_BODIES: Record<WaitingBodyId, Body & { drivesLike: BodyId }> = {
  scooter: { id: "scooter", name: "Rental Scooter", what: "a stand-up rental scooter", size: "light", drivesLike: "round" },
  moped: { id: "moped", name: "Moped", what: "a small moped with a top box", size: "light", drivesLike: "round" },
  sedan: { id: "sedan", name: "Hand-Me-Down Sedan", what: "an old family sedan with the roof cut off", size: "medium", drivesLike: "low" },
  icecream: { id: "icecream", name: "Ice Cream Truck", what: "an ice cream truck, driven from the serving hatch", size: "heavy", drivesLike: "box" },
  mower: { id: "mower", name: "Riding Mower", what: "a ride-on lawn mower", size: "medium", drivesLike: "low" },
};

/** Any ride the renderer can draw (the roll's three and the five waiting). */
export function isRideId(id: string): id is RideId {
  return id in BODIES || id in WAITING_BODIES;
}

export function rideName(id: string): string {
  return (BODIES as Record<string, Body>)[id]?.name ?? (WAITING_BODIES as Record<string, Body>)[id]?.name ?? id;
}

export interface Wheels { id: WheelId; name: string; what: string }

export const WHEELS: Record<WheelId, Wheels> = {
  chunky: { id: "chunky", name: "Chunky Tires", what: "wide tires" },
  slim: { id: "slim", name: "Slim Tires", what: "narrow tires" },
  small: { id: "small", name: "Small Wheels", what: "small wheels" },
};

// ───────────────────────── Items ─────────────────────────

/** Items. What each one does, in numbers, and the odds by place live in items.ts (the time trial has none). */
export interface ItemDef {
  id: string;
  name: string;
  /** What it does, in a line. */
  line: string;
  /** Rare items come up less, and mostly for racers near the back. */
  rare?: boolean;
}

export const ITEMS: ItemDef[] = [
  { id: "heat-seeker", name: "Heat Seeker", line: "Flies to whoever is in first.", rare: true },
  { id: "homing-missile", name: "Homing Missile", line: "Locks on to the racer just ahead." },
  { id: "dart-blaster", name: "Dart Blaster", line: "Fires straight where you aim and bounces off walls." },
  { id: "oil-slick", name: "Oil Slick", line: "Dropped behind you; spins out whoever drives through it." },
  { id: "coffee", name: "Coffee", line: "A small boost." },
  { id: "energy-drink", name: "Energy Drink", line: "A longer boost." },
  { id: "shield", name: "Shield", line: "Blocks the next hit." },
  { id: "shockwave", name: "Shockwave", line: "Everyone ahead of you slows for a moment.", rare: true },
  { id: "smoke-bomb", name: "Smoke Bomb", line: "Clouds the view of the racer ahead for two seconds." },
];

export const ITEM_BOX = { name: "Item Box", line: "Drive through one for a random item." };

// ───────────────────────── Twists ─────────────────────────

export type TwistId = "none" | "mirror";

export const TWISTS: Record<TwistId, { id: TwistId; name: string; line: string }> = {
  none: { id: "none", name: "No twist", line: "The track as it is." },
  mirror: { id: "mirror", name: "Mirror", line: "The track flipped left to right." },
};

// ───────────────────────── Cast ─────────────────────────

/** A racer's numbers, 1 to 5 (races against the cast read them through field.ts; the time trial doesn't). */
export interface RacerStats {
  speed: number;
  start: number;
  handling: number;
  weight: number;
}

export interface CastMember {
  id: string;
  name: string;
  /** Who they are, in two or three words. */
  archetype: string;
  stats: RacerStats;
  /** Their quirk, in a line (what it does in numbers is in quirks.ts). */
  quirk: string;
  /** Jersey (and kart) color. */
  tone: TileTone;
  /** DiceBear Adventurer seed and look (fixed, so they look the same for everyone). */
  seed: string;
  look: AvatarOptions;
  /** Racing number (on their helmet, jersey and plate). */
  number: number;
  /** Wears a helmet unless the player turns it off (the modeled look). */
  helmet: boolean;
}

/** The weight class a racer drives in, from their Weight number (1-2 light, 3 medium, 4-5 heavy). */
export function weightClassOf(weight: number): WeightClass {
  return weight <= 2 ? "light" : weight >= 4 ? "heavy" : "medium";
}

/** The roll's cast (Britton's picks, 2026-11-12). Looks from the picks page's drawings. */
export const CAST: CastMember[] = [
  { id: "max", name: "Max", archetype: "The Tryhard", stats: { speed: 5, start: 2, handling: 3, weight: 3 }, quirk: "Perfect starts are twice as easy.", tone: "violet", seed: "kart-max", look: { hair: "short04", hairColor: "0e0e0e", glasses: "none" }, number: 1, helmet: true },
  { id: "gary", name: "Gary", archetype: "The Dad", stats: { speed: 3, start: 2, handling: 5, weight: 5 }, quirk: "Never slips on an Oil Slick.", tone: "teal", seed: "kart-gary", look: { hair: "short09", hairColor: "6a4e35", glasses: "variant01" }, number: 2, helmet: true },
  { id: "cam", name: "Cam", archetype: "The Streamer", stats: { speed: 3, start: 4, handling: 3, weight: 3 }, quirk: "Once a race, chat pulls through: a free boost after getting hit.", tone: "magenta", seed: "kart-cam", look: { hair: "long12", hairColor: "cb6820", glasses: "none" }, number: 3, helmet: false },
  { id: "skip", name: "Skip", archetype: "The Speedrunner", stats: { speed: 4, start: 4, handling: 2, weight: 1 }, quirk: "Drift boosts charge faster.", tone: "green", seed: "kart-skip", look: { hair: "short15", hairColor: "3eac2c", glasses: "variant04" }, number: 4, helmet: true },
  { id: "felix", name: "Felix", archetype: "The Casual", stats: { speed: 2, start: 5, handling: 3, weight: 2 }, quirk: "Better odds from every Item Box.", tone: "orange", seed: "kart-felix", look: { hair: "long03", hairColor: "e5d7a3", glasses: "none" }, number: 5, helmet: false },
  { id: "al", name: "Al", archetype: "The Rage Quitter", stats: { speed: 5, start: 3, handling: 2, weight: 4 }, quirk: "Spins out longer when hit, then gets an angry boost.", tone: "red", seed: "kart-al", look: { hair: "short06", hairColor: "ab2a18", glasses: "none" }, number: 6, helmet: true },
  { id: "miles", name: "Miles", archetype: "The Grinder", stats: { speed: 4, start: 3, handling: 4, weight: 3 }, quirk: "A little faster for every place gained.", tone: "blue", seed: "kart-miles", look: { hair: "long19", hairColor: "592454", glasses: "variant02" }, number: 7, helmet: false },
  { id: "pip", name: "Pip", archetype: "The Little Sibling", stats: { speed: 4, start: 5, handling: 1, weight: 1 }, quirk: "So small it's harder to hit; the steering wanders a little.", tone: "orange", seed: "kart-pip", look: { hair: "short01", hairColor: "dba3be", glasses: "none" }, number: 8, helmet: true },
];

/**
 * The working cast's ids (before Britton's picks) and who they became, by
 * weight class, so ghosts and keys saved with an old id still read.
 */
export const CAST_RENAMED: Record<string, string> = {
  rory: "gary",
  dee: "al",
  bram: "gary",
  juno: "skip",
  sol: "felix",
  kit: "pip",
  mika: "max",
  tash: "cam",
};

/** You drive as a medium kart, in GameShuffle blue. */
export const YOU_NAME = "You";
export const YOU_WEIGHT: WeightClass = "medium";
export const YOU_TONE: TileTone = "blue";
/** Your racing number until you pick one (a setting to come; ?num= in development). */
export const YOU_NUMBER = 0;
/** Your modeled racer shows your head until you put a helmet on. */
export const YOU_HELMET = false;
