"use client";

/**
 * The Details window for a Pokémon card: the artwork, number and category,
 * types, height / weight / evolution, base stats and (for rentals) its moves.
 * Facts come from src/data/pokemon/dex.json (PokéAPI, pulled 2026-10-04); we
 * don't reproduce Pokédex flavour text. Pages add their own section below
 * (Stadium: choose this slot yourself; the run: where to catch it).
 */

import type { ReactNode } from "react";
import { Modal, Progress } from "@empac/cascadeds";
import dexData from "@/data/pokemon/dex.json";
import { PokemonArt, TypeChips } from "@/components/pokemon/PokemonCard";
import type { ShowcaseArt } from "@/components/pokemon/TypeCard";

interface DexEntry {
  genus: string | null; height_m: number; weight_kg: number; evolvesFrom: number | null;
  stats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number }; legendary: boolean;
}
const DEX = dexData as Record<string, DexEntry>;

const STATS: { key: keyof DexEntry["stats"]; label: string }[] = [
  { key: "hp", label: "HP" }, { key: "atk", label: "Attack" }, { key: "def", label: "Defense" },
  { key: "spa", label: "Sp. Atk" }, { key: "spd", label: "Sp. Def" }, { key: "spe", label: "Speed" },
];

export interface DetailsPokemon { dex: number; name: string; types: string[]; level?: number; moves?: string[]; art?: ShowcaseArt }

export function PokemonDetails({ pokemon, onClose, nameOf, children }: {
  pokemon: DetailsPokemon | null;
  onClose: () => void;
  /** Looks up a species name by dex number (for "Evolves from"). */
  nameOf?: (dex: number) => string | undefined;
  children?: ReactNode;
}) {
  const d = pokemon ? DEX[String(pokemon.dex)] : null;
  return (
    <Modal isOpen={!!pokemon} onClose={onClose} title={pokemon?.name ?? ""} size="medium">
      {pokemon && (
        <div className="poke-details">
          <div className="poke-details__top">
            <PokemonArt name={pokemon.name} types={pokemon.types} art={pokemon.art} className="poke-details__art" />
            <div className="poke-details__facts">
              <span className="poke-card__num">#{String(pokemon.dex).padStart(3, "0")}{pokemon.level ? ` · Lv ${pokemon.level}` : ""}</span>
              {d?.genus && <p className="poke-details__genus">{d.genus}{d.legendary ? " · Legendary" : ""}</p>}
              <TypeChips types={pokemon.types} />
              {d && (
                <dl className="poke-details__dl">
                  <div><dt>Height</dt><dd>{d.height_m} m</dd></div>
                  <div><dt>Weight</dt><dd>{d.weight_kg} kg</dd></div>
                  {d.evolvesFrom && <div><dt>Evolves from</dt><dd>{nameOf?.(d.evolvesFrom) ?? `#${String(d.evolvesFrom).padStart(3, "0")}`}</dd></div>}
                </dl>
              )}
            </div>
          </div>

          {d && (
            <section className="poke-details__section" aria-label="Base stats">
              <h3 className="poke-details__h">Base stats</h3>
              <div className="poke-details__stats">
                {STATS.map((s) => (
                  <div key={s.key} className="poke-details__stat">
                    <span>{s.label}</span>
                    <strong>{d.stats[s.key]}</strong>
                    <Progress value={d.stats[s.key]} max={180} size="small" />
                  </div>
                ))}
              </div>
            </section>
          )}

          {pokemon.moves?.length ? (
            <section className="poke-details__section" aria-label="Moves">
              <h3 className="poke-details__h">Moves</h3>
              <ul className="poke-details__moves">{pokemon.moves.map((m) => <li key={m}>{m}</li>)}</ul>
            </section>
          ) : null}

          {children}
          {pokemon.art && <p className="poke-details__credit">Card art: {pokemon.art.card}{pokemon.art.set ? `, ${pokemon.art.set}` : ""}{pokemon.art.number ? ` #${pokemon.art.number}` : ""}.</p>}
        </div>
      )}
    </Modal>
  );
}
