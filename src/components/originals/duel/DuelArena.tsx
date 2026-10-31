"use client";

/**
 * The Daily Duel's arena: one visual world in any theme (a dark game screen). Arena pass (picks
 * 2026-10-23, https://claude.ai/artifact/BXp1RfGmpEis5UanYC4bdb, all as recommended), top to bottom:
 * the events bar (the turn, what's on now and next turn's event; it stays in view while you scroll),
 * the last turn (both sides' moves, the Energy each played, conditions; the full log one tap away),
 * the trainer's side (bar, waiting cards, card on the field with its moves) and yours in the same
 * order (bar, waiting cards, card, the Energy you played with Change, your attacks and End turn).
 * From 1024px the two sides stand side by side with their rows lined up.
 *
 * Each turn starts in the turn window (DuelTurn): pick an Energy from the hand and the card it goes
 * on, then keep your card or swap one in. The battle then only holds attacks and End turn; nothing
 * reaches the server until one of them, or a swap, is pressed. The event that lands shows at the top of
 * the turn window; an event's chip in the bar opens its notice, which stays until closed. The card
 * picker covers the arena when a card is needed (the lead, or after a knockout).
 *
 * Screen readers hear the whole turn in full sentences (the polite announcement); the screen
 * shows the short version. The board pieces (cards, hologram, Energy dots, pips, last turn) are our
 * own drawings; the attacks, End turn, Change, the turn window and the turn log are CascadeDS.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { Icon } from "@tabler/icons-react";
import { Button, IconButton, Modal } from "@empac/cascadeds";
import { IconArrowsExchange, IconBackpack, IconBolt, IconCheck, IconCrown, IconEye, IconFlame, IconList, IconMoodAngry, IconSpiral, IconStopwatch, IconZoomIn, IconZzz } from "@tabler/icons-react";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { useToast } from "@/components/toast/ToastProvider";
import type { DuelCardView, DuelHintView, DuelMoveView, DuelPlayView, DuelRunView } from "@/lib/originals/duel/view";
import type { DuelAct, DuelToolStep, EnergyType } from "@/lib/originals/duel/types";
import type { ArenaMotion } from "./duelBeats";
import { CardArt, CardConds, CardThumb, CondTag, CostDots, EnergyDot, MoveConds, Pips, TypeChip, condWords } from "./DuelBits";
import { DuelField } from "./DuelHolo";
import { DuelEventCard, DuelEventsBar, DuelNotice, EventTile, WeatherTile, eventNowText, turnsLeft, type NoticeWhich } from "./DuelEvent";
import { DuelTurn, type TurnStep } from "./DuelTurn";
import { DuelTools } from "./DuelTools";
import { TOOLS } from "@/lib/originals/duel/tools";
import { TrainerArt } from "./TrainerArt";
import { CONDITION_LOOK, WEATHER_CHIP, cardLabel, clockText, covers, energyWords, eventLines, eventOutcome, handPick, isEventLine, lineText, scoreRows, type ScoreRow } from "./duelLook";

/** A move's conditions in words, for its button's label (" 25% chance to make it Paralyzed."). */
const fxWords = (m: Pick<DuelMoveView, "fx">) => m.fx.map((f) => ` ${f.chance}% chance to make it ${CONDITION_LOOK[f.c].word}.`).join("");

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

