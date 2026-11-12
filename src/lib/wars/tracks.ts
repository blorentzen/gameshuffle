/**
 * The tracks a war is raced on, per game, with the codes war players type (SSC, rMMM, bNYM; LC, rBC3). Pure,
 * client-safe.
 *
 * Mario Kart 8 Deluxe and Mario Kart World come from the time trial lists and their codes (src/lib/timeTrials), and
 * read exactly as they always have. Mario Kart Wii has no time trial boards (Wii picks 2026-11-11, pick 5), so its 32
 * courses come from the randomizer's data (src/data/mkwii-data.json): ids are the name's slug ("gcn-peach-beach") and
 * never change once a war has stored one. Its codes are the ones MKW Table Bot reads (its Race.py
 * track_name_abbreviation_mappings, which cites the community's MKW dictionary): the code shown first, the others
 * typed the same way. Two of Wii's ids are also Mario Kart World ids (snes-ghost-valley-2, snes-mario-circuit-3);
 * a war keeps its game, so a stored race never mixes them up, and a server's nickname for a Wii track is stored as
 * "mkwii:<id>" (see `nickTrack`).
 */

import { tracksByCode, trackCode } from "@/lib/timeTrials/codes";
import { ttTracks } from "@/lib/timeTrials/tracks";
import mkwiiData from "@/data/mkwii-data.json";
import type { WarGame } from "./rules";

export interface WarTrack {
  id: string;
  game: WarGame;
  /** As the game names it ("GCN Peach Beach", "Tour Paris Promenade"). */
  name: string;
  cup: string;
  image: string | null;
  /** The code shown ("rPB"), or null when the track has none. */
  code: string | null;
}

export { CODE_EXAMPLE } from "./codeExamples";

/** "Wii Moo Moo Meadows (rMMM)": the name with its code. */
export function warTrackTitle(t: Pick<WarTrack, "name" | "code">): string {
  return t.code ? `${t.name} (${t.code})` : t.name;
}

// ── Mario Kart Wii ─────────────────────────────────────────────────────────────────────────────

/** Each course's codes, the shown one first (MKW Table Bot's list; "GCN MC" is two words, so it's left out). */
const WII_CODES: Record<string, string[]> = {
  "Luigi Circuit": ["LC"], "Moo Moo Meadows": ["MMM"], "Mushroom Gorge": ["MG"], "Toad's Factory": ["TF"],
  "Mario Circuit": ["MC"], "Coconut Mall": ["CM"], "DK Summit": ["DKS", "DKSC"], "Wario's Gold Mine": ["WGM"],
  "Daisy Circuit": ["DC"], "Koopa Cape": ["KC"], "Maple Treeway": ["MT"], "Grumble Volcano": ["GV"],
  "Dry Dry Ruins": ["DDR"], "Moonview Highway": ["MH", "MvH"], "Bowser's Castle": ["BC", "BCWii"], "Rainbow Road": ["RR"],
  "GCN Peach Beach": ["rPB", "PB"], "DS Yoshi Falls": ["rYF", "YF"], "SNES Ghost Valley 2": ["rGV2", "GV2"], "N64 Mario Raceway": ["rMR"],
  "N64 Sherbet Land": ["rSL", "SL"], "GBA Shy Guy Beach": ["rSGB", "SGB"], "DS Delfino Square": ["rDS", "DSDS"], "GCN Waluigi Stadium": ["rWS", "WS"],
  "DS Desert Hills": ["rDH", "DH"], "GBA Bowser Castle 3": ["rBC3", "BC3"], "N64 DK's Jungle Parkway": ["rDKJP", "rJP", "DKJP", "JP"], "GCN Mario Circuit": ["rMC"],
  "SNES Mario Circuit 3": ["rMC3", "MC3"], "DS Peach Gardens": ["rPG", "PG"], "GCN DK Mountain": ["rDKM", "DKM"], "N64 Bowser's Castle": ["rBC", "BC64"],
};

