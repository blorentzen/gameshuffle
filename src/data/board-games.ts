/**
 * Board-game player-preference options (Phase 1 of gs-board-game-nights).
 *
 * Genres are OPEN — this list is only suggestion chips for the profile picker;
 * people can type anything (same spirit as favorite_games' free entries). Level
 * + length are small fixed enums (the DB check-constrains level).
 */

/** Suggested genre chips. NOT a hard list — free text is allowed. */
export const BOARD_GAME_GENRE_SUGGESTIONS: string[] = [
  "Strategy",
  "Party",
  "Cooperative",
  "Family",
  "Card & deckbuilding",
  "Social deduction",
  "Trivia",
  "Word",
  "Dexterity",
  "Abstract",
];

export const BOARD_GAME_LEVELS = [
  { value: "casual", label: "Casual" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
] as const;

export const BOARD_GAME_LENGTHS = [
  { value: "quick", label: "Quick (10–20 min)" },
  { value: "moderate", label: "Moderate (30–45 min)" },
  { value: "long", label: "Long (1 hr+)" },
] as const;

export type BoardGameLevel = (typeof BOARD_GAME_LEVELS)[number]["value"];
export type BoardGameLength = (typeof BOARD_GAME_LENGTHS)[number]["value"];

/** Label lookups for display surfaces (/u, directory). */
export const boardGameLevelLabel = (v: string | null | undefined): string | null =>
  BOARD_GAME_LEVELS.find((l) => l.value === v)?.label ?? null;

export const boardGameLengthLabel = (v: string): string =>
  BOARD_GAME_LENGTHS.find((l) => l.value === v)?.label ?? v;
