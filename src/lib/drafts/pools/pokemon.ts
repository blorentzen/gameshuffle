import "server-only";
import sv from "@/data/pokemon/scarlet-violet.json";
import champions from "@/data/pokemon/champions.json";
import { draftPoolInfo } from "@/lib/drafts/catalog";
import type { DraftOption, DraftPool } from "@/lib/drafts/types";

/**
 * Pokémon team drafts: six picks, one Pokémon each. Rosters researched
 * 2026-09-29 (PokéAPI + Serebii; Champions is Regulation M-C, which rotates:
 * refresh src/data/pokemon/champions.json when it changes). Names and types
 * only: no official art (an unofficial fan tool).
 */

type Row = [number, string, string[], string];
interface Mon { dex: number; name: string; types: string[]; fullyEvolved: boolean; legendary: boolean; mythical: boolean }

function load(rows: Row[]): Mon[] {
  return rows.map(([dex, name, types, f]) => ({ dex, name, types, fullyEvolved: f.includes("e"), legendary: f.includes("l"), mythical: f.includes("m") }));
}

function option(m: Mon): DraftOption {
  return { id: m.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label: m.name, detail: m.types.join(" / "), tags: m.types };
}

function pokemonPool(id: string, mons: Mon[]): DraftPool {
  const info = draftPoolInfo(id)!;
  const slots = Array.from({ length: 6 }, (_, i) => ({ key: `pick-${i + 1}`, label: `Pick ${i + 1}` }));
  return {
    id, label: info.label, game: info.game, rules: info.rules,
    slots: () => slots,
    candidates: (_slot, rules, picks) => {
      const taken = new Set(picks.map((p) => p.label));
      const usedTypes = new Set(picks.flatMap((p) => p.tags ?? []));
      return mons.filter((m) =>
        !taken.has(m.name)
        && (!rules.fullyEvolved || m.fullyEvolved)
        && (!rules.noLegendary || (!m.legendary && !m.mythical))
        && (!rules.uniqueTypes || !m.types.some((t) => usedTypes.has(t))),
      ).map(option);
    },
    lookup: (_slot, label) => { const m = mons.find((x) => x.name === label); return m ? option(m) : null; },
    question: (_slot, i, total) => `Pick ${i + 1} of ${total}: who joins the team?`,
  };
}

export const POKEMON_POOLS: DraftPool[] = [
  pokemonPool("pokemon:sv", load(sv as Row[])),
  pokemonPool("pokemon:champions", load(champions as Row[])),
];
