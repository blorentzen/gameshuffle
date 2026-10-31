"use client";

/**
 * A card on the field: the hologram, the card's own art window cropped into a glowing screen with
 * scanlines and a sheen (2:1 at every width), which is also the button that opens the card window.
 * It's the only picture of the card on the field (Britton, 2026-10-22: no doubled artwork; the small
 * card that sat beside it is gone). The hologram summons when a card comes onto the field, shakes when
 * hit and drops away on a knockout; during an exchange's beats a move's name shows on the attacker
 * and its damage pops on the card hit. All of that is decoration (aria-hidden): the name and
 * numbers beside it carry the facts in text, and the turn's announcement says what happened.
 * Our own drawing (CascadeDS has no game-board pieces); reduced motion turns its animations off.
 */

import type { ReactNode } from "react";
import { IconZoomIn } from "@tabler/icons-react";
import type { DuelCardView } from "@/lib/originals/duel/view";
import type { EnergyType } from "@/lib/originals/duel/types";
import type { HoloFx } from "./duelBeats";
import { CardConds, CondTag, EnergyOn, TypeChip, condWords } from "./DuelBits";
import { cardLabel, hpTone } from "./duelLook";

export type HoloMotion = "summon" | "hit" | "ko" | null;

export function DuelHolo({ card, motion, side, nonce }: { card: DuelCardView; motion: HoloMotion; side: "you" | "foe"; nonce: number }) {
  return (
    <div
      // A new key restarts the animation for each new picture of the field.
      key={`${side}-${card.index}-${nonce}`}
      className={`duel-holo duel-holo--${side}${motion ? ` duel-holo--${motion}` : ""}${card.img ? "" : " duel-holo--plain"}`}
      style={card.img ? ({ backgroundImage: `url("${card.img}")` } as React.CSSProperties) : undefined}
      aria-hidden="true"
    >
      {!card.img && <span>{cardLabel(card)}</span>}
    </div>
  );
}

export function DuelField({ card, side, owner, motion, nonce, fx, pending = null, onZoom, children }: {
  card: DuelCardView;
  side: "you" | "foe";
  /** "Bertha's" or "Your", for the card button's label. */
  owner: string;
  motion: HoloMotion;
  nonce: number;
  /** This beat's overlay: the move's name, or the damage taken. */
  fx?: HoloFx;
  /** Today's Energy placed on this card but not sent yet. */
  pending?: EnergyType | null;
  onZoom: () => void;
  children?: ReactNode;
}) {
  const tone = hpTone(card.cur, card.hp);
  const pop = fx?.pop;
  return (
    <div className={`duel-field duel-field--${side}`}>
      <div className="duel-field__info">
        <button type="button" className="duel-field__screen" onClick={onZoom} aria-label={`See ${owner} ${card.name} card`}>
          <DuelHolo card={card} motion={motion} side={side} nonce={nonce} />
          {fx?.tag && <span key={`tag-${nonce}`} className="duel-holo__tag" aria-hidden="true">{fx.tag}</span>}
          {pop && (
            <span key={`pop-${nonce}`} className="duel-holo__pop" aria-hidden="true">
              {pop.damage > 0 ? `−${pop.damage}` : pop.conds?.length ? null : "0"}
              {pop.weak && pop.damage > 0 && <span className="duel-badge duel-badge--x2">×2</span>}
              {pop.conds?.map((c) => <CondTag key={c} c={c} size="md" />)}
            </span>
          )}
          <span className="duel-field__zoom" aria-hidden="true"><IconZoomIn size={16} stroke={2} /></span>
        </button>
        <p className="duel-field__name">
          <b>{card.name}</b>
          <CardConds card={card} size="sm" />
          <span><span className="sr-only">HP </span>{card.cur} / {card.hp}<span aria-hidden="true"> HP</span><span className="sr-only">{condWords(card)}</span></span>
        </p>
        <span className="duel-field__hp" aria-hidden="true"><i className={`duel-hp--${tone}`} style={{ width: `${(card.cur / card.hp) * 100}%` }} /></span>
        <p className="duel-field__tags">
          <TypeChip t={card.t} />
          <span>{card.weak ? `Weak to ${card.weak}` : "No Weakness"}</span>
          <EnergyOn energy={card.energy} pending={pending} />
        </p>
        {children}
      </div>
    </div>
  );
}
