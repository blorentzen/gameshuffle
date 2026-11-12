/**
 * Levels from players (picks 2026-11-11): the games whose levels travel by code. Super Mario Maker 2's course IDs,
 * Fortnite's island codes (Creative and UEFN), Fall Guys Creative's share codes and Geometry Dash's level IDs (the
 * curation picks, 14A) go in the level queue and on a board in their space; Minecraft seeds (15A) only go on a board.
 * The first Super Mario Maker is out: its online service ended in April 2024.
 *
 * Client-safe and pure. The Twitch categories (ids from scripts/pull-box-art.ts, names as Twitch writes them) say
 * which game is on stream, so the queue takes that game's codes.
 */

/** Games with a board (a Levels or Seeds tab in their space). */
export type LevelGame = "super-mario-maker-2" | "fortnite" | "fall-guys" | "geometry-dash" | "minecraft";
/** Games the level queue takes (everything but Minecraft's seeds). */
export type QueueGame = Exclude<LevelGame, "minecraft">;

export const LEVEL_GAME_IDS: LevelGame[] = ["super-mario-maker-2", "fortnite", "fall-guys", "geometry-dash", "minecraft"];
export const QUEUE_GAME_IDS: QueueGame[] = ["super-mario-maker-2", "fortnite", "fall-guys", "geometry-dash"];
/** Games that came with supabase/levels-m2.sql: their codes only fit the tables once it has run. */
export const CURATION_GAMES: LevelGame[] = ["geometry-dash", "minecraft"];

export interface LevelGameInfo {
  id: LevelGame;
  name: string;
  /** For tight places ("Mario Maker 2"). */
  short: string;
  /** A level or a seed (Minecraft): seeds have an edition, version, note and spots, and no marks or queue. */
  kind: "level" | "seed";
  /** What a code is called in that game. */
  codeWord: "course ID" | "island code" | "share code" | "level ID" | "seed";
  /** How a code looks, for placeholders and help lines. */
  shape: string;
  /** Its Twitch category (id first; names Twitch has used, lowercase). Null: not followed for the queue. */
  twitch: { id: string; names: string[] } | null;
  /** Its game space (/games/<id>). */
  space: string;
  /** Tags offered when sharing a level (anyone can add their own too). */
  tags: string[];
}

export const LEVEL_GAMES: Record<LevelGame, LevelGameInfo> = {
  "super-mario-maker-2": {
    id: "super-mario-maker-2", name: "Super Mario Maker 2", short: "Mario Maker 2", kind: "level",
    codeWord: "course ID", shape: "XXX-XXX-XXX",
    twitch: { id: "511399", names: ["super mario maker 2"] },
    space: "super-mario-maker-2",
    tags: ["Speedrun", "Puzzle", "Kaizo", "Hard", "Easy", "Music", "Auto", "Multiplayer"],
  },
  fortnite: {
    id: "fortnite", name: "Fortnite", short: "Fortnite", kind: "level",
    codeWord: "island code", shape: "XXXX-XXXX-XXXX",
    twitch: { id: "33214", names: ["fortnite"] },
    space: "fortnite",
    tags: ["Racing", "Box fight", "Deathrun", "Parkour", "Horror", "Party", "Tycoon", "Hard"],
  },
  "fall-guys": {
    id: "fall-guys", name: "Fall Guys", short: "Fall Guys", kind: "level",
    codeWord: "share code", shape: "XXXX-XXXX-XXXX",
    twitch: { id: "512980", names: ["fall guys", "fall guys: ultimate knockout"] },
    space: "fall-guys",
    tags: ["Obstacle course", "Race", "Survival", "Team", "Hard", "Easy"],
  },
  "geometry-dash": {
    id: "geometry-dash", name: "Geometry Dash", short: "Geometry Dash", kind: "level",
    codeWord: "level ID", shape: "12345678",
    twitch: { id: "460951", names: ["geometry dash"] },
    space: "geometry-dash",
    tags: ["Demon", "Easy", "Hard", "Platformer", "Wave", "Ship", "Memory", "Art"],
  },
  minecraft: {
    id: "minecraft", name: "Minecraft", short: "Minecraft", kind: "seed",
    codeWord: "seed", shape: "-1234567890",
    twitch: null,
    space: "minecraft",
    tags: ["Village", "Stronghold", "Ocean", "Mountains", "Cherry grove", "Speedrun", "Survival island"],
  },
};

export function isLevelGame(x: unknown): x is LevelGame {
  return typeof x === "string" && (LEVEL_GAME_IDS as string[]).includes(x);
}

export function isQueueGame(x: unknown): x is QueueGame {
  return typeof x === "string" && (QUEUE_GAME_IDS as string[]).includes(x);
}

/** The queue game a Twitch category is, by id or name; null for any other game. */
export function levelGameForTwitch(id: string | null | undefined, name: string | null | undefined): QueueGame | null {
  const n = (name ?? "").trim().toLowerCase();
  for (const g of QUEUE_GAME_IDS) {
    const t = LEVEL_GAMES[g].twitch;
    if (t && ((id && id === t.id) || (n && t.names.includes(n)))) return g;
  }
  return null;
}

/** The line under the overlay and in chat help: "!add your course ID in chat". */
export function addLine(game: QueueGame): string {
  return `!add your ${LEVEL_GAMES[game].codeWord} in chat`;
}

/** The board game a game space shows, or null. */
export function levelGameForSpace(spaceId: string): LevelGame | null {
  return LEVEL_GAME_IDS.find((g) => LEVEL_GAMES[g].space === spaceId) ?? null;
}

/** "Levels" or "Seeds", for headings and the space tab. */
export const boardNoun = (game: LevelGame) => (LEVEL_GAMES[game].kind === "seed" ? "Seeds" : "Levels");
/** "level" or "seed", in a sentence. */
export const itemWord = (game: LevelGame) => (LEVEL_GAMES[game].kind === "seed" ? "seed" : "level");