/** A part of the last turn, without who did it (the line's first column says that). */
function ScorePart({ r }: { r: ScoreRow }) {
  switch (r.kind) {
    case "move":
      return (
        <>
          <b>{r.move}</b>
          <span className="duel-score__dmg">{r.damage}</span>
          {r.weak && r.damage > 0 && <span className="duel-badge duel-badge--x2" aria-hidden="true">×2</span>}
          {r.ko && <span className="duel-badge duel-badge--ko" aria-hidden="true">KO</span>}
          <span className="sr-only">{r.weak && r.damage > 0 ? ", super effective" : ""}{r.ko ? ", knocked out" : ""}</span>
        </>
      );
    case "skip":
      return (
        <>
          {r.why === "paralyzed" ? <CondTag c="paralyzed" size="xs" label="Paralyzed" /> : r.why === "asleep" ? <IconZzz size={16} stroke={2} aria-hidden="true" /> : <IconMoodAngry size={16} stroke={2} aria-hidden="true" />}
          <b>{r.why === "asleep" ? "Asleep" : r.why === "paralyzed" ? "Can't move" : "Stubborn"}</b>
          <span className="sr-only">, no move</span>
        </>
      );
    case "cond":
      return (
        <>
          <b>{r.card}</b>
          <CondTag c={r.cond} size="xs" label={`is now ${CONDITION_LOOK[r.cond].word}`} />
          <span aria-hidden="true">{CONDITION_LOOK[r.cond].word}</span>
        </>
      );
    case "tick":
    case "self":
      return (
        <>
          <b>{r.card}</b>
          {r.kind === "tick" ? <CondTag c={r.cond} size="xs" label={r.cond === "burned" ? "takes its burn" : "takes poison"} /> : <CondTag c="confused" size="xs" label="is confused and hits itself" />}
          <span className="duel-score__dmg">{r.damage}</span>
          {r.ko && <span className="duel-badge duel-badge--ko" aria-hidden="true">KO</span>}
          <span className="sr-only">{r.ko ? ", knocked out" : ""}</span>
        </>
      );
    case "wake":
      return <><b>{r.card}</b><span>wakes up</span></>;
    case "swap":
      return <><span>Swap in</span><b>{r.card}</b></>;
    case "tool":
      return <><IconBackpack size={16} stroke={2} aria-hidden="true" /><b>{r.tool}</b>{r.card && <><span>on</span><b>{r.card}</b></>}</>;
    case "sand":
      return <>{r.hits.map((h, k) => <span key={k} className="duel-score__hit"><b>{h.card}</b><span className="duel-score__dmg">{h.damage}</span></span>)}</>;
    case "energy":
      return r.back > 0 ? (
        <>
          <b>{r.card}</b>
          <IconBolt size={16} stroke={2} aria-hidden="true" />
          <span>came back with {r.back === 1 ? "an Energy" : `${r.back} Energy`}</span>
        </>
      ) : (
        <>
          <span className="sr-only">played</span>
          {r.type && <EnergyDot t={r.type} size="sm" />}
          <span>{r.type ?? "An"} Energy on</span>
          <b>{r.card}</b>
        </>
      );
  }
}

const ACTS = new Set(["move", "skip", "swap"]);

/**
 * The last turn: a line per side's turn (the Energy it played, then its move, a skipped move or a
 * swap), and a line for each condition, burn, wake-up, comeback and the sandstorm. Parts of a line
 * still to come in the exchange's beats stay hidden until their beat.
 */
