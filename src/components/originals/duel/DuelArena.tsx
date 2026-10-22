"use client";

/**
 * The Daily Duel's arena: one visual world in any theme (a dark game screen), after the picks
 * page's playable mockup (https://claude.ai/artifact/5fdauqQ8MPof41oWXYcuPk), made lighter to read
 * (picks https://claude.ai/artifact/VL1NYSQ6NLRwxmMymXQq1y). Top to bottom: the trainer's bar with
 * their round picture and pips, their waiting cards, their card on the field (tilted card + hologram), the middle
 * (the scoreline of what just happened, this turn's event, what's in play, the "Next turn" chip and
 * the Energy row), your card on the field, your moves, your waiting cards, your bar with the turn
 * and the clock.
 *
 * A turn is one tap for most turns: today's Energy starts on your card on the field (a ringed
 * dot), so a move, Wait or a swap sends the turn. Tap a waiting card first to put the Energy there
 * instead (tap it again, or "Back to", to bring it back). Swap is its own button: press it, then
 * tap the card to bring in. Nothing reaches the server until the move, Wait or swap. The card
 * picker covers the arena when a card is needed (the lead, or after a knockout).
 *
 * Screen readers hear the whole turn in full sentences (the polite announcement); the screen
 * shows the short version. The board pieces (cards, hologram, Energy dots, pips, scoreline) are
 * our own drawings; the moves, Wait, Swap, "Back to" and the turn log button are CascadeDS.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { Icon } from "@tabler/icons-react";
import { Button, IconButton, Modal } from "@empac/cascadeds";
import { IconArrowsExchange, IconBolt, IconCrown, IconHourglass, IconList, IconMoodAngry, IconRocket, IconSpiral, IconStopwatch, IconZoomIn, IconZzz } from "@tabler/icons-react";
import type { DuelCardView, DuelPlayView, DuelRunView } from "@/lib/originals/duel/view";
import type { DuelAct, EnergyType } from "@/lib/originals/duel/types";
import type { ArenaMotion } from "./duelBeats";
import { CardPicture, CardThumb, CostDots, EnergyDot, Pips, TypeChip } from "./DuelBits";
import { DuelField } from "./DuelHolo";
import { DuelEventBanner, DuelForecast } from "./DuelEvent";
import { TrainerArt } from "./TrainerArt";
import { WEATHER_CHIP, cardLabel, clockText, energyWords, eventLines, eventOutcome, isEventLine, lineText, scoreRows, type ScoreRow } from "./duelLook";

export type { ArenaMotion };

/** The running clock (its own component, so only it redraws each second). */
function DuelClock({ startedAt, offset }: { startedAt: number; offset: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <span className="duel-clock" role="timer" aria-label="Time on this duel">
      <IconStopwatch size={16} stroke={2} aria-hidden="true" />
      <span>{clockText(now + offset - startedAt)}</span>
    </span>
  );
}

/** A status chip: an icon and a word or two on screen, the full words for screen readers. */
function Chip({ icon: Glyph, text, full, tone }: { icon?: Icon; text: string; full: string; tone?: "good" | "bad" }) {
  return (
    <span className={`duel-chip${tone ? ` duel-chip--${tone}` : ""}`}>
      {Glyph && <Glyph size={14} stroke={2} aria-hidden="true" />}
      <span aria-hidden="true">{text}</span>
      <span className="sr-only">{full}</span>
    </span>
  );
}

