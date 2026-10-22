"use client";

/**
 * The Daily Duel's small board pieces: Energy dots, a move's cost dots, a type chip, condition tags,
 * the six pips and our own card face (the card's art window, its type and HP: the Duel borrows from
 * the card but never shows it as the card you play with, Britton 2026-10-22). These are drawings of
 * the game board (like the other dailies' grids), not form controls; anything you press is a real
 * <button> with a label that says what happens.
 */

import type { CSSProperties, ReactNode } from "react";
import type { DuelCardView } from "@/lib/originals/duel/view";
import type { DuelCondition, EnergyType } from "@/lib/originals/duel/types";
import { CONDITION_LOOK, TYPE_CHIP, TYPE_DOT, TYPE_ICON, cardLabel, coveredDots, energyWords, hpTone } from "./duelLook";
import "@/styles/duel-art.css";

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

/**
 * A condition as a square tag: its icon on its color (no words on the card; the word is for screen
 * readers and the tooltip). `chance` adds the move's chance beside it ("50%").
 */
export function CondTag({ c, size = "sm", chance, label }: { c: DuelCondition; size?: DotSize; chance?: number; label?: string }) {
  const look = CONDITION_LOOK[c];
  const Glyph = look.icon;
  const words = label ?? (chance != null ? `${chance}% chance to make it ${look.word}` : look.word);
  return (
    <span className={`duel-cond duel-cond--${size}`} role="img" aria-label={words} title={words}>
      <span className="duel-cond__tag" style={{ "--c": look.color, "--ci": look.ink } as CSSProperties}><Glyph aria-hidden="true" /></span>
      {chance != null && <span className="duel-cond__pct" aria-hidden="true">{chance}%</span>}
    </span>
  );
}

/** A card's conditions as tags (its lasting one, then Confused), or nothing. */
export function CardConds({ card, size = "sm" }: { card: Pick<DuelCardView, "cond" | "confused" | "out">; size?: DotSize }) {
  if (card.out || (!card.cond && !card.confused)) return null;
  return (
    <span className="duel-conds">
      {card.cond && <CondTag c={card.cond} size={size} />}
      {card.confused && <CondTag c="confused" size={size} />}
    </span>
  );
}

/** A move's conditions as tags with their chance ("[lock] 25%"), or nothing. */
export function MoveConds({ fx, size = "sm" }: { fx: DuelCardView["moves"][number]["fx"]; size?: DotSize }) {
  if (!fx?.length) return null;
  return <span className="duel-conds">{fx.map((f) => <CondTag key={f.c} c={f.c} size={size} chance={f.chance} />)}</span>;
}

/** The art window of a Scrydex card image (between the name bar and the attacks), cropped with CSS like the trainers' pictures. */
const CARD_ART: CSSProperties = { "--ax": 0.11, "--ay": 0.13, "--aw": 0.78, "--ah": 0.305, "--ar": 367 / 512, "--fx": 0.5, "--fy": 0.42, "--px": 0.5, "--py": 0.42, "--z": 1 } as CSSProperties;

/** The card's art, cropped to its art window (or the card's name on its type color when there's no picture). Size it from outside. */
export function CardArt({ card, className, alt = "" }: { card: Pick<DuelCardView, "img" | "name" | "short" | "t">; className?: string; alt?: string }) {
  if (!card.img) {
    return (
      <span className={`duel-noart${className ? ` ${className}` : ""}`} style={{ "--e": TYPE_CHIP[card.t] } as CSSProperties} role={alt ? "img" : undefined} aria-label={alt || undefined}>
        <span aria-hidden="true">{cardLabel(card)}</span>
      </span>
    );
  }
  return (
    <span className={`duel-art duel-cardart${className ? ` ${className}` : ""}`} style={CARD_ART} role={alt ? "img" : undefined} aria-label={alt || undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Scrydex CDN image, medium size, never rewritten */}
      <img src={card.img} alt="" loading="lazy" decoding="async" draggable={false} />
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
 * The inside of our small card face: the art window with its HP bar, the Energy on it and its
 * conditions over the art, and a foot with its type and HP left; a mark when it's knocked out or
 * Team Rocket has it.
 */
export function ThumbFace({ card, pending = null, energy = true }: { card: DuelCardView; pending?: EnergyType | null; energy?: boolean }) {
  return (
    <>
      <span className="duel-thumb__art">
        <CardArt card={card} />
        {energy && !card.out && (card.energy.length > 0 || pending) && (
          <span className="duel-thumb__energy" aria-hidden="true">
            {card.energy.slice(0, pending ? 5 : 6).map((t, i) => <EnergyDot key={i} t={t} size="xs" />)}
            {pending && <EnergyDot t={pending} size="xs" fresh />}
          </span>
        )}
        {!card.out && (card.cond || card.confused) && <span className="duel-thumb__conds" aria-hidden="true"><CardConds card={card} size="xs" /></span>}
        {card.out && <span className="duel-thumb__mark" aria-hidden="true">KO</span>}
        {!card.out && card.grabbed > 0 && <span className="duel-thumb__rocket" aria-hidden="true">R</span>}
        {!card.out && (
          <span className="duel-thumb__hp" aria-hidden="true"><i className={`duel-hp--${hpTone(card.cur, card.hp)}`} style={{ width: `${(card.cur / card.hp) * 100}%` }} /></span>
        )}
      </span>
      <span className="duel-thumb__foot" aria-hidden="true">
        <EnergyDot t={card.t} size="xs" />
        <b>{card.out ? 0 : card.cur}</b>
      </span>
    </>
  );
}

/** Screen-reader words for a card's conditions (", Burned and Confused"). */
export const condWords = (card: Pick<DuelCardView, "cond" | "confused" | "out">) => {
  if (card.out) return "";
  const w = [card.cond ? CONDITION_LOOK[card.cond].word : null, card.confused ? "Confused" : null].filter(Boolean);
  return w.length ? `, ${w.join(" and ")}` : "";
};

/**
 * A card thumbnail, as our own card face (ThumbFace). Pass `onPress` + `label` to make it a button;
 * without them it's a picture (with words saying what it shows).
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
  const alt = `${card.name}, ${card.t}${card.out ? ", knocked out" : `, ${card.cur} of ${card.hp} HP`}${condWords(card)}${card.grabbed > 0 ? `, held by Team Rocket for ${card.grabbed} more ${card.grabbed === 1 ? "turn" : "turns"}` : ""}`;
  const style = { "--tc": TYPE_DOT[card.t] } as CSSProperties;
  const inner = (
    <>
      <ThumbFace card={card} pending={pending} />
      {children}
    </>
  );
  if (onPress) {
    return (
      <button type="button" className={classes} style={style} onClick={onPress} aria-label={label ? `${label}${condWords(card)}` : alt} aria-pressed={selected || undefined} data-card={card.index}>
        {inner}
      </button>
    );
  }
  return <span className={classes} style={style} data-card={card.index} role="img" aria-label={alt}>{inner}</span>;
}