function Scoreline({ rows, reveal, trainer, onLog }: { rows: ScoreRow[]; reveal: number; trainer: string; onLog: () => void }) {
  const lines: { key: string; at: number; who: string; parts: ScoreRow[] }[] = [];
  for (const r of rows) {
    const who = r.kind === "sand" ? "Sandstorm" : r.side === "you" ? "You" : trainer;
    const last = lines[lines.length - 1];
    const prev = last?.parts[last.parts.length - 1];
    // An Energy played and the move (or swap, or skipped move) after it read as one line, after any tools used first.
    const onlyTools = !!last && last.parts.every((p) => p.kind === "tool" || p === prev);
    if (last && prev && prev.kind === "energy" && prev.back === 0 && onlyTools && ACTS.has(r.kind) && "side" in r && r.side === prev.side) {
      last.parts.push(r);
      continue;
    }
    if (last && prev && prev.kind === "tool" && "side" in r && r.side === "you" && (r.kind === "tool" || (r.kind === "energy" && r.back === 0) || ACTS.has(r.kind))) {
      last.parts.push(r);
      continue;
    }
    lines.push({ key: r.key, at: r.at, who, parts: [r] });
  }
  return (
    <div className="duel-score">
      <ul className="duel-score__rows" aria-label="Last turn">
        {lines.map((l) => (
          <li key={l.key} className={`duel-score__row${l.at >= reveal ? " duel-score__row--later" : ""}`}>
            <span className="duel-score__who">{l.who}</span>
            <span className="duel-score__what">
              {l.parts.map((p, k) => (
                <span key={p.key} className={`duel-score__part${p.kind === "energy" && p.back === 0 ? " duel-score__part--energy" : ""}${p.at >= reveal ? " duel-score__part--later" : ""}`}>
                  {k > 0 && <span className="sr-only">, then </span>}
                  <ScorePart r={p} />
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <IconButton variant="secondary" size="small" className="duel-score__log" onClick={onLog} aria-label="Turn log">
        <IconList size={18} stroke={2} aria-hidden="true" />
      </IconButton>
    </div>
  );
}

export function DuelArena({ run, play, motion, busy, staging, offset, onNext, onBring, onTurn, onTip, onTool, onZoom, onSkip, askBody = "You'll lose today's solo bonus: 150 points off your score." }: {
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
  /** Rules 4: the cards you bring. */
  onBring: (cards: number[]) => void;
  /** `use`: which Energy in the hand (rules 5). */
  onTurn: (attach: number, act: DuelAct, use?: number) => void;
  /** Asks the professor for this turn's play (null between turns; throws when it can't reach us). */
  onTip: () => Promise<DuelHintView | null>;
  /** Uses a tool from the bag (the turn goes on). Absent: tools aren't offered here. */
  onTool?: (st: DuelToolStep) => void;
  onZoom: (card: DuelCardView, owner: string) => void;
  onSkip: () => void;
  /** What asking the professor costs, in the check (Trainer Road: this duel's bonus). */
  askBody?: string;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const trainer = run.trainer.name;
  const their = `${trainer}'s`;
  const you = play.yi >= 0 ? play.you[play.yi] : null;
  const foe = play.foe[play.fi] ?? null;
  const turnLive = play.attachTo.length > 0 && !play.over && !play.needsNext && !play.needsBring;
  const hand = play.energy.hand;
  const hasEnergy = turnLive && !!play.energy.now;

  // A tool changes the table mid-turn, so picks and a tip asked before it start again (`stage`: the turn and its tools so far).
  const stage = play.turn * 10 + (play.tools?.used.length ?? 0);
  // A tip asked for this turn (Professor's advice turns carry one in play.hint, free).
  const [asked, setAsked] = useState<{ turn: number; hint: DuelHintView | null }>({ turn: -1, hint: null });
  const [tipBusy, setTipBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const hint = turnLive ? (play.hint ?? (asked.turn === stage ? asked.hint : null)) : null;

  // This turn's Energy, kept with the turn it belongs to (a new turn starts clean): the card it goes
  // on (null = the professor's card, else your card on the field) and which one from the hand (null =
  // the professor's, else the one that card needs most).
  const [choice, setChoice] = useState<{ turn: number; attach: number | null; use: number | null }>({ turn: -1, attach: null, use: null });
  const mine = choice.turn === stage && turnLive;
  const picked = mine && choice.attach !== null && play.attachTo.includes(choice.attach) ? choice.attach : null;
  const hinted = hint && play.attachTo.includes(hint.attach) ? hint.attach : null;
  const attach: number | null = hasEnergy ? (picked ?? hinted ?? (play.attachTo.includes(play.yi) ? play.yi : play.attachTo[0] ?? null)) : null;
  const use = hand && attach !== null
    ? (mine && choice.use != null && choice.use < hand.length ? choice.use
      : hint && hint.attach === attach && hint.use != null && hint.use < hand.length ? hint.use
      : handPick(play.you[attach], hand))
    : 0;
  const now = hand ? (attach !== null ? hand[use] ?? null : null) : play.energy.now;

  // The turn window opens at the start of every turn (after the exchange has played) and stays shut
  // once you're through it, until Change opens it again.
  const [win, setWin] = useState<{ turn: number; open: boolean; step: TurnStep }>({ turn: -1, open: false, step: 1 });
  const winOpen = turnLive && !staging && attach !== null && (win.turn === play.turn ? win.open : true);
  const winStep: TurnStep = win.turn === play.turn ? win.step : 1;
  const [logOpen, setLogOpen] = useState(false);

  const movesRef = useRef<HTMLDivElement>(null);
  const turnRef = useRef<HTMLSpanElement>(null);
  const pickRef = useRef<HTMLHeadingElement>(null);
  const touched = useRef(false);
  // Keyboard or pointer last: a keyboard player's focus scrolls into view, a tap doesn't move the page.
  const byKey = useRef(false);

  /** After the window closes: focus on the first attack you can use, else End turn (the window gave focus back to where it was). */
  const focusMoves = () => window.setTimeout(() => {
    const btn = movesRef.current?.querySelector<HTMLButtonElement>("[data-move]:not(:disabled), [data-wait]:not(:disabled)");
    btn?.focus({ preventScroll: !byKey.current });
  }, 30);
  const closeWin = () => { touched.current = true; setWin({ turn: play.turn, open: false, step: winStep }); focusMoves(); };
  const openWin = (step: TurnStep) => setWin({ turn: play.turn, open: true, step });
  const pickUse = (i: number) => { touched.current = true; setChoice({ turn: stage, attach, use: i }); };
  // Moving the Energy to another card keeps the Energy you picked.
  const pickCard = (i: number) => { touched.current = true; setChoice({ turn: stage, attach: i, use: hand ? use : null }); };
  const act = (a: DuelAct) => {
    if (attach === null || busy) return;
    touched.current = true;
    // The pressed button is disabled while the turn is sent: a keyboard player waits on the turn
    // label (not the page), and lands on this turn's first move once it's back.
    if (byKey.current) turnRef.current?.focus({ preventScroll: true });
    onTurn(attach, a, hand ? use : undefined);
  };
  const swapIn = (i: number) => { setWin({ turn: play.turn, open: false, step: 2 }); act({ swap: i }); };

  // On a scored day's official duel the first ask ends the solo bonus, so it asks first.
  const costs = run.official && play.rules >= 6 && !run.asked;
  const askProfessor = async () => {
    if (tipBusy) return;
    if (costs) {
      setConfirming(true);
      const ok = await confirm({ title: "Ask the professor?", body: askBody, confirmLabel: "Ask", danger: false });
      setConfirming(false);
      if (!ok) return;
    }
    setTipBusy(true);
    const got = await onTip().then((h) => ({ h }), () => null);
    setTipBusy(false);
    if (!got) { toast.error("Couldn't reach the professor. Try again in a moment."); return; }
    setAsked({ turn: stage, hint: got.h });
    if (got.h) setChoice({ turn: stage, attach: got.h.attach, use: got.h.use ?? null });
  };

  // A tool ends the solo bonus too (a scored duel), so it asks first, in the same words.
  const playTool = async (st: DuelToolStep) => {
    if (!onTool || busy) return;
    if (costs) {
      setConfirming(true);
      const ok = await confirm({ title: `Use ${TOOLS[st.tool].name}?`, body: askBody, confirmLabel: "Use it", danger: false });
      setConfirming(false);
      if (!ok) return;
    }
    touched.current = true;
    onTool(st);
  };

  // Escape skips the beats wherever focus is.
  useEffect(() => {
    if (!staging) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onSkip(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [staging, onSkip]);

  // A new picture of the field, once the turn is back and its beats are done: focus goes to the card
  // picker when one is up (the turn window takes focus itself); with nothing to press, to the turn.
  useEffect(() => {
    if (!touched.current || play.over || staging || busy || winOpen) return;
    const opts = { preventScroll: !byKey.current };
    if (play.needsNext || play.needsBring) { pickRef.current?.focus(opts); return; }
    const a = document.activeElement as HTMLElement | null;
    const kept = a && a !== document.body && a !== turnRef.current && a.isConnected && !(a as HTMLButtonElement).disabled && a.closest(".duel-arena__body");
    if (kept) return;
    const btn = movesRef.current?.querySelector<HTMLButtonElement>("[data-move]:not(:disabled), [data-wait]:not(:disabled)");
    if (btn) { btn.focus(opts); return; }
    turnRef.current?.focus(opts);
  }, [play, busy, staging, winOpen]);

  const allRows = useMemo(() => scoreRows(play.log, play.you, play.foe), [play.log, play.you, play.foe]);
  const reveal = staging && motion.reveal != null ? motion.reveal : Infinity;
  const outcome = play.event ? eventOutcome(play.event, play.log, play.you, play.foe) : null;
  const tipped = (a: DuelAct) => !!hint && hint.attach === attach && JSON.stringify(hint.act) === JSON.stringify(a);

  // An event's notice, opened from its chip in the events bar; it stays until closed. Closed again
  // whenever the turn moves on (the chip it came from may be gone).
  const [notice, setNotice] = useState<{ turn: number; which: NoticeWhich } | null>(null);
  const showNotice = (which: NoticeWhich) => setNotice({ turn: play.turn, which });
  const shown = notice && notice.turn === play.turn && !staging ? notice.which : null;
  const weather = play.inPlay.weather;
  const forecast = staging ? null : play.forecast;
  let noticeView: { tile: React.ReactNode; kicker: string; title: string; text: string; next: boolean } | null = null;
  if (shown === "now" && play.event) noticeView = { tile: <EventTile event={play.event} picture={run.trainer.picture} size="lg" />, kicker: "This turn", title: play.event.title, text: eventNowText(play.event, outcome, hint), next: false };
  else if (shown === "weather" && weather) noticeView = { tile: <WeatherTile kind={weather.kind} size="lg" />, kicker: "On now", title: WEATHER_CHIP[weather.kind].word, text: `${WEATHER_CHIP[weather.kind].line}, ${turnsLeft(weather.turnsLeft)}`, next: false };
  else if (shown === "next" && forecast) noticeView = { tile: <EventTile event={forecast} picture={run.trainer.picture} size="lg" next />, kicker: "Next turn", title: forecast.title, text: forecast.short, next: true };

  const barProps = { turn: play.turn, event: play.over ? null : play.event, forecast: play.over ? null : play.forecast, later: play.over ? null : play.later ?? null, weather: play.over ? null : weather, outcome, hint, picture: run.trainer.picture, staging };

  // The whole turn in full sentences for screen readers (once the beats are done): what happened,
  // the event that flipped and what it did, then what to do now.
  const announce = useMemo(() => {
    if (staging) return "";
    const parts = play.log.filter((l) => !isEventLine(l)).map(lineText);
    if (play.event) parts.push(`${play.event.title}. ${play.event.text}`, ...eventLines(play.log).map(lineText));
    if (play.event?.kind === "advice" && play.hint) parts.push(`The professor suggests: ${play.hint.text}`);
    if (play.over) parts.push(play.over === "won" ? `You beat ${trainer}.` : `${trainer} wins.`);
    else if (play.needsBring) parts.push(`Pick ${play.bring} of your six to bring.`);
    else if (play.needsNext) parts.push(play.yi < 0 ? "Pick your lead." : "Pick your next card.");
    else if (turnLive) parts.push(`Turn ${play.turn}.`);
    return parts.join(" ");
  }, [staging, play.log, play.event, play.hint, play.over, play.needsNext, play.needsBring, play.bring, play.yi, play.turn, turnLive, trainer]);

  const inPlay = play.inPlay;
  const picker = (play.needsNext || play.needsBring) && !play.over;
  // End turn fills the row's last cell, or takes a row of its own under an even number of attacks.
  const endWide = you ? you.moves.length % 2 === 0 : false;
  const logLines = play.log.filter((l) => !isEventLine(l));
  const energyFor = (c: DuelCardView): EnergyType[] => (attach === c.index && now ? [...c.energy, now] : c.energy);
  const target = attach !== null ? play.you[attach] : null;
  const asleepish = turnLive && you && !play.canMove;
  const powerUp = turnLive ? play.tools?.power ?? 0 : 0;
  const lookLeft = turnLive ? play.tools?.look ?? 0 : 0;

  return (
    <div
      className={`duel-arena${run.official ? "" : " duel-arena--practice"}`}
      data-turn={play.turn} data-yi={play.yi} data-fi={play.fi} data-over={play.over ?? undefined} data-staging={staging || undefined} data-window={winOpen ? winStep : undefined}
      onKeyDown={(e) => {
        byKey.current = true;
        if (staging && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSkip(); }
      }}
      onPointerDown={() => { byKey.current = false; if (staging) onSkip(); }}
    >
      <h2 className="sr-only">{run.official ? "Today's duel" : "Practice duel"} against {trainer}</h2>
      <p className="sr-only" aria-live="polite">{announce}</p>
      <div className="duel-arena__body" inert={picker || play.over !== null ? true : undefined}>
        <DuelEventsBar {...barProps} onShow={showNotice} turnRef={turnRef} />

        {allRows.length > 0 && <Scoreline key={motion.beatKey} rows={allRows} reveal={reveal} trainer={trainer} onLog={() => setLogOpen(true)} />}

        <section className="duel-side duel-side--foe" aria-label={`${trainer}'s side`}>
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
          <div className="duel-side__field">
            {foe && !foe.out && (
              <DuelField card={foe} side="foe" owner={their} motion={motion.foe} nonce={motion.nonce} fx={motion.fx?.foe} onZoom={() => onZoom(foe, their)}>
                <ul className="duel-foe-moves" aria-label={`${their} ${cardLabel(foe)}: moves`}>
                  {foe.moves.map((m) => (
                    <li key={m.n}>
                      <span className="duel-foe-moves__name">{m.n}</span>
                      <CostDots cost={m.cost} energy={foe.energy} />
                      <span className="sr-only">, needs {energyWords(m.cost)}{m.ready ? ", ready" : ""}</span>
                      <MoveConds fx={m.fx} size="xs" />
                      <strong className={m.weak ? "duel-up" : undefined}>{m.damage ?? m.d}<span className="sr-only"> damage to your card{m.weak ? ", super effective" : ""}{m.plus ? ` (${m.plus})` : ""}.{fxWords(m)}</span></strong>
                    </li>
                  ))}
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
          </div>
          <div className="duel-side__foot" aria-hidden="true" />
        </section>

        <section className="duel-side duel-side--you" aria-label="Your side">
          <div className="duel-bar duel-bar--you">
            <div className="duel-bar__who">
              <b>You{run.level === "hard" && <span className="duel-hard-tag">Hard</span>}{run.level === "easy" && <span className="duel-hard-tag duel-easy-tag">Easy</span>}</b>
              {!run.official && <span>Practice</span>}
            </div>
            {run.official && run.status === "playing" && <DuelClock startedAt={Date.parse(run.startedAt)} offset={offset} />}
            <Pips cards={play.you.filter((c) => !c.sat)} who="You" />
          </div>
          <div className="duel-bench duel-bench--you" role="group" aria-label="Your waiting cards">
            {play.you.map((c) => {
              if (c.sat || (c.index === play.yi && !c.out && !play.needsNext)) return null;
              return (
                <CardThumb
                  key={c.index}
                  card={c}
                  pending={attach === c.index ? now : null}
                  onPress={() => onZoom(c, "Your")}
                  label={`See your ${c.name} card${c.out ? ", knocked out" : `, ${c.cur} of ${c.hp} HP`}${attach === c.index && now ? `. This turn's ${now} Energy goes on it.` : ""}`}
                />
              );
            })}
          </div>
          <div className="duel-side__field">
            {you && !you.out && !play.needsNext && (
              <DuelField card={you} side="you" owner="your" motion={motion.you} nonce={motion.nonce} fx={motion.fx?.you} pending={attach === you.index ? now : null} onZoom={() => onZoom(you, "Your")}>
                {(inPlay.crit || inPlay.confused || inPlay.youStubborn || inPlay.fresh > 0 || !!powerUp || lookLeft > 0) && (
                  <p className="duel-chips">
                    {inPlay.fresh > 0 && <Chip icon={IconBolt} tone="good" text={`+${inPlay.fresh} Energy for coming back`} full={`It came in with ${inPlay.fresh === 1 ? "an Energy" : `${inPlay.fresh} Energy`} for coming back after a knockout.`} />}
                    {!!powerUp && <Chip icon={IconFlame} tone="good" text={`Power Up +${powerUp}`} full={`Power Up: your attack this turn does ${powerUp} more.`} />}
                    {lookLeft > 0 && <Chip icon={IconEye} text={`Look Ahead: ${lookLeft} ${lookLeft === 1 ? "turn" : "turns"}`} full={`Look Ahead: you see six Energy and two events ahead for ${lookLeft === 1 ? "this turn" : `${lookLeft} turns`}.`} />}
                    {inPlay.crit && <Chip icon={IconBolt} tone="good" text="Critical ×1.5" full="Critical hit: your next move does half again as much." />}
                    {inPlay.confused && <Chip icon={IconSpiral} tone="bad" text="Confused: half" full="Confused: your next move does half damage." />}
                    {inPlay.youStubborn && <Chip icon={IconMoodAngry} tone="bad" text="Stubborn" full="Stubborn: no attack this turn." />}
                  </p>
                )}
              </DuelField>
            )}
          </div>
          {you && !you.out && !play.needsNext && (
            <div className="duel-side__foot">
              {turnLive && now && target && (
                <p className="duel-played">
                  <EnergyDot t={now} size="sm" fresh />
                  <span className="duel-played__text">{now} Energy on <b>{cardLabel(target)}</b></span>
                  <Button variant="ghost" size="small" className="duel-played__change" onClick={() => openWin(1)} disabled={busy} aria-label={`Change: ${now} Energy goes on ${target.name}`}>Change</Button>
                </p>
              )}
              <div className="duel-moves" ref={movesRef} role="group" aria-label="Your attacks">
                {you.moves.map((m, i) => {
                  const ok = attach !== null && play.canMove && (attach === you.index && now ? covers([...you.energy, now], m.cost) : m.ready);
                  const dmg = m.damage ?? m.d;
                  const tone = dmg > m.d ? " duel-up" : dmg < m.d ? " duel-down" : "";
                  const why = !turnLive ? "" : you.cond === "asleep" ? " Your card is Asleep." : !play.canMove ? " Your card can't attack this turn." : ok ? " Ready." : " Needs more Energy.";
                  const tip = tipped({ move: i });
                  return (
                    <Button
                      key={`${you.index}-${m.n}`}
                      variant="secondary"
                      className={`duel-move${ok ? " duel-move--ready" : ""}${tip ? " duel-move--tip" : ""}`}
                      disabled={!ok || busy}
                      onClick={() => act({ move: i })}
                      data-move={i}
                      aria-label={`${m.n}: ${dmg} damage${m.weak && dmg > 0 ? ", super effective" : ""}${m.plus ? ` (${m.plus})` : ""}. Costs ${energyWords(m.cost)}.${fxWords(m)}${why}${tip ? " The professor's pick." : ""}`}
                    >
                      <span className="duel-move__top">
                        <span className="duel-move__name">{m.n}{tip && <span className="duel-tip" aria-hidden="true">Tip</span>}</span>
                        <span className="duel-move__hit">
                          {m.weak && dmg > 0 && <span className="duel-badge duel-badge--x2">×2</span>}
                          <span className={`duel-move__dmg${tone}`}>{dmg}</span>
                        </span>
                      </span>
                      <span className="duel-move__foot">
                        <CostDots cost={m.cost} energy={energyFor(you)} />
                        <MoveConds fx={m.fx} size="xs" />
                      </span>
                    </Button>
                  );
                })}
                <Button variant="secondary" className={`duel-move duel-move--end${endWide ? " duel-move--wide" : ""}${tipped({ wait: true }) ? " duel-move--tip" : ""}`} disabled={attach === null || busy} onClick={() => act({ wait: true })} data-wait aria-label={`End turn: no attack this turn${tipped({ wait: true }) ? ". The professor's pick." : ""}`}>
                  <span className="duel-move__top"><span className="duel-move__name">End turn{tipped({ wait: true }) && <span className="duel-tip" aria-hidden="true">Tip</span>}</span></span>
                </Button>
                {asleepish && (
                  <p className="duel-movenote">
                    {you.cond === "asleep" && <CondTag c="asleep" size="xs" label="Asleep" />}
                    <span>{you.cond === "asleep" ? "Asleep: it can't attack." : "It can't attack this turn."}</span>
                    {play.swaps.length > 0 && <Button variant="ghost" size="small" onClick={() => openWin(2)} disabled={busy} iconBefore={IconArrowsExchange}>Swap it out</Button>}
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {noticeView && <DuelNotice tile={noticeView.tile} kicker={noticeView.kicker} title={noticeView.title} text={noticeView.text} next={noticeView.next} onDone={() => setNotice(null)} />}

      {turnLive && attach !== null && (
        <DuelTurn
          open={winOpen}
          step={winStep}
          play={play}
          attach={attach}
          use={use}
          now={now}
          hint={hint}
          bar={<DuelEventsBar {...barProps} inWindow />}
          tools={onTool && run.bag && play.tools ? <DuelTools key={stage} play={play} bag={run.bag} busy={busy || confirming} onTool={(st) => void playTool(st)} /> : null}
          event={play.event && !play.over ? <DuelEventCard event={play.event} text={play.event.kind === "advice" ? (run.level === "hard" ? "You're on your own in Hard: no tip." : play.event.short) : eventNowText(play.event, outcome, hint)} picture={run.trainer.picture} /> : null}
          busy={busy}
          ask={{ show: !hint && run.level !== "hard", costs, busy: tipBusy, onAsk: () => void askProfessor(), escape: !confirming }}
          onUse={pickUse}
          onAttach={pickCard}
          onNext={() => { touched.current = true; if (play.swaps.length) setWin({ turn: play.turn, open: true, step: 2 }); else closeWin(); }}
          onKeep={closeWin}
          onSwap={swapIn}
          onStep={openWin}
          onClose={closeWin}
          onZoom={(c) => onZoom(c, "Your")}
        />
      )}

      {picker && play.needsBring && (
        <DuelBringPicker play={play} trainer={trainer} headingRef={pickRef} busy={busy} onBring={(cards) => { touched.current = true; onBring(cards); }} onZoom={(c) => onZoom(c, "Your")} onZoomFoe={(c) => onZoom(c, their)} />
      )}
      {picker && !play.needsBring && (
        <DuelPicker play={play} trainer={trainer} hard={run.level === "hard"} headingRef={pickRef} busy={busy} onPick={(i) => { touched.current = true; onNext(i); }} onZoom={(c) => onZoom(c, "Your")} />
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

/**
 * Rules 4: pick the cards you bring (as many as the trainer, at least 3) before the lead. Each card
 * is a toggle (aria-pressed); Bring these N sends them once exactly N are picked. The picker's own
 * drawing like DuelPicker (CascadeDS has no picture toggle grid: on the CDS fix list).
 */
function DuelBringPicker({ play, trainer, headingRef, busy, onBring, onZoom, onZoomFoe }: {
  play: DuelPlayView;
  trainer: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  busy: boolean;
  onBring: (cards: number[]) => void;
  onZoom: (c: DuelCardView) => void;
  onZoomFoe: (c: DuelCardView) => void;
}) {
  const [picked, setPicked] = useState<number[]>([]);
  const n = play.bring;
  useEffect(() => { headingRef.current?.focus(); }, [headingRef]);
  const names = play.foe.map((c) => cardLabel(c));
  const team = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  const toggle = (i: number) => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : p.length < n ? [...p, i] : p));
  const full = picked.length === n;
  return (
    <div className="duel-overlay duel-overlay--pick">
      <div className="duel-pick">
        <h3 className="duel-overlay__title" ref={headingRef} tabIndex={-1}>Pick {n} to bring</h3>
        <p className="duel-overlay__text duel-pick__across">
          <span>{trainer} brings <b>{play.foe.length}</b>: {team}</span>
        </p>
        <ul className="duel-pick__foes" aria-label={`${trainer}'s team, in the order they come out`}>
          {play.foe.map((c, i) => (
            <li key={c.index} className="duel-pick__foe">
              <CardThumb card={c} size="sm" onPress={() => onZoomFoe(c)} label={`See ${trainer}'s ${c.name} card${i === 0 ? ", it leads" : ""}`} />
              <span className="duel-pick__foefacts" aria-hidden="true">
                {i === 0 ? <span className="duel-team__lead">Leads</span> : null}
                <span>{c.weak ? <>Weak <EnergyDot t={c.weak} size="xs" /></> : "No Weakness"}</span>
              </span>
            </li>
          ))}
        </ul>
        <ul className="duel-pick__list">
          {play.you.map((c) => {
            const on = picked.includes(c.index);
            const best = c.moves.reduce((m, mv) => Math.max(m, mv.d), 0);
            return (
              <li key={c.index} className="duel-pick__item">
                <button type="button" className={`duel-pick__card${on ? " duel-pick__card--on" : ""}`} onClick={() => toggle(c.index)} disabled={busy || (!on && full)} aria-pressed={on} data-bring={c.index}
                  aria-label={`${c.name}: ${c.t}, ${c.hp} HP, ${c.weak ? `weak to ${c.weak}` : "no Weakness"}, hits for up to ${best}.`}>
                  <span className="duel-pick__art"><CardArt card={c} /></span>
                  {on && <span className="duel-pick__tick" aria-hidden="true"><IconCheck size={18} stroke={3} /></span>}
                  <span className="duel-pick__name">{cardLabel(c)}</span>
                  <span className="duel-pick__facts" aria-hidden="true">
                    <TypeChip t={c.t} />
                    <span>{c.hp} HP</span>
                  </span>
                  <span className="duel-pick__facts" aria-hidden="true"><span>Up to <b>{best}</b></span><MoveConds fx={c.moves.flatMap((m) => m.fx).filter((f, k, all) => all.findIndex((x) => x.c === f.c) === k)} size="xs" /></span>
                </button>
                <button type="button" className="duel-pick__zoom" onClick={() => onZoom(c)} aria-label={`See the ${c.name} card`}>
                  <IconZoomIn size={18} stroke={2} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
        <p className="sr-only" aria-live="polite">{picked.length} of {n} picked.</p>
        <Button variant="primary" size="large" className="duel-bring__go" disabled={!full || busy} onClick={() => onBring([...picked].sort((a, b) => a - b))}>
          {full ? `Bring these ${n}` : `Pick ${n - picked.length} more`}
        </Button>
        <p className="duel-overlay__text">Then pick who leads. The other {play.you.length - n} sit this one out.</p>
      </div>
    </div>
  );
}

/** The card picker: your lead, or the next card after a knockout, with what each brings against the card across. */
function DuelPicker({ play, trainer, hard = false, headingRef, busy, onPick, onZoom }: {
  play: DuelPlayView;
  trainer: string;
  /** Hard: the card comes in without comeback Energy. */
  hard?: boolean;
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
        {hard && !lead && <p className="duel-overlay__text">Hard: it comes in without Energy.</p>}
        <ul className="duel-pick__list">
          {play.nexts.map((i) => {
            const c = play.you[i];
            const best = c.moves.reduce((n, m) => Math.max(n, m.damage ?? m.d), 0);
            const weakHit = c.moves.some((m) => m.weak);
            return (
              <li key={i} className="duel-pick__item">
                <button type="button" className="duel-pick__card" onClick={() => onPick(i)} disabled={busy} data-pick={i}
                  aria-label={`Send out ${c.name}: ${c.t}, ${c.cur} of ${c.hp} HP${condWords(c)}, ${c.weak ? `weak to ${c.weak}` : "no Weakness"}. Hits for up to ${best}${weakHit ? ", super effective" : ""}.${c.energy.length ? ` Energy on it: ${energyWords(c.energy)}.` : ""}`}>
                  <span className="duel-pick__art"><CardArt card={c} />{(c.cond || c.confused) && <span className="duel-thumb__conds"><CardConds card={c} size="xs" /></span>}</span>
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
