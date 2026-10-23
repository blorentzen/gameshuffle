"use client";

/**
 * The turn window (arena pass, picks 2026-10-23, https://claude.ai/artifact/BXp1RfGmpEis5UanYC4bdb,
 * all as recommended). It opens at the start of each turn, on a CascadeDS Modal:
 *   1  Play an Energy: the hand (CascadeDS Chips; the next draws beside it), then every card you can
 *      put it on with its HP, Energy and moves. Each move's dots show where this Energy would go, and
 *      "Ready with Water" marks a move it would finish. It opens on the Energy your card on the field
 *      needs most, on that card (or on the professor's play when there is one). Tap a card's picture
 *      for the whole card.
 *   2  Who fights this turn: keep your card on the field (back to the battle, where only attacks and
 *      End turn are left), or swap one in (that sends the turn: no attack). Skipped when nothing can
 *      come in.
 * Ask the professor sits at the bottom of both steps. On a scored day's official duel the first ask
 * ends the solo bonus (the arena asks first). Closing the window keeps what's picked.
 *
 * The card rows are our own drawing (CascadeDS has no picture option list: on the CDS fix list);
 * each is a <button aria-pressed> with a separate button on its picture for the card window.
 */

import { useEffect, useRef, type ReactNode } from "react";
import { Button, Chip as CdsChip, Modal } from "@empac/cascadeds";
import { IconArrowsExchange, IconBulb, IconRocket, IconZoomIn } from "@tabler/icons-react";
import type { DuelCardView, DuelHintView, DuelPlayView } from "@/lib/originals/duel/view";
import type { EnergyType } from "@/lib/originals/duel/types";
import { CardConds, CardThumb, EnergyDot, MoveConds, condWords } from "./DuelBits";
import { cardLabel, coveredDots, covers, energyWords } from "./duelLook";

export type TurnStep = 1 | 2;

/** A move's cost as dots: filled where the card's Energy covers it, ringed in white where `add` would. */
function CostWith({ cost, energy, add }: { cost: readonly EnergyType[]; energy: readonly EnergyType[]; add: EnergyType | null }) {
  if (!cost.length) return <span className="duel-cost duel-cost--free">Free</span>;
  const before = coveredDots(energy, cost);
  const after = add ? coveredDots([...energy, add], cost) : before;
  return (
    <span className="duel-cost" aria-hidden="true">
      {cost.map((t, i) => <EnergyDot key={i} t={t} on={after[i]} fresh={after[i] && !before[i]} size="sm" />)}
    </span>
  );
}

/** One card in step 1: picture (opens the card window), name and tags, HP and Energy, its moves. */
function CardRow({ card, foe, add, picked, tip, field, onPick, onZoom, disabled }: {
  card: DuelCardView;
  foe: DuelCardView | null;
  add: EnergyType | null;
  picked: boolean;
  tip: boolean;
  field: boolean;
  onPick: () => void;
  onZoom: () => void;
  disabled: boolean;
}) {
  const weak = card.moves.some((m) => m.weak);
  const moveWords = card.moves.map((m) => {
    const now = covers(card.energy, m.cost);
    const withAdd = !now && !!add && covers([...card.energy, add], m.cost);
    return `${m.n}, ${m.damage ?? m.d} damage, costs ${energyWords(m.cost)}${now ? ", ready" : withAdd ? `, ready with ${add}` : ""}`;
  }).join(". ");
  return (
    <li className={`duel-trow${picked ? " duel-trow--on" : ""}${tip ? " duel-trow--tip" : ""}`}>
      <CardThumb card={card} size="sm" onPress={onZoom} label={`See the ${card.name} card`} className="duel-trow__pic" />
      <button
        type="button"
        className="duel-trow__main"
        onClick={onPick}
        disabled={disabled}
        aria-pressed={picked}
        data-attach={card.index}
        aria-label={`Put it on ${card.name}${field ? ", on the field" : ""}: ${card.cur} of ${card.hp} HP${condWords(card)}. Energy on it: ${energyWords(card.energy)}. ${moveWords}.${tip ? " The professor's pick." : ""}`}
      >
        <span className="duel-trow__head" aria-hidden="true">
          <b>{card.name}</b>
          <CardConds card={card} size="xs" />
          {field && <span className="duel-tag">On the field</span>}
          {card.grabbed > 0 && <span className="duel-tag duel-tag--bad"><IconRocket size={12} stroke={2} />Team Rocket</span>}
          {weak && foe && <span className="duel-tag duel-tag--x2">×2 vs {cardLabel(foe)}</span>}
          {tip && <span className="duel-tip">Tip</span>}
        </span>
        <span className="duel-trow__meta" aria-hidden="true">
          <span>{card.cur}/{card.hp} HP</span>
          {card.energy.length > 0 ? <span className="duel-energy">{card.energy.map((t, i) => <EnergyDot key={i} t={t} size="sm" />)}</span> : <span>No Energy</span>}
        </span>
        <span className="duel-trow__moves" aria-hidden="true">
          {card.moves.map((m) => {
            const now = covers(card.energy, m.cost);
            const withAdd = !now && !!add && covers([...card.energy, add], m.cost);
            return (
              <span key={m.n} className="duel-trow__move">
                <span className="duel-trow__mname">{m.n}</span>
                <CostWith cost={m.cost} energy={card.energy} add={add} />
                <MoveConds fx={m.fx} size="xs" />
                <b className={m.weak ? "duel-up" : undefined}>{m.damage ?? m.d}</b>
                {withAdd ? <span className="duel-ready duel-ready--new">Ready with {add}</span> : now ? <span className="duel-ready">Ready</span> : null}
              </span>
            );
          })}
        </span>
      </button>
    </li>
  );
}