const slug = (s: string) => s.toLowerCase().replace(/['.]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

type WiiData = { cups: { name: string; courses: { name: string; img: string }[] }[] };
const WII: (WarTrack & { codes: string[] })[] = (mkwiiData as WiiData).cups.flatMap((cup) =>
  cup.courses.map((c) => {
    const codes = WII_CODES[c.name] ?? [];
    return { id: slug(c.name), game: "mkwii" as const, name: c.name, cup: cup.name, image: c.img || null, code: codes[0] ?? null, codes };
  }),
);

const plain = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/['’.?!]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const CONSOLE = /^(wii|gcn|gc|ds|snes|sfc|n64|gba)\s+/;

/**
 * A Mario Kart Wii course from its name as another bot or a person writes it: "GCN Peach Beach", "Peach Beach (GCN)",
 * "Wii Coconut Mall", or the name alone when only one course has it. Null when it could be more than one
 * ("Mario Circuit" is the Wii one; "GCN Mario Circuit" the other).
 */
export function wiiTrackByName(text: string): WarTrack | null {
  let q = plain(text.replace(/^(.*?)\s*\((wii|gcn|gc|ds|snes|sfc|n64|gba)\)$/i, "$2 $1"));
  if (!q) return null;
  q = q.replace(/^gc /, "gcn ").replace(/^sfc /, "snes ");
  const full = WII.filter((t) => plain(t.name) === q || (q.startsWith("wii ") && plain(t.name) === q.slice(4)));
  if (full.length === 1) return warTrackById("mkwii", full[0].id);
  const bare = WII.filter((t) => plain(t.name).replace(CONSOLE, "") === q.replace(CONSOLE, ""));
  // The name alone: the new course when there is one (Mario Circuit, Bowser's Castle), else the only retro one.
  const pick = bare.length === 1 ? bare[0] : bare.find((t) => !CONSOLE.test(plain(t.name)) && !CONSOLE.test(q)) ?? null;
  return pick ? warTrackById("mkwii", pick.id) : null;
}

/** Every code a Wii course answers to (the shown one first). */
export function wiiCodes(id: string): string[] {
  return WII.find((t) => t.id === id)?.codes ?? [];
}

// ── Every game ───────────────────────────────────────────────────────────────────────────────

const LISTS = new Map<WarGame, WarTrack[]>();

export function warTracks(game: WarGame): WarTrack[] {
  const hit = LISTS.get(game);
  if (hit) return hit;
  const list: WarTrack[] = game === "mkwii"
    ? WII.map((t) => ({ id: t.id, game: t.game, name: t.name, cup: t.cup, image: t.image, code: t.code }))
    : ttTracks(game).map((t) => ({ id: t.id, game, name: t.name, cup: t.cup, image: t.image, code: trackCode(t) }));
  LISTS.set(game, list);
  return list;
}

export function warTrackById(game: WarGame, id: string): WarTrack | null {
  return warTracks(game).find((t) => t.id === id) ?? null;
}

/**
 * The one track a typed code means, or null. Mario Kart 8 Deluxe and World: the shown code, exact case first, then any
 * case when only one track has it (as before). Mario Kart Wii: any of its codes, exact case first, then any case.
 */
export function warTrackByCode(game: WarGame, text: string): WarTrack | null {
  if (!text) return null;
  if (game === "mkwii") {
    const exact = WII.filter((t) => t.codes.includes(text));
    if (exact.length === 1) return warTrackById(game, exact[0].id);
    const q = text.toLowerCase();
    const any = WII.filter((t) => t.codes.some((c) => c.toLowerCase() === q));
    return any.length === 1 ? warTrackById(game, any[0].id) : null;
  }
  const exactCase = warTracks(game).find((t) => t.code === text);
  if (exactCase) return exactCase;
  const list = tracksByCode(text, game).filter((t) => (trackCode(t) ?? "").toLowerCase() === text.toLowerCase());
  return list.length === 1 ? warTrackById(game, list[0].id) : null;
}

// ── A server's nicknames ─────────────────────────────────────────────────────────────────────

/**
 * What a nickname stores (war_track_names.track): Mario Kart 8 Deluxe and World keep the bare id, as they always have;
 * a Mario Kart Wii track is stored as "mkwii:<id>", because two Wii ids are also World ids.
 */
export function nickTrackValue(game: WarGame, id: string): string {
  return game === "mkwii" ? `mkwii:${id}` : id;
}

/** The track a stored nickname points at in this game, or null when it's for another game. */
export function nickTrack(game: WarGame, stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (stored.startsWith("mkwii:")) return game === "mkwii" ? stored.slice(6) : null;
  if (game === "mkwii") return null;
  return stored;
}