/** The scoreline: one row per move (×2 on a Weakness, KO on a knockout), a skipped move, a swap, the sandstorm. */
function Scoreline({ rows, reveal, trainer, onLog }: { rows: ScoreRow[]; reveal: number; trainer: string; onLog: () => void }) {
  const who = (side: "you" | "foe") => (side === "you" ? "You" : trainer);
  return (
    <div className="duel-score">
      <ul className="duel-score__rows" aria-label="Last turn">
        {rows.map((r) => (
          <li key={r.key} className={`duel-score__row${r.at >= reveal ? " duel-score__row--later" : ""}`}>
            {r.kind === "move" && (
              <>
                <span className="duel-score__who">{who(r.side)}</span>
                <b>{r.move}</b>
                <span className="duel-score__dmg">{r.damage}</span>
                {r.weak && r.damage > 0 && <span className="duel-badge duel-badge--x2" aria-hidden="true">×2</span>}
                {r.ko && <span className="duel-badge duel-badge--ko" aria-hidden="true">KO</span>}
                <span className="sr-only">{r.weak && r.damage > 0 ? ", super effective" : ""}{r.ko ? ", knocked out" : ""}</span>
              </>
            )}
            {r.kind === "skip" && (
              <>
                <span className="duel-score__who">{who(r.side)}</span>
                {r.why === "asleep" ? <IconZzz size={16} stroke={2} aria-hidden="true" /> : <IconMoodAngry size={16} stroke={2} aria-hidden="true" />}
                <b>{r.why === "asleep" ? "Asleep" : "Stubborn"}</b>
                <span className="sr-only">, no move</span>
              </>
            )}
            {r.kind === "swap" && (
              <>
                <span className="duel-score__who">You</span>
                <span>Swap in</span>
                <b>{r.card}</b>
              </>
            )}
            {r.kind === "sand" && (
              <>
                <span className="duel-score__who">Sandstorm</span>
                {r.hits.map((h, k) => (
                  <span key={k} className="duel-score__hit"><b>{h.card}</b><span className="duel-score__dmg">{h.damage}</span></span>
                ))}
              </>
            )}
          </li>
        ))}
      </ul>
      <IconButton variant="secondary" size="small" className="duel-score__log" onClick={onLog} aria-label="Turn log">
        <IconList size={18} stroke={2} aria-hidden="true" />
      </IconButton>
    </div>
  );
}

