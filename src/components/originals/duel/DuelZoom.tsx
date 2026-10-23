"use client";

/**
 * The card window, in a CascadeDS Modal: our own Duel card (picks 2026-10-22,
 * https://claude.ai/artifact/534LAa7cDPtr1rsCvh39UE, direction A). The Duel borrows from the card but
 * never shows it as the card you play with (Britton): the card's art window, its type, HP and
 * Weakness, and each move as the Duel plays it (Energy, damage, the conditions it can put on, with
 * their chance). A key under it says what those conditions do. The real card is one tap away (See the
 * real card) for anyone who collects it.
 */

import { useState } from "react";
import { Button, Modal } from "@empac/cascadeds";
import type { DuelCardView } from "@/lib/originals/duel/view";
import type { DuelCondition } from "@/lib/originals/duel/types";
import { CardArt, CardConds, CardPicture, CondTag, CostDots, EnergyDot, MoveConds, condWords } from "./DuelBits";
import { CONDITION_LOOK, CONDITION_ORDER, TYPE_DOT, energyWords, hpTone } from "./duelLook";

/** Our Duel card, full size (the card window). */
export function DuelCardFace({ card, owner }: { card: DuelCardView; owner: string }) {
  return (
    <div className={`duel-face${card.out ? " duel-face--out" : ""}`} style={{ "--tc": TYPE_DOT[card.t] } as React.CSSProperties}>
      <div className="duel-face__head">
        <EnergyDot t={card.t} size="md" />
        <b className="duel-face__name">{card.name}</b>
        <CardConds card={card} size="sm" />
        <span className="duel-face__hp">
          {card.out ? "KO" : card.cur === card.hp ? card.hp : `${card.cur}/${card.hp}`}<small>HP</small>
        </span>
      </div>
      <p className="sr-only">{owner} {card.name}: {card.t}, {card.out ? "knocked out" : `${card.cur} of ${card.hp} HP`}{condWords(card)}, {card.weak ? `weak to ${card.weak}` : "no Weakness"}.</p>
      <CardArt card={card} className="duel-face__art" />
      {!card.out && <span className="duel-face__bar" aria-hidden="true"><i className={`duel-hp--${hpTone(card.cur, card.hp)}`} style={{ width: `${(card.cur / card.hp) * 100}%` }} /></span>}
      <ul className="duel-face__moves" aria-label="Moves">
        {card.moves.map((m) => (
          <li key={m.n}>
            <span className="duel-face__cost"><CostDots cost={m.cost} energy={card.energy} /></span>
            <span className="duel-face__move">{m.n}</span>
            <strong>{m.d}{m.plus ? (m.plus.startsWith("+") ? "+" : "×") : ""}</strong>
            <span className="sr-only">damage{m.plus ? `, ${m.plus}` : ""}. Costs {energyWords(m.cost)}.{m.fx.map((f) => ` ${f.chance}% chance to make it ${CONDITION_LOOK[f.c].word}.`).join("")}</span>
            {m.fx.length > 0 && <span className="duel-face__fx"><MoveConds fx={m.fx} /></span>}
            {m.plus && <span className="duel-face__plus" aria-hidden="true">{m.plus.startsWith("+") ? m.plus : `${m.plus.split(" ")[0]} damage ${m.plus.split(" ").slice(1).join(" ")}`}</span>}
          </li>
        ))}
      </ul>
      <p className="duel-face__weak">
        {card.weak ? <><EnergyDot t={card.weak} size="sm" /><span>Weak to {card.weak}: double damage</span></> : <span>No Weakness</span>}
      </p>
    </div>
  );
}

export function DuelZoom({ card, owner, onClose }: { card: DuelCardView | null; owner: string; onClose: () => void }) {
  const [real, setReal] = useState<string | null>(null);
  const showReal = !!card && real === card.id;
  // The conditions on this card's moves or on the card now: the key says what each does.
  const conds: DuelCondition[] = card
    ? CONDITION_ORDER.filter((c) => card.moves.some((m) => m.fx.some((f) => f.c === c)) || card.cond === c || (c === "confused" && card.confused))
    : [];
  return (
    <Modal isOpen={!!card} onClose={() => { setReal(null); onClose(); }} title={card ? card.name : "Card"} size="small" className="duel-zoom">
      {card && (
        <div className="duel-zoom__body">
          {showReal ? (
            <>
              <div className="duel-zoom__card"><CardPicture card={card} alt={`The ${card.name} card`} /></div>
              <p className="duel-zoom__note">The real card, from the Pokémon TCG. The Duel plays its own version: moves play their damage and conditions, and the rest of the card isn&apos;t used.</p>
              <Button variant="secondary" onClick={() => setReal(null)}>Back to the Duel card</Button>
            </>
          ) : (
            <>
              <DuelCardFace card={card} owner={owner} />
              {conds.length > 0 && (
                <ul className="duel-zoom__key" aria-label="What the conditions do">
                  {conds.map((c) => (
                    <li key={c}><CondTag c={c} size="sm" label={CONDITION_LOOK[c].word} /><span><b>{CONDITION_LOOK[c].word}.</b> {CONDITION_LOOK[c].what}</span></li>
                  ))}
                  <li className="duel-zoom__key-note">Swapping a card out cures it.</li>
                </ul>
              )}
              {card.img && <Button variant="ghost" onClick={() => setReal(card.id)}>See the real card</Button>}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
