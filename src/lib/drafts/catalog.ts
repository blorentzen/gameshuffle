import type { DraftRuleDef } from "@/lib/drafts/types";

/**
 * What can be drafted, for the dashboard and chat (client-safe: no roster
 * data). The pools themselves are server-side in src/lib/drafts/pools. Keep
 * the two in sync: every pool id here needs a pool there.
 */

export interface DraftPoolInfo {
  id: string;
  label: string;
  game: string;
  /** What one pick is called, for chat and the UI. */
  noun: string;
  rules: DraftRuleDef[];
  /** Words that pick this pool in `!draft start <word>`. */
  aliases: string[];
}

const POKEMON_RULES: DraftRuleDef[] = [
  { id: "fullyEvolved", label: "Fully evolved only", default: true },
  { id: "noLegendary", label: "No legendary or mythical Pokémon", default: true },
  { id: "uniqueTypes", label: "No repeated type across the team", default: true },
];

export const DRAFT_POOLS: DraftPoolInfo[] = [
  { id: "pokemon:sv", label: "Pokémon team (Scarlet and Violet)", game: "Pokémon Scarlet and Violet", noun: "Pokémon", rules: POKEMON_RULES, aliases: ["pokemon", "sv", "scarlet", "violet"] },
  { id: "pokemon:champions", label: "Pokémon team (Champions)", game: "Pokémon Champions", noun: "Pokémon", rules: POKEMON_RULES, aliases: ["champions"] },
  { id: "mk8dx:combo", label: "Kart combo (Mario Kart 8 Deluxe)", game: "Mario Kart 8 Deluxe", noun: "part", rules: [], aliases: ["kart", "combo", "mk8dx", "mk8"] },
  { id: "mkworld:combo", label: "Kart combo (Mario Kart World)", game: "Mario Kart World", noun: "part", rules: [], aliases: ["mkw", "world", "mkwcombo"] },
  { id: "mk8dx:tracks", label: "Track list (Mario Kart 8 Deluxe)", game: "Mario Kart 8 Deluxe", noun: "track", rules: [{ id: "eightRaces", label: "Eight races instead of four", default: false }], aliases: ["tracks", "mk8tracks"] },
  { id: "mkworld:tracks", label: "Track list (Mario Kart World)", game: "Mario Kart World", noun: "track", rules: [{ id: "eightRaces", label: "Eight races instead of four", default: false }], aliases: ["mkwtracks", "worldtracks"] },
];

export function draftPoolInfo(id: string): DraftPoolInfo | null {
  return DRAFT_POOLS.find((p) => p.id === id) ?? null;
}

export function poolFromAlias(word: string | undefined): DraftPoolInfo | null {
  const w = (word ?? "").toLowerCase();
  return DRAFT_POOLS.find((p) => p.aliases.includes(w) || p.id === w) ?? null;
}
