"use client";

/**
 * The whole card, bigger, in a CascadeDS Modal: its picture and the numbers the duel uses
 * (type, HP, Weakness, each move's Energy and damage). Card text is flavor in the duel, so the
 * picture is for looking at; the numbers are in words.
 */

import { Modal } from "@empac/cascadeds";
import type { DuelCardView } from "@/lib/originals/duel/view";
import { CardPicture, CostDots, TypeChip } from "./DuelBits";
import { energyWords } from "./duelLook";

export function DuelZoom({ card, owner, onClose }: { card: DuelCardView | null; owner: string; onClose: () => void }) {
  return (
    <Modal isOpen={!!card} onClose={onClose} title={card ? card.name : "Card"} size="small" className="duel-zoom">
      {card && (
        <div className="duel-zoom__body">
          <div className="duel-zoom__card"><CardPicture card={card} alt={`The ${card.name} card`} /></div>
          <p className="duel-zoom__meta">
            <span>{owner}</span>
            <TypeChip t={card.t} />
            <span>{card.out ? "Knocked out" : `${card.cur} of ${card.hp} HP`}</span>
            <span>{card.weak ? `Weak to ${card.weak}` : "No Weakness"}</span>
          </p>
          <ul className="duel-zoom__moves">
            {card.moves.map((m) => (
              <li key={m.n}>
                <span className="duel-zoom__move">{m.n}</span>
                <span className="duel-zoom__cost">
                  <CostDots cost={m.cost} energy={card.energy} />
                  <span className="sr-only">Costs {energyWords(m.cost)}.</span>
                </span>
                <strong>{m.d}</strong>
              </li>
            ))}
          </ul>
          <p className="duel-zoom__note">Only the numbers count in the duel: the card&apos;s own text is there to read.</p>
        </div>
      )}
    </Modal>
  );
}
