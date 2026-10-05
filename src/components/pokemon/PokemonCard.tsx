"use client";

/**
 * The Pokémon card on every Pokémon randomizer: the artwork up top (a showcase
 * TCG card's illustration from Scrydex, cropped to the art; the type tile and
 * our type icon when there is none), then number, name and types, and a
 * Details button that opens PokemonDetails (facts, base stats, moves, and on
 * Stadium a way to choose this slot yourself).
 */

import { useEffect, useState } from "react";
import { Button } from "@empac/cascadeds";
import { POKEMON_TYPES, type ShowcaseArt } from "@/components/pokemon/TypeCard";

const FALLBACK = POKEMON_TYPES.Normal;

/** The part of a card image that is only artwork (x, y, width, height as fractions of the card). */
const ART_REGION = { full: [0, 0.13, 1, 0.38], window: [0.11, 0.13, 0.78, 0.305] } as const;
const CARD_ASPECT = 63 / 88;

/** CSS variables that scale and shift the card image so its art region covers the box. */
export function artStyle(fullArt: boolean): React.CSSProperties {
  const [x, y, w, h] = fullArt ? ART_REGION.full : ART_REGION.window;
  return { "--ax": x, "--ay": y, "--aw": w, "--ah": h, "--aspect": CARD_ASPECT } as React.CSSProperties;
}

/** The artwork box: the card's illustration, or the type tile with our icon. */
export function PokemonArt({ name, types, art, className = "" }: { name: string; types: string[]; art?: ShowcaseArt; className?: string }) {
  const main = POKEMON_TYPES[types[0]] ?? FALLBACK;
  const Icon = main.Icon;
  return (
    <span className={`poke-art ${className}`} style={{ "--type-color": main.color } as React.CSSProperties}
      role="img" aria-label={art ? `Card art: ${art.card}${art.set ? `, ${art.set}` : ""}${art.number ? ` #${art.number}` : ""}` : `${name}, ${types.join(" and ")} type`}>
      {art
        // eslint-disable-next-line @next/next/no-img-element -- Scrydex CDN image, medium size, as the TCG pages do
        ? <img src={art.src} alt="" loading="lazy" style={artStyle(art.fullArt)} />
        : <span className="poke-art__icon" aria-hidden><Icon size={48} stroke={1.5} aria-hidden /></span>}
    </span>
  );
}

export function TypeChips({ types }: { types: string[] }) {
  return (
    <span className="poke-card__types">
      {types.map((t) => <span key={t} className="poke-card__type" style={{ "--chip-color": (POKEMON_TYPES[t] ?? FALLBACK).color } as React.CSSProperties}>{t}</span>)}
    </span>
  );
}

export interface ReelEntry { dex: number; name: string; types: string[] }

/**
 * The randomizer's rolling animation for one card: when it mounts with a reel
 * (parents re-key a slot each time it rolls), it flicks through random entries
 * for about 0.7s and then lands. Chosen slots aren't re-keyed, so they stay put.
 */
function useReel(reel: ReelEntry[] | undefined): ReelEntry | null {
  const [frame, setFrame] = useState<ReelEntry | null>(null);
  useEffect(() => {
    if (!reel?.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timers: number[] = [];
    const steps = 9;
    for (let i = 0; i < steps; i++) {
      timers.push(window.setTimeout(() => setFrame(reel[Math.floor(Math.random() * reel.length)]), i * 75));
    }
    timers.push(window.setTimeout(() => setFrame(null), steps * 75 + 40));
    return () => timers.forEach(clearTimeout);
    // Mount only: a roll re-keys the card, so later renders (typing a name) never replay it.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return frame;
}

export function PokemonCard({ dex, name, types, level, art, picked = false, chosen = false, onDetails, reel }: {
  dex: number; name: string; types: string[]; level?: number; art?: ShowcaseArt;
  /** In the randomizer's pick of 3. */
  picked?: boolean;
  /** Chosen by the player (kept on re-rolls). */
  chosen?: boolean;
  onDetails?: () => void;
  /** Spin through these when the card mounts (the rolling animation). */
  reel?: ReelEntry[];
}) {
  const frame = useReel(reel);
  if (frame) {
    return (
      <div className="poke-card is-rolling" aria-hidden>
        <span className="poke-card__media"><PokemonArt name={frame.name} types={frame.types} /></span>
        <span className="poke-card__body">
          <span className="poke-card__num">#{String(frame.dex).padStart(3, "0")}</span>
          <span className="poke-card__name">{frame.name}</span>
          <TypeChips types={frame.types} />
          {onDetails && <Button variant="secondary" size="small" fullWidth disabled>Details</Button>}
        </span>
      </div>
    );
  }
  return (
    <div className={`poke-card${picked ? " is-picked" : ""}`}>
      <span className="poke-card__media">
        <PokemonArt name={name} types={types} art={art} />
        {(picked || chosen) && (
          <span className="poke-card__flags">
            {picked && <span className="poke-card__flag">Pick</span>}
            {chosen && <span className="poke-card__flag poke-card__flag--chosen">Your choice</span>}
          </span>
        )}
      </span>
      <span className="poke-card__body">
        <span className="poke-card__num">#{String(dex).padStart(3, "0")}{level ? ` · Lv ${level}` : ""}</span>
        <span className="poke-card__name">{name}</span>
        <TypeChips types={types} />
        {onDetails && <Button variant="secondary" size="small" fullWidth onClick={onDetails}>Details</Button>}
      </span>
    </div>
  );
}
