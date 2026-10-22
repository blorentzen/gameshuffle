"use client";

/**
 * The Daily Duel's small board pieces: Energy dots, a move's cost dots, a type chip, the six pips
 * and a card thumbnail with its HP line. These are drawings of the game board (like the other
 * dailies' grids), not form controls; anything you press is a real <button> with a label that
 * says what happens.
 */

import type { ReactNode } from "react";
import type { DuelCardView } from "@/lib/originals/duel/view";
import type { EnergyType } from "@/lib/originals/duel/types";
import { TYPE_CHIP, TYPE_DOT, TYPE_ICON, cardLabel, coveredDots, energyWords, hpTone } from "./duelLook";

export type DotSize = "xs" | "sm" | "md" | "lg";

/**
 * One Energy dot with its type's icon inside (so color is never the only clue): filled in the
 * type's color, or a ring when `on` is false (a cost not covered yet, or an Energy still to come).
 * `fresh` rings it in white: today's Energy, placed but not sent yet.
 */
export function EnergyDot({ t, on = true, size = "md", fresh = false }: { t: EnergyType; on?: boolean; size?: DotSize; fresh?: boolean }) {
  const Glyph = TYPE_ICON[t];
  return (
    <span
      className={`duel-e duel-e--${size}${on ? " duel-e--on" : ""}${t === "Colorless" ? " duel-e--any" : ""}${fresh ? " duel-e--new" : ""}`}
      style={{ "--e": TYPE_DOT[t] } as React.CSSProperties}
      aria-hidden="true"
    >
      <Glyph aria-hidden="true" />
    </span>
  );
}

/**
 * The Energy on a card, as dots (with the words for screen readers). `pending` is today's Energy
 * placed on it but not sent yet: drawn last, ringed.
 */
export function EnergyOn({ energy, pending = null, size = "sm", empty = "No Energy" }: { energy: readonly EnergyType[]; pending?: EnergyType | null; size?: DotSize; empty?: string | null }) {
  if (!energy.length && !pending) return empty ? <span className="duel-energy duel-energy--none">{empty}</span> : null;
  const words = `${energy.length ? `Energy: ${energyWords(energy)}` : "No Energy yet"}${pending ? `, plus today's ${pending}` : ""}`;
  return (
    <span className="duel-energy" role="img" aria-label={words}>
      {energy.map((t, i) => <EnergyDot key={i} t={t} size={size} />)}
      {pending && <EnergyDot t={pending} size={size} fresh />}
    </span>
  );
}

/** A move's cost: a dot per Energy it needs, filled once covered by `energy`. */
export function CostDots({ cost, energy, size = "sm" }: { cost: readonly EnergyType[]; energy: readonly EnergyType[]; size?: DotSize }) {
  const on = coveredDots(energy, cost);
  if (!cost.length) return <span className="duel-cost duel-cost--free">Free</span>;
  return (
    <span className="duel-cost" aria-hidden="true">
      {cost.map((t, i) => <EnergyDot key={i} t={t} on={on[i]} size={size} />)}
    </span>
  );
}

export function TypeChip({ t }: { t: EnergyType }) {
  return <span className="duel-type" style={{ background: TYPE_CHIP[t] }}>{t}</span>;
}

/** Gold pips, one per card, lit while it's standing. */
export function Pips({ cards, who }: { cards: readonly Pick<DuelCardView, "out">[]; who: string }) {
  const left = cards.filter((c) => !c.out).length;
  return (
    <span className="duel-pips" role="img" aria-label={`${who}: ${left} of ${cards.length} cards left`}>
      {cards.map((c, i) => <i key={i} className={c.out ? undefined : "on"} />)}
      <small aria-hidden="true">{left} left</small>
    </span>
  );
}

/** The card's picture (Scrydex's medium image, as stored), or a plain card back when there's none. */
export function CardPicture({ card, alt = "" }: { card: Pick<DuelCardView, "img" | "name" | "short" | "t">; alt?: string }) {
  if (!card.img) {
    return (
      <span className="duel-noart" style={{ "--e": TYPE_CHIP[card.t] } as React.CSSProperties} role={alt ? "img" : undefined} aria-label={alt || undefined}>
        <span aria-hidden="true">{cardLabel(card)}</span>
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- Scrydex CDN image, medium size, never rewritten
  return <img src={card.img} alt={alt} loading="lazy" draggable={false} />;
}

/**
 * A card thumbnail: the picture, its HP line, the Energy on it, and a mark when it's knocked out
 * or Team Rocket has it. Pass `onPress` + `label` to make it a button; without them it's a picture
 * (with `alt` saying what it shows).
 */
export function CardThumb({ card, onPress, label, selected = false, size = "sm", pending = null, children, className }: {
  card: DuelCardView;
  onPress?: () => void;
  label?: string;
  selected?: boolean;
  size?: "sm" | "md";
  /** Today's Energy placed on this card but not sent yet (drawn ringed after its Energy). */
  pending?: EnergyType | null;
  children?: ReactNode;
  className?: string;
}) {
  const state = card.out ? " duel-thumb--out" : card.grabbed > 0 ? " duel-thumb--grabbed" : "";
  const classes = `duel-thumb duel-thumb--${size}${state}${selected ? " duel-thumb--selected" : ""}${onPress ? " duel-thumb--press" : ""}${className ? ` ${className}` : ""}`;
  const alt = `${card.name}${card.out ? ", knocked out" : `, ${card.cur} of ${card.hp} HP`}${card.grabbed > 0 ? `, held by Team Rocket for ${card.grabbed} more ${card.grabbed === 1 ? "turn" : "turns"}` : ""}`;
  const inner = (
    <>
      <CardPicture card={card} alt={onPress ? "" : alt} />
      {!card.out && (card.energy.length > 0 || pending) && (
        <span className="duel-thumb__energy" aria-hidden="true">
          {card.energy.slice(0, pending ? 5 : 6).map((t, i) => <EnergyDot key={i} t={t} size="xs" />)}
          {pending && <EnergyDot t={pending} size="xs" fresh />}
        </span>
      )}
      {card.out && <span className="duel-thumb__mark" aria-hidden="true">KO</span>}
      {!card.out && card.grabbed > 0 && <span className="duel-thumb__rocket" aria-hidden="true">R</span>}
      {!card.out && (
        <span className="duel-thumb__hp" aria-hidden="true"><i className={`duel-hp--${hpTone(card.cur, card.hp)}`} style={{ width: `${(card.cur / card.hp) * 100}%` }} /></span>
      )}
      {children}
    </>
  );
  if (onPress) {
    return (
      <button type="button" className={classes} onClick={onPress} aria-label={label ?? alt} aria-pressed={selected || undefined} data-card={card.index}>
        {inner}
      </button>
    );
  }
  return <span className={classes} data-card={card.index}>{inner}</span>;
}
