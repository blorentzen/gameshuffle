/**
 * Species names by dex number (1 to 251), gathered from the Stadium rentals and
 * the Fire Red / Leaf Green encounters, for "Evolves from" in the Details
 * window. A species neither game lists (Mewtwo, Lugia, Ho-Oh) falls back to its number.
 */

import stadium from "@/data/pokemon/stadium.json";
import frlg from "@/data/pokemon/frlg-run.json";

const NAMES = new Map<number, string>();
for (const g of (stadium as { games: { cups: { rentals: { dex: number; name: string }[] }[] }[] }).games)
  for (const c of g.cups) for (const r of c.rentals) if (!NAMES.has(r.dex) && !/^Surfing /.test(r.name)) NAMES.set(r.dex, r.name);
for (const s of (frlg as { segments: { areas: { encounters: { dex: number; name: string }[] }[] }[] }).segments)
  for (const a of s.areas) for (const e of a.encounters) if (!NAMES.has(e.dex)) NAMES.set(e.dex, e.name);
for (const [d, n] of [[1, "Bulbasaur"], [4, "Charmander"], [7, "Squirtle"], [150, "Mewtwo"], [249, "Lugia"], [250, "Ho-Oh"]] as const) if (!NAMES.has(d)) NAMES.set(d, n);

export function speciesName(dex: number): string | undefined {
  return NAMES.get(dex);
}
