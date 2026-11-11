/**
 * Ready-made split lists (speedrun templates picks 2026-11-10, all as recommended), from game data GameShuffle already
 * keeps, so nothing comes from outside: Mario Kart 8 Deluxe, World and 64 (every track, cups as LiveSplit groups, or
 * one split a cup), Kirby Air Riders (the 18 Air Ride courses) and Pokémon FireRed and LeafGreen (Any%: the Gym Leaders,
 * the Elite Four and the Champion). Every other game gets the number builder (`numberedSplits`), typing, or its own
 * LiveSplit file, so this never makes speedrunning a Mario Kart tool. Served by /api/speedrun/templates (the data
 * files stay off the setup page's bundle). Pure.
 */

import mk8dx from "@/data/mk8dx-data.json";
import mkworld from "@/data/mkworld-data.json";
import mk64 from "@/data/mk64-data.json";
import { AIR_RIDERS } from "@/data/kirby/air-riders";
import { gameKey } from "@/lib/games/key";
import { groupedNames, type SplitGroup } from "./splitGroups";

export interface SplitTemplate {
  id: string;
  name: string;
  /** "12 cups, the base game". */
  note: string;
  groups: SplitGroup[];
  /** Mario Kart: split on every track (cups as groups) or one split a cup. */
  byCup?: boolean;
  /** "One cup": the runner picks which (its groups are every cup; one is used). */
  pickCup?: boolean;
}

export interface GameTemplates {
  game: string;
  templates: SplitTemplate[];
  /** Speeds to pick for the category ("150cc", "200cc", "Mirror"), and whether items are a choice. */
  speeds: string[];
  items: boolean;
}

type CupData = { cups: { name: string; courses: { name: string; type?: string }[] }[] };

/** Every cup's tracks; a track whose name repeats in the game gets its console, as the game shows it ("N64 Rainbow Road"). */
function cupsOf(data: CupData): SplitGroup[] {
  const all = data.cups.flatMap((c) => c.courses);
  const uses = new Map<string, number>();
  for (const c of all) uses.set(c.name, (uses.get(c.name) ?? 0) + 1);
  return data.cups.map((cup) => ({
    group: `${cup.name} Cup`,
    names: cup.courses.map((c) => ((uses.get(c.name) ?? 0) > 1 && c.type && c.type !== "Standard" ? `${c.type} ${c.name}` : c.name)),
  }));
}

const cupTemplate = (id: string, name: string, note: string, groups: SplitGroup[]): SplitTemplate => ({ id, name, note, groups, byCup: true });

const MK8 = cupsOf(mk8dx as unknown as CupData);
const MKW = cupsOf(mkworld as unknown as CupData);
const MK64 = cupsOf(mk64 as unknown as CupData);

/** The Gym Leaders in badge order (checked against the Fire Red run's data in the tests), then the Elite Four. */
export const FRLG_GYMS = ["Brock", "Misty", "Lt. Surge", "Erika", "Koga", "Sabrina", "Blaine", "Giovanni"];
const FRLG_LEAGUE = ["Lorelei", "Bruno", "Agatha", "Lance", "Champion"];

const GAMES: Record<string, Omit<GameTemplates, "game">> = {
  "mario-kart-8-deluxe": {
    speeds: ["150cc", "200cc", "Mirror"],
    items: true,
    templates: [
      cupTemplate("48-tracks", "48 Tracks", "12 cups, the base game", MK8.slice(0, 12)),
      cupTemplate("nitro", "Nitro Tracks", "16 tracks, 4 cups", MK8.slice(0, 4)),
      cupTemplate("retro", "Retro Tracks", "16 tracks, 4 cups", MK8.slice(4, 8)),
      cupTemplate("bonus", "Bonus Tracks", "16 tracks, 4 cups", MK8.slice(8, 12)),
      cupTemplate("booster", "Booster Course", "48 tracks, 12 cups", MK8.slice(12, 24)),
      cupTemplate("96-tracks", "96 Tracks", "Every track, 24 cups", MK8),
      { id: "cup", name: "One cup", note: "4 tracks", groups: MK8, pickCup: true },
    ],
  },
  "mario-kart-world": {
    speeds: ["150cc", "Mirror"],
    items: true,
    templates: [
      cupTemplate("32-tracks", "32 Tracks", "8 cups", MKW),
      { id: "cup", name: "One cup", note: "4 tracks", groups: MKW, pickCup: true },
    ],
  },
  "mario-kart-64": {
    speeds: ["150cc", "Extra"],
    items: false,
    templates: [
      cupTemplate("16-tracks", "16 Tracks", "4 cups", MK64),
      { id: "cup", name: "One cup", note: "4 tracks", groups: MK64, pickCup: true },
    ],
  },
  "kirby-air-riders": {
    speeds: [],
    items: false,
    templates: [{ id: "air-ride", name: "All Courses", note: "The 18 Air Ride courses", groups: [{ group: null, names: AIR_RIDERS.airRideCourses.map((c) => c.name) }] }],
  },
  "pokemon-firered-leafgreen": {
    speeds: [],
    items: false,
    templates: [{ id: "any", name: "Any%", note: "8 Gym Leaders, the Elite Four and the Champion", groups: [{ group: "Badges", names: FRLG_GYMS }, { group: "Pokémon League", names: FRLG_LEAGUE }] }],
  },
};

/** A game's templates (any way the game is named), or null when there's no ready-made list for it. */
export function templatesFor(game: string | null | undefined): GameTemplates | null {
  const key = gameKey(game);
  const g = key ? GAMES[key] : null;
  return g && key ? { game: key, ...g } : null;
}

export interface TemplateChoice {
  /** One split a cup instead of one a track (Mario Kart). */
  byCup?: boolean;
  /** "One cup": which cup (its index in the template's groups). */
  cup?: number;
  speed?: string | null;
  /** true = "Items", false = "No Items", null/undefined = not said. */
  items?: boolean | null;
}

/** The split names (groups marked the way LiveSplit writes them) and the category a choice makes. */
export function buildTemplate(t: SplitTemplate, choice: TemplateChoice = {}): { names: string[]; category: string; count: number } {
  let groups = t.groups;
  let name = t.name;
  if (t.pickCup) {
    const g = t.groups[Math.min(Math.max(0, choice.cup ?? 0), t.groups.length - 1)];
    groups = [g];
    name = g.group ?? name;
  }
  const names = t.byCup && choice.byCup ? groups.map((g) => g.group ?? "").filter(Boolean) : groupedNames(groups);
  const category = [name, choice.speed || null, choice.items == null ? null : choice.items ? "Items" : "No Items"].filter(Boolean).join(" · ");
  return { names, category, count: names.length };
}

/** "World 1 … World 8", plus an optional last split (the number builder, for any game). Null when it can't be made. */
export function numberedSplits(o: { name: string; from: number; to: number; last?: string }): string[] | null {
  const name = o.name.replace(/\s+/g, " ").trim().slice(0, 100);
  const from = Math.floor(o.from), to = Math.floor(o.to);
  if (!name || !Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to < from || to - from >= 499) return null;
  const out = Array.from({ length: to - from + 1 }, (_, i) => `${name} ${from + i}`);
  const last = (o.last ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (last) out.push(last);
  return out;
}

