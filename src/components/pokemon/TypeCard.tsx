/**
 * The Pokémon card every Pokémon randomizer uses: the type's color, our own icon
 * for the type (Tabler, never the official type symbols), the Pokédex number,
 * the name, and optionally a level and moves. No sprites or official art: The
 * Pokémon Company enforces its artwork hard and the site charges money, so
 * names, types and numbers are as far as we go (decision 2026-10-04). The one
 * exception: a real TCG card from Scrydex (`art`, whole card, attributed with
 * TcgAttribution) sits on top when one has been populated for the species.
 */
import type { ComponentType } from "react";
import {
  IconBolt, IconBug, IconCircleDot, IconCrown, IconDroplet, IconEye, IconFeather, IconFlame, IconFlask,
  IconGhost, IconHandStop, IconHexagon, IconLeaf, IconMoon, IconMountain, IconShield, IconSnowflake,
} from "@tabler/icons-react";

type TablerIcon = ComponentType<{ size?: number | string; stroke?: number; "aria-hidden"?: boolean }>;

export const POKEMON_TYPES: Record<string, { color: string; ink: "light" | "dark"; Icon: TablerIcon }> = {
  Normal: { color: "#8f8f6f", ink: "light", Icon: IconCircleDot },
  Fire: { color: "#d9502a", ink: "light", Icon: IconFlame },
  Water: { color: "#2f72d6", ink: "light", Icon: IconDroplet },
  Grass: { color: "#3a8f45", ink: "light", Icon: IconLeaf },
  Electric: { color: "#e3b000", ink: "dark", Icon: IconBolt },
  Ice: { color: "#3aa9bb", ink: "light", Icon: IconSnowflake },
  Fighting: { color: "#a8362b", ink: "light", Icon: IconHandStop },
  Poison: { color: "#8a3fa4", ink: "light", Icon: IconFlask },
  Ground: { color: "#a87b33", ink: "light", Icon: IconMountain },
  Flying: { color: "#6f82d6", ink: "light", Icon: IconFeather },
  Psychic: { color: "#c8447a", ink: "light", Icon: IconEye },
  Bug: { color: "#7d9419", ink: "light", Icon: IconBug },
  Rock: { color: "#8f7a3a", ink: "light", Icon: IconHexagon },
  Ghost: { color: "#574a88", ink: "light", Icon: IconGhost },
  Dragon: { color: "#5439c4", ink: "light", Icon: IconCrown },
  Dark: { color: "#4a3b33", ink: "light", Icon: IconMoon },
  Steel: { color: "#71808f", ink: "light", Icon: IconShield },
};
const FALLBACK = POKEMON_TYPES.Normal;

/** A showcase TCG card for a species (see src/lib/pokemon/showcase.ts). */
export interface ShowcaseArt { src: string; card: string; set: string | null; number: string | null; rarity: string | null }

export function TypeCard({ dex, name, types, level, moves, picked = false, art }: {
  dex: number; name: string; types: string[]; level?: number; moves?: string[]; picked?: boolean; art?: ShowcaseArt;
}) {
  const main = POKEMON_TYPES[types[0]] ?? FALLBACK;
  const Icon = main.Icon;
  return (
    <div className={`type-card type-card--${main.ink}${picked ? " is-picked" : ""}${art ? " type-card--art" : ""}`} style={{ "--type-color": main.color } as React.CSSProperties}>
      {art && (
        // eslint-disable-next-line @next/next/no-img-element -- Scrydex CDN image, medium size, as the TCG pages do
        <img className="type-card__art" src={art.src} alt={`${art.card}${art.set ? `, ${art.set}` : ""}${art.number ? ` #${art.number}` : ""}`} loading="lazy" />
      )}
      <div className="type-card__top">
        <span className="type-card__num">#{String(dex).padStart(3, "0")}{level ? ` · Lv ${level}` : ""}</span>
        {picked && <span className="type-card__pick">Pick</span>}
      </div>
      {!art && <span className="type-card__icon" aria-hidden><Icon size={44} stroke={1.5} aria-hidden /></span>}
      <p className="type-card__name">{name}</p>
      <div className="type-card__types">
        {types.map((t) => <span key={t} className="type-card__type" style={{ "--chip-color": (POKEMON_TYPES[t] ?? FALLBACK).color } as React.CSSProperties}>{t}</span>)}
      </div>
      {moves?.length ? <ul className="type-card__moves">{moves.map((m) => <li key={m}>{m}</li>)}</ul> : null}
    </div>
  );
}

/** The line every Pokémon randomizer shows under its tool. */
export function PokemonDisclaimer() {
  return <p className="type-card-disclaimer">GameShuffle is a fan-made tool and isn&apos;t affiliated with or endorsed by Nintendo, Creatures, Game Freak or The Pokémon Company. Pokémon names are trademarks of their owners.</p>;
}