export function DuelTurn({ open, step, play, attach, use, now, hint, bar, event, busy, ask, onUse, onAttach, onNext, onKeep, onSwap, onStep, onClose, onZoom }: {
  open: boolean;
  step: TurnStep;
  play: DuelPlayView;
  /** The card the Energy is on. */
  attach: number;
  /** Rules 5: which Energy in the hand (0 without a hand). */
  use: number;
  /** The Energy you'll play. */
  now: EnergyType | null;
  hint: DuelHintView | null;
  /** The events bar's chips (the window covers the bar). */
  bar: ReactNode;
  /** This turn's event, as a card at the top (it stays while the window is open). */
  event: ReactNode;
  busy: boolean;
  /** Ask the professor: shown when there's no tip yet; `costs` = it ends the solo bonus. */
  ask: { show: boolean; costs: boolean; busy: boolean; onAsk: () => void; escape: boolean };
  onUse: (i: number) => void;
  onAttach: (i: number) => void;
  /** Step 1's button: on to step 2 (or back to the battle when nothing can come in). */
  onNext: () => void;
  onKeep: () => void;
  onSwap: (i: number) => void;
  onStep: (s: TurnStep) => void;
  onClose: () => void;
  onZoom: (c: DuelCardView) => void;
}) {
  const hand = play.energy.hand;
  const foe = play.foe[play.fi] ?? null;
  const field = play.yi >= 0 ? play.you[play.yi] : null;
  const target = play.you[attach];
  const cards = play.attachTo.map((i) => play.you[i]);
  // The card on the field first, then the others in their order.
  cards.sort((a, b) => (a.index === play.yi ? -1 : b.index === play.yi ? 1 : a.index - b.index));
  const canSwap = play.swaps.length > 0;
  // When the pick moves to another card (the professor's pick can be at the bottom of the list), that
  // card scrolls into view. Not on opening: the window opens at the top, on this turn's event.
  const shownAttach = useRef<number | null>(null);
  useEffect(() => {
    if (!open || step !== 1) { shownAttach.current = null; return; }
    if (shownAttach.current === null || shownAttach.current === attach) { shownAttach.current = attach; return; }
    shownAttach.current = attach;
    const t = window.setTimeout(() => document.querySelector(`.duel-turnwin [data-attach="${attach}"]`)?.closest("li")?.scrollIntoView({ block: "nearest" }), 60);
    return () => window.clearTimeout(t);
  }, [open, step, attach]);
  const tipSwap = hint && "swap" in hint.act ? hint.act.swap : null;

  const askLine = ask.show ? (
    <div className="duel-ask">
      <Button variant="ghost" size="small" className="duel-ask__btn" onClick={ask.onAsk} disabled={ask.busy || busy} iconBefore={IconBulb}>
        {ask.busy ? "Asking…" : "Ask the professor"}
      </Button>
      {ask.costs && <span className="duel-ask__note">Ends the solo bonus</span>}
    </div>
  ) : null;

  const footer = step === 1 ? (
    <div className="duel-turnwin__foot">
      <Button variant="primary" size="large" className="duel-turnwin__go" onClick={onNext} disabled={busy || !now} data-turn-next>
        {now && target ? `Put ${now} on ${cardLabel(target)}` : "Next"}
      </Button>
      {askLine}
    </div>
  ) : (
    <div className="duel-turnwin__foot">{askLine}</div>
  );

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={step === 1 ? "Play an Energy" : "Who fights this turn"}
      size="medium"
      className="duel-turnwin"
      closeOnEscape={ask.escape}
      footer={footer}
    >
      <ol className="duel-steps" aria-label="Steps">
        <li aria-current={step === 1 ? "step" : undefined}>Energy</li>
        <li aria-current={step === 2 ? "step" : undefined}>Who fights</li>
      </ol>
      {event}
      {bar}
      {hint && <p className="duel-tipline"><span className="duel-tip" aria-hidden="true">Tip</span><span><span className="sr-only">The professor suggests: </span>{hint.text}</span></p>}

      {step === 1 && (
        <>
          <div className="duel-turnwin__hand">
            {hand ? (
              <span className="duel-hand" role="group" aria-label="Your Energy">
                {hand.map((t, i) => (
                  <CdsChip
                    key={i}
                    clickable
                    selected={i === use}
                    disabled={busy}
                    size="medium"
                    icon={<EnergyDot t={t} size="sm" />}
                    label={t}
                    onClick={() => onUse(i)}
                    className={`duel-hand__e${hint?.use === i && hint.attach === attach && i !== use ? " duel-hand__e--tip" : ""}`}
                    aria-label={`${t} Energy${i === use ? ", picked" : ""}${hint?.use === i ? ". The professor's pick." : ""}`}
                  />
                ))}
              </span>
            ) : now ? (
              <span className="duel-turnwin__one"><EnergyDot t={now} size="lg" />{now} Energy</span>
            ) : null}
            {play.energy.next.length > 0 && (
              <span className="duel-turnwin__next">
                <span aria-hidden="true">Next draws</span>
                <span className="sr-only">You draw next: {energyWords(play.energy.next)}.</span>
                <span className="duel-turnwin__dots" aria-hidden="true">{play.energy.next.map((t, i) => <EnergyDot key={i} t={t} on={false} size="sm" />)}</span>
              </span>
            )}
          </div>
          <p className="duel-turnwin__label" id="duel-put-on">Put it on</p>
          <ul className="duel-trows" aria-labelledby="duel-put-on">
            {cards.map((c) => (
              <CardRow
                key={c.index}
                card={c}
                foe={foe}
                add={now}
                picked={c.index === attach}
                tip={!!hint && hint.attach === c.index && c.index !== attach}
                field={c.index === play.yi}
                onPick={() => onAttach(c.index)}
                onZoom={() => onZoom(c)}
                disabled={busy}
              />
            ))}
          </ul>
        </>
      )}

      {step === 2 && field && (
        <>
          <p className="duel-turnwin__played">
            {now && <EnergyDot t={now} size="sm" />}
            <span>{now ? `${now} Energy on ${target ? cardLabel(target) : ""}` : "No Energy this turn"}</span>
            <Button variant="ghost" size="small" onClick={() => onStep(1)} disabled={busy} aria-label="Change the Energy">Change</Button>
          </p>
          <Button variant="primary" size="large" className="duel-turnwin__keep" onClick={onKeep} disabled={busy} data-keep>
            Keep {cardLabel(field)}
          </Button>
          {canSwap && (
            <>
              <p className="duel-turnwin__label" id="duel-swap-in">Or swap one in <span>No attack this turn</span></p>
              <ul className="duel-trows duel-trows--swap" aria-labelledby="duel-swap-in">
                {play.swaps.map((i) => {
                  const c = play.you[i];
                  const best = c.moves.reduce((n, m) => Math.max(n, m.damage ?? m.d), 0);
                  const tip = tipSwap === i;
                  return (
                    <li key={i} className={`duel-trow${tip ? " duel-trow--tip" : ""}`}>
                      <CardThumb card={c} size="sm" pending={attach === i ? now : null} onPress={() => onZoom(c)} label={`See the ${c.name} card`} className="duel-trow__pic" />
                      <button type="button" className="duel-trow__main" onClick={() => onSwap(i)} disabled={busy} data-swap-in={i}
                        aria-label={`Swap in ${c.name}: ${c.cur} of ${c.hp} HP${condWords(c)}, hits for up to ${best}. Uses your turn.${tip ? " The professor's pick." : ""}`}>
                        <span className="duel-trow__head" aria-hidden="true">
                          <b>{c.name}</b>
                          <CardConds card={c} size="xs" />
                          {tip && <span className="duel-tip">Tip</span>}
                        </span>
                        <span className="duel-trow__meta" aria-hidden="true">
                          <span>{c.cur}/{c.hp} HP</span>
                          <span>Up to <b>{best}</b></span>
                          {c.energy.length > 0 && <span className="duel-energy">{c.energy.map((t, k) => <EnergyDot key={k} t={t} size="sm" />)}</span>}
                        </span>
                        <span className="duel-trow__swap" aria-hidden="true"><IconArrowsExchange size={16} stroke={2} />Swap in</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
      <p className="duel-turnwin__zoomhint"><IconZoomIn size={14} stroke={2} aria-hidden="true" />Tap a picture for the whole card</p>
    </Modal>
  );
}