export function DuelArena({ run, play, motion, busy, staging, offset, onNext, onTurn, onZoom, onSkip }: {
  run: DuelRunView;
  /** The picture to draw (an exchange's beats first, then the new turn). */
  play: DuelPlayView;
  motion: ArenaMotion;
  busy: boolean;
  /** The exchange is still playing its beats (a tap or Escape skips to the end). */
  staging: boolean;
  /** Server time minus this browser's, for the clock. */
  offset: number;
  onNext: (card: number) => void;
  onTurn: (attach: number, act: DuelAct) => void;
  onZoom: (card: DuelCardView, owner: string) => void;
  onSkip: () => void;
}) {
  const trainer = run.trainer.name;
  const their = `${trainer}'s`;
  const you = play.yi >= 0 ? play.you[play.yi] : null;
  const foe = play.foe[play.fi] ?? null;
  const turnLive = play.attachTo.length > 0 && !play.over && !play.needsNext;
  const now = play.energy.now;

  // This turn's choices, kept with the turn they belong to (a new turn starts clean): where the
  // Energy goes (null = your card on the field) and whether Swap is pressed.
  const [choice, setChoice] = useState<{ turn: number; attach: number | null; swapping: boolean }>({ turn: -1, attach: null, swapping: false });
  const mine = choice.turn === play.turn && turnLive;
  const fieldTakes = turnLive && !!now && play.attachTo.includes(play.yi);
  const picked = mine && choice.attach !== null && play.attachTo.includes(choice.attach) ? choice.attach : null;
  /** The card today's Energy is on (null between turns). */
  const attach: number | null = turnLive && now ? (picked ?? (fieldTakes ? play.yi : null)) : null;
  const swapping = mine && choice.swapping && play.swaps.length > 0;
  /** What a screen reader hears when you move the Energy. */
  const [energyNote, setEnergyNote] = useState("");
  const [logOpen, setLogOpen] = useState(false);

  const movesRef = useRef<HTMLDivElement>(null);
  const benchRef = useRef<HTMLDivElement>(null);
  const turnRef = useRef<HTMLSpanElement>(null);
  const pickRef = useRef<HTMLHeadingElement>(null);
  const touched = useRef(false);
  // Keyboard or pointer last: a keyboard player's focus scrolls into view, a tap doesn't move the page.
  const byKey = useRef(false);

  const putEnergy = (i: number) => {
    if (!now || !you) return;
    touched.current = true;
    const to = attach === i && i !== play.yi ? play.yi : i;
    setChoice({ turn: play.turn, attach: to, swapping: false });
    setEnergyNote(`Today's ${now} Energy is on ${play.you[to].name}.`);
  };
  const toggleSwap = () => {
    touched.current = true;
    const on = !swapping;
    setChoice({ turn: play.turn, attach, swapping: on });
    // Keyboard players land on the first card they can bring in.
    if (on && byKey.current) requestAnimationFrame(() => benchRef.current?.querySelector<HTMLButtonElement>(".duel-thumb--swap")?.focus());
  };
  const cancelSwap = () => {
    setChoice({ turn: play.turn, attach, swapping: false });
    if (byKey.current) requestAnimationFrame(() => movesRef.current?.querySelector<HTMLButtonElement>("[data-swap]")?.focus());
  };
  const act = (a: DuelAct) => {
    if (attach === null || busy) return;
    touched.current = true;
    // The pressed button is disabled while the turn is sent: a keyboard player waits on the turn
    // label (not the page), and lands on this turn's first move once it's back.
    if (byKey.current) turnRef.current?.focus({ preventScroll: true });
    onTurn(attach, a);
  };

  // Escape skips the beats wherever focus is.
  useEffect(() => {
    if (!staging) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onSkip(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [staging, onSkip]);

  // A new picture of the field, once the turn is back and its beats are done: focus goes to the
  // next step (the card picker, or this turn's first move or Wait) unless it's still on a control
  // in the arena; with nothing to press, to the turn.
  useEffect(() => {
    if (!touched.current || play.over || staging || busy) return;
    const opts = { preventScroll: !byKey.current };
    if (play.needsNext) { pickRef.current?.focus(opts); return; }
    const a = document.activeElement as HTMLElement | null;
    const kept = a && a !== document.body && a !== turnRef.current && a.isConnected && !(a as HTMLButtonElement).disabled && a.closest(".duel-arena__body");
    if (kept) return;
    const btn = movesRef.current?.querySelector<HTMLButtonElement>("[data-move]:not(:disabled), [data-wait]:not(:disabled)");
    if (btn) { btn.focus(opts); return; }
    turnRef.current?.focus(opts);
  }, [play, busy, staging]);

  const allRows = useMemo(() => scoreRows(play.log, play.you, play.foe), [play.log, play.you, play.foe]);
  const reveal = staging && motion.reveal != null ? motion.reveal : Infinity;
  const outcome = play.event ? eventOutcome(play.event, play.log, play.you, play.foe) : null;

  // The whole turn in full sentences for screen readers (once the beats are done): what happened,
  // the event that flipped and what it did, then what to do now.
  const announce = useMemo(() => {
    if (staging) return "";
    const parts = play.log.filter((l) => !(l.kind === "energy" && l.side === "you") && !isEventLine(l)).map(lineText);
    if (play.event) parts.push(`${play.event.title}. ${play.event.text}`, ...eventLines(play.log).map(lineText));
    if (play.over) parts.push(play.over === "won" ? `You beat ${trainer}.` : `${trainer} wins.`);
    else if (play.needsNext) parts.push(play.yi < 0 ? "Pick your lead." : "Pick your next card.");
    else if (turnLive && now && you) parts.push(`Turn ${play.turn}. Today's ${now} Energy is on your ${you.name}.`);
    return parts.join(" ");
  }, [staging, play.log, play.event, play.over, play.needsNext, play.yi, play.turn, turnLive, now, you, trainer]);

  const inPlay = play.inPlay;
  const midChips: React.ReactNode[] = [];
  if (inPlay.weather) {
    const w = WEATHER_CHIP[inPlay.weather.kind];
    const n = inPlay.weather.turnsLeft;
    midChips.push(<Chip key="weather" icon={w.icon} text={`${w.word} · ${n}`} full={`${w.word}: ${n} ${n === 1 ? "turn" : "turns"} left.`} />);
  }
  if (inPlay.rocket) {
    const c = play.you[inPlay.rocket.card];
    const n = inPlay.rocket.turnsLeft;
    midChips.push(<Chip key="rocket" icon={IconRocket} tone="bad" text={`Team Rocket · ${cardLabel(c)} · ${n}`} full={`Team Rocket has your ${c.name} for ${n} more ${n === 1 ? "turn" : "turns"}. You can't swap to it.`} />);
  }

  const energyFor = (c: DuelCardView): EnergyType[] => (attach === c.index && now ? [...c.energy, now] : c.energy);
  const picker = play.needsNext && !play.over;
  const lone = you ? you.moves.length % 2 === 1 : false;
  const logLines = play.log.filter((l) => !isEventLine(l));

  return (
    <div
      className={`duel-arena${run.official ? "" : " duel-arena--practice"}`}
      data-turn={play.turn} data-yi={play.yi} data-fi={play.fi} data-over={play.over ?? undefined} data-staging={staging || undefined}
      onKeyDown={(e) => {
        byKey.current = true;
        if (staging && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSkip(); return; }
        if (swapping && e.key === "Escape") cancelSwap();
      }}
      onPointerDown={() => { byKey.current = false; if (staging) onSkip(); }}
    >
      <h2 className="sr-only">{run.official ? "Today's duel" : "Practice duel"} against {trainer}</h2>
      <p className="sr-only" aria-live="polite">{announce}</p>
      <p className="sr-only" aria-live="polite">{energyNote}</p>
      <div className="duel-arena__body" inert={picker || play.over !== null ? true : undefined}>
        <div className="duel-bar duel-bar--foe">
          {run.trainer.picture && <TrainerArt picture={run.trainer.picture} shape="round" className="duel-bar__face" />}
          <div className="duel-bar__who">
            <b>{trainer}</b>
            <span>{run.trainer.title}</span>
          </div>
          <Pips cards={play.foe} who={trainer} />
        </div>

        <div className="duel-bench duel-bench--foe" aria-label={`${their} waiting cards`} role="group">
          {play.foe.map((c) => (c.index === play.fi && !c.out ? null : (
            <CardThumb key={c.index} card={c} onPress={() => onZoom(c, their)} label={`See ${their} ${c.name} card${c.out ? ", knocked out" : `, ${c.cur} of ${c.hp} HP`}`} />
          )))}
        </div>

        {foe && !foe.out && (
          <DuelField card={foe} side="foe" owner={their} motion={motion.foe} nonce={motion.nonce} fx={motion.fx?.foe} onZoom={() => onZoom(foe, their)}>
            <ul className="duel-foe-moves" aria-label={`${their} ${cardLabel(foe)}: moves`}>
              {foe.moves.map((m, i) => {
                const next = play.advice?.move === i;
                return (
                  <li key={m.n} className={next ? "duel-foe-moves__next" : undefined}>
                    <span className="duel-foe-moves__name">{m.n}</span>
                    <CostDots cost={m.cost} energy={foe.energy} />
                    <span className="sr-only">, needs {energyWords(m.cost)}{m.ready ? ", ready" : ""}</span>
                    <strong className={m.weak ? "duel-up" : undefined}>{m.damage ?? m.d}<span className="sr-only"> damage to your card{m.weak ? ", super effective" : ""}</span></strong>
                    {next && <em>Next</em>}
                  </li>
                );
              })}
            </ul>
            {(inPlay.foeAsleep || inPlay.foeStubborn || inPlay.boost > 0) && (
              <p className="duel-chips">
                {inPlay.foeAsleep && <Chip icon={IconZzz} text="Asleep" full="Asleep: it skips its next move." />}
                {!inPlay.foeAsleep && inPlay.foeStubborn && <Chip icon={IconMoodAngry} text="Stubborn" full="Stubborn: it skips its next move." />}
                {inPlay.boost > 0 && <Chip icon={IconCrown} tone="bad" text={`Next move +${inPlay.boost}`} full={`${their} next move does ${inPlay.boost} more.`} />}
              </p>
            )}
          </DuelField>
        )}

        <div className="duel-mid">
          {allRows.length > 0 && <Scoreline key={motion.beatKey} rows={allRows} reveal={reveal} trainer={trainer} onLog={() => setLogOpen(true)} />}
          {play.event && <DuelEventBanner event={play.event} outcome={outcome} picture={run.trainer.picture} />}
          {midChips.length > 0 && <p className="duel-chips">{midChips}</p>}
          {play.forecast && !play.over && play.yi >= 0 && <DuelForecast event={play.forecast} hidden={staging} picture={run.trainer.picture} />}
          {play.yi >= 0 && !play.over && (
            <div className="duel-row">
              <span className="duel-row__label">Energy</span>
              {now && <EnergyDot t={now} size="lg" />}
              {now && attach !== null && <span className="duel-row__on" aria-hidden="true">on {cardLabel(play.you[attach])}</span>}
              {play.energy.next.length > 0 && (
                <span className="duel-row__next">
                  <span className="sr-only">Energy still to come: {energyWords(play.energy.next)}.</span>
                  <span aria-hidden="true" className="duel-row__dots">{play.energy.next.map((t, i) => <EnergyDot key={i} t={t} on={false} />)}</span>
                </span>
              )}
              {now && attach !== null && attach !== play.yi && you && (
                <Button variant="ghost" size="small" className="duel-row__back" onClick={() => putEnergy(play.yi)} disabled={busy} aria-label={`Put today's ${now} Energy back on ${you.name}`}>
                  Back to {cardLabel(you)}
                </Button>
              )}
            </div>
          )}
        </div>

        {you && !you.out && !play.needsNext && (
          <DuelField card={you} side="you" owner="your" motion={motion.you} nonce={motion.nonce} fx={motion.fx?.you} pending={attach === you.index ? now : null} onZoom={() => onZoom(you, "Your")}>
            {(inPlay.crit || inPlay.confused || inPlay.youStubborn) && (
              <p className="duel-chips">
                {inPlay.crit && <Chip icon={IconBolt} tone="good" text="Critical ×1.5" full="Critical hit: your next move does half again as much." />}
                {inPlay.confused && <Chip icon={IconSpiral} tone="bad" text="Confused: half" full="Confused: your next move does half damage." />}
                {inPlay.youStubborn && <Chip icon={IconMoodAngry} tone="bad" text="Stubborn" full="Stubborn: no move this turn. You can wait or swap." />}
              </p>
            )}
          </DuelField>
        )}

        {you && !you.out && !play.needsNext && (
          <div className="duel-moves" ref={movesRef} role="group" aria-label="Your move">
            {you.moves.map((m, i) => {
              const ok = attach !== null && play.canMove && (attach === you.index ? m.readyWithNew : m.ready);
              const dmg = m.damage ?? m.d;
              const tone = dmg > m.d ? " duel-up" : dmg < m.d ? " duel-down" : "";
              const why = !turnLive ? "" : !play.canMove ? " Your card can't move this turn." : ok ? " Ready." : " Needs more Energy.";
              return (
                <Button
                  key={`${you.index}-${m.n}`}
                  variant="secondary"
                  className={`duel-move${ok ? " duel-move--ready" : ""}${lone && i === you.moves.length - 1 ? " duel-move--wide" : ""}`}
                  disabled={!ok || busy}
                  onClick={() => act({ move: i })}
                  data-move={i}
                  aria-label={`${m.n}: ${dmg} damage${m.weak && dmg > 0 ? ", super effective" : ""}. Costs ${energyWords(m.cost)}.${why}`}
                >
                  <span className="duel-move__top">
                    <span className="duel-move__name">{m.n}</span>
                    <span className="duel-move__hit">
                      {m.weak && dmg > 0 && <span className="duel-badge duel-badge--x2">×2</span>}
                      <span className={`duel-move__dmg${tone}`}>{dmg}</span>
                    </span>
                  </span>
                  <CostDots cost={m.cost} energy={energyFor(you)} />
                </Button>
              );
            })}
            <Button variant="secondary" className="duel-move duel-move--alt" disabled={attach === null || busy} onClick={() => act({ wait: true })} data-wait aria-label="Wait: no move this turn">
              <span className="duel-move__top"><span className="duel-move__name"><IconHourglass size={18} stroke={2} aria-hidden="true" />Wait</span></span>
            </Button>
            <Button
              variant="secondary"
              className={`duel-move duel-move--alt${swapping ? " duel-move--on" : ""}`}
              disabled={attach === null || busy || play.swaps.length === 0}
              onClick={toggleSwap}
              aria-pressed={swapping}
              data-swap
              aria-label={play.swaps.length ? "Swap: pick a waiting card to bring in. Uses your turn." : "Swap: no card can come in"}
            >
              <span className="duel-move__top"><span className="duel-move__name"><IconArrowsExchange size={18} stroke={2} aria-hidden="true" />Swap</span></span>
            </Button>
            {swapping && (
              <p className="duel-movenote">
                <span>Tap a waiting card to swap it in.</span>
                <Button variant="ghost" size="small" onClick={cancelSwap}>Cancel</Button>
              </p>
            )}
            {!swapping && turnLive && play.turn === 1 && <p className="duel-movenote">Tap a move, or tap a waiting card to give it the Energy.</p>}
          </div>
        )}

        <div className="duel-bench duel-bench--you" role="group" aria-label="Your waiting cards" ref={benchRef}>
          {play.you.map((c) => {
            if (c.index === play.yi && !c.out && !play.needsNext) return null;
            const holds = attach === c.index;
            const canSwap = turnLive && swapping && play.swaps.includes(c.index);
            const canGive = turnLive && !swapping && !!now && !!you && play.attachTo.includes(c.index);
            const hp = `${c.cur} of ${c.hp} HP`;
            const label = canSwap
              ? `Swap in ${c.name}, ${hp}. Uses your turn.`
              : canGive ? (holds ? `${c.name} has today's ${now} Energy. Press to put it back on ${you!.name}.` : `Give today's ${now} Energy to ${c.name}, ${hp}`)
              : undefined;
            return (
              <CardThumb
                key={c.index}
                card={c}
                pending={holds ? now : null}
                onPress={canSwap ? () => act({ swap: c.index }) : canGive ? () => putEnergy(c.index) : undefined}
                label={label}
                className={canSwap ? "duel-thumb--swap" : canGive ? (holds ? "duel-thumb--got" : "duel-thumb--give") : undefined}
              />
            );
          })}
        </div>

        <div className="duel-bar duel-bar--you">
          <div className="duel-bar__who">
            <b>You</b>
            <span ref={turnRef} tabIndex={-1} className="duel-bar__turn">{play.turn > 0 ? `Turn ${play.turn}` : "Today's six"}</span>
          </div>
          {!run.official && <span className="duel-practice">Practice</span>}
          {run.official && run.status === "playing" && <DuelClock startedAt={Date.parse(run.startedAt)} offset={offset} />}
          <Pips cards={play.you} who="You" />
        </div>
      </div>

      {picker && (
        <DuelPicker play={play} trainer={trainer} headingRef={pickRef} busy={busy} onPick={(i) => { touched.current = true; onNext(i); }} onZoom={(c) => onZoom(c, "Your")} />
      )}

      {play.over && (
        <div className="duel-overlay duel-overlay--over" role="status">
          <div>
            <p className="duel-overlay__kicker">{run.official ? "Today's duel" : "Practice"}</p>
            <h3 className="duel-overlay__title">{play.over === "won" ? `You beat ${trainer}!` : `${trainer} wins this one`}</h3>
          </div>
        </div>
      )}

      <Modal isOpen={logOpen} onClose={() => setLogOpen(false)} title="Turn log" size="small" className="duel-turnlog">
        <ol className="duel-turnlog__list">
          {logLines.map((l, i) => <li key={i}>{lineText(l)}</li>)}
          {play.event && <li className="duel-turnlog__event"><b>{play.event.title}.</b> {play.event.text}</li>}
          {eventLines(play.log).map((l, i) => <li key={`e${i}`}>{lineText(l)}</li>)}
        </ol>
      </Modal>
    </div>
  );
}

/** The card picker: your lead, or the next card after a knockout, with what each brings against the card across. */
function DuelPicker({ play, trainer, headingRef, busy, onPick, onZoom }: {
  play: DuelPlayView;
  trainer: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  busy: boolean;
  onPick: (i: number) => void;
  onZoom: (c: DuelCardView) => void;
}) {
  const lead = play.yi < 0;
  const foe = play.foe[play.fi];
  useEffect(() => { headingRef.current?.focus(); }, [headingRef]);
  // One line about the card across (the knockout itself is in the turn's announcement).
  const hp = foe ? (foe.cur === foe.hp ? `${foe.hp} HP` : `${foe.cur} HP left`) : "";
  return (
    <div className="duel-overlay duel-overlay--pick">
      <div className="duel-pick">
        <h3 className="duel-overlay__title" ref={headingRef} tabIndex={-1}>{lead ? "Pick your lead" : "Pick your next card"}</h3>
        {foe && (
          <p className="duel-overlay__text duel-pick__across">
            <span>{lead ? <>{trainer} leads with <b>{cardLabel(foe)}</b></> : <>Against <b>{cardLabel(foe)}</b></>}</span>
            <span aria-hidden="true">·</span><span className="sr-only">, </span>
            <span>{foe.weak ? `weak to ${foe.weak}` : "no Weakness"}</span>
            <span aria-hidden="true">·</span><span className="sr-only">, </span>
            <span>{hp}</span>
          </p>
        )}
        <ul className="duel-pick__list">
          {play.nexts.map((i) => {
            const c = play.you[i];
            const best = c.moves.reduce((n, m) => Math.max(n, m.damage ?? m.d), 0);
            const weakHit = c.moves.some((m) => m.weak);
            return (
              <li key={i} className="duel-pick__item">
                <button type="button" className="duel-pick__card" onClick={() => onPick(i)} disabled={busy} data-pick={i}
                  aria-label={`Send out ${c.name}: ${c.t}, ${c.cur} of ${c.hp} HP, ${c.weak ? `weak to ${c.weak}` : "no Weakness"}. Hits for up to ${best}${weakHit ? ", super effective" : ""}.${c.energy.length ? ` Energy on it: ${energyWords(c.energy)}.` : ""}`}>
                  <CardPicture card={c} />
                  <span className="duel-pick__name">{cardLabel(c)}</span>
                  <span className="duel-pick__facts" aria-hidden="true">
                    <TypeChip t={c.t} />
                    <span>{c.cur} HP</span>
                  </span>
                  <span className="duel-pick__facts" aria-hidden="true">
                    <span>Up to <b className={weakHit ? "duel-up" : undefined}>{best}</b></span>
                    {c.energy.length > 0 && <span className="duel-pick__energy">{c.energy.map((t, k) => <EnergyDot key={k} t={t} size="sm" />)}</span>}
                  </span>
                </button>
                <button type="button" className="duel-pick__zoom" onClick={() => onZoom(c)} aria-label={`See the ${c.name} card`}>
                  <IconZoomIn size={18} stroke={2} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
