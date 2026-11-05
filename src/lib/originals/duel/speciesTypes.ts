/**
 * A Pokémon's types in the games, for Trainer Road's team tables (SEO pass 2026-11-05). Pure.
 *
 * Types come from the Daily Dex's facts (PokeAPI, every Pokémon by name). Trainer teams spell Pokémon as card
 * names do, so a prefix like "Galarian" is sometimes only the card's name (Galarian Sirfetch'd is plain Sirfetch'd);
 * the regional forms whose types differ from the original are listed here. Card types (Fairy playing as Psychic and
 * so on) are the Duel's own and never used for this.
 */

import { DEX_ROWS } from "@/data/originals/daily-dex-facts";

const norm = (s: string) => s.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "");
const BY_NAME = new Map(DEX_ROWS.map((r) => [norm(r[1]), r[3]]));

/** Forms whose types differ from the original Pokémon, as the games give them. */
const FORMS: Record<string, string[]> = {
  "Alolan Rattata": ["Dark", "Normal"],
  "Alolan Raticate": ["Dark", "Normal"],
  "Alolan Raichu": ["Electric", "Psychic"],
  "Alolan Sandslash": ["Ice", "Steel"],
  "Alolan Ninetales": ["Ice", "Fairy"],
  "Alolan Dugtrio": ["Ground", "Steel"],
  "Alolan Persian": ["Dark"],
  "Alolan Golem": ["Rock", "Electric"],
  "Galarian Rapidash": ["Psychic", "Fairy"],
  "Galarian Slowbro": ["Poison", "Psychic"],
  "Galarian Weezing": ["Poison", "Fairy"],
  "Galarian Zigzagoon": ["Dark", "Normal"],
  "Galarian Linoone": ["Dark", "Normal"],
  "Galarian Darmanitan": ["Ice"],
  "Galarian Yamask": ["Ground", "Ghost"],
  "Hisuian Arcanine": ["Fire", "Rock"],
  "Heat Rotom": ["Electric", "Fire"],
};

const PREFIX = /^(Alolan|Galarian|Hisuian|Paldean) /;

/** Its types in slot order, or null when the name isn't one we know. */
export function speciesTypes(name: string): string[] | null {
  return FORMS[name] ?? BY_NAME.get(norm(name)) ?? BY_NAME.get(norm(name.replace(PREFIX, ""))) ?? null;
}

/** The name the games use: a card-only prefix ("Galarian Sirfetch'd") comes off; real regional forms keep theirs. */
export function speciesName(name: string): string {
  if (FORMS[name] || BY_NAME.has(norm(name))) return name;
  const bare = name.replace(PREFIX, "");
  return BY_NAME.has(norm(bare)) ? bare : name;
}
