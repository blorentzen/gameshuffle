"use client";

/**
 * Today's duel in the dailies' Start card, as today's challenger (challenger picks 2026-10-22,
 * https://claude.ai/artifact/RqcHdCgb2M4wxnLVs1NJ2E; arena pass 2026-10-23,
 * https://claude.ai/artifact/BXp1RfGmpEis5UanYC4bdb): the trainer's picture, "Larry challenged you to
 * a duel", who they are, a line about them and their own event; their team as cards (Leads on the
 * first, each card's Weakness; press one for its moves) and your six; the professor (rules 6: the
 * solo bonus and how many plans there are, with Ask the professor, which ends the bonus once you
 * confirm; older days show the plans); the mode, Normal or Hard (picks 2026-10-23,
 * https://claude.ai/artifact/BFhLK47XrGwhsJdGSvXSP6: Hard has no comeback Energy and no professor, its own
 * par and +200 on a win; the pick locks when the duel starts); Battle now (it starts the official duel and its clock); and
 * How to play, folded once you've played a duel. The one boxed thing on the page before you play,
 * in the Duel's own navy.
 */

import { useState } from "react";
import { IconBulb, IconSwords } from "@tabler/icons-react";
import { Accordion, Button, Card } from "@empac/cascadeds";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { useToast } from "@/components/toast/ToastProvider";
import type { DuelCardView, DuelHome } from "@/lib/originals/duel/view";
import type { DuelLevel } from "@/lib/originals/duel/types";
import { DailyStartCard } from "@/components/originals/DailyStart";
import { DailySteps } from "@/components/originals/DailyParade";
import { CardThumb, EnergyDot } from "./DuelBits";
import { TrainerArt } from "./TrainerArt";

const COUNT = ["No", "One", "Two", "Three", "Four", "Five", "Six"];

/** The trainer's team as cards in the order they come out: Leads on the first, each card's Weakness under it. Press one for its moves. */
export function DuelTeamCards({ team, owner, onZoom }: { team: DuelCardView[]; owner: string; onZoom: (card: DuelCardView) => void }) {
  return (
    <ul className="duel-teamcards" aria-label={`${owner} team, in the order they come out`}>
      {team.map((c, i) => (
        <li key={c.index} className="duel-teamcard">
          <CardThumb card={c} size="md" onPress={() => onZoom(c)} label={`See ${owner} ${c.name} card${i === 0 ? " (it leads)" : ""}: ${c.hp} HP, ${c.weak ? `weak to ${c.weak}` : "no Weakness"}`} />
          <span className="duel-teamcard__facts" aria-hidden="true">
            {i === 0 && <span className="duel-team__lead">Leads</span>}
            {c.weak ? <span className="duel-teamcard__weak">Weak <EnergyDot t={c.weak} size="xs" /></span> : <span className="duel-teamcard__weak">No Weakness</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The professor on the start card: on a scored day, the solo bonus and Ask the professor (it ends the bonus); the plans once asked, or on older days. */
function DuelProfessor({ home, onAsk }: { home: DuelHome; onAsk: () => Promise<boolean> }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const scored = home.rules >= 6;
  const shown = home.plans.length > 0;
  if (!shown && home.planCount === 0) return null;
  const ask = async () => {
    const body = home.hard.can ? "You'll lose today's solo bonus (150 points off your score), and Hard closes for today." : "You'll lose today's solo bonus: 150 points off your score.";
    const ok = await confirm({ title: "Ask the professor?", body, confirmLabel: "Ask", danger: false });
    if (!ok) return;
    setBusy(true);
    const got = await onAsk().catch(() => false);
    setBusy(false);
    if (!got) toast.error("Couldn't reach the professor. Try again in a moment.");
  };
  const count = shown ? home.plans.length : home.planCount;
  const ways = count === 1 ? "One way to win." : `${COUNT[count] ?? count} ways to win, each built around a different card.`;
  return (
    <div className="duel-plans">
      <p className="duel-start__label">The professor</p>
      {shown ? (
        <>
          <p className="duel-plans__sub">{ways}{scored ? " Your solo bonus is gone for today." : " Opening one doesn't change your score."}</p>
          <Accordion
            variant="flush"
            allowMultiple
            className="duel-plans__list"
            items={home.plans.map((p, i) => ({ id: `plan-${i}`, title: `Plan ${i + 1}: ${p.title}`, content: <p className="duel-plans__text">{p.text}</p> }))}
          />
        </>
      ) : (
        <div className="duel-prof">
          <p className="duel-plans__sub"><span className="duel-prof__bonus">Solo bonus +150</span> {ways} Asking for one, or for a tip during the duel, ends the bonus.</p>
          <Button variant="secondary" size="small" className="duel-prof__ask" iconBefore={IconBulb} onClick={() => void ask()} disabled={busy} loading={busy}>Ask the professor</Button>
        </div>
      )}
    </div>
  );
}

const STEPS_6 = [
  { icon: "energy", title: "Play an Energy", text: "Each turn opens with your hand of three: pick one and the card it goes on. It stays there." },
  { icon: "move", title: "Attack, or swap", text: "A move works once its dots are covered, and hitting a Weakness does double. Swapping a card in uses the turn." },
  { icon: "board", title: "Knock out every card", text: "Your score counts turns, time and going solo. Your first duel today is the one that counts." },
] as const;

/** Normal's comeback Energy in words: one each time (rules 7), or one then two on older days. */
const normalComeback = (comeback: number) => (comeback <= 1 ? "always 1" : "1, then 2");

/**
 * Easy, Normal or Hard, as three CascadeDS cards you press (like the support levels). Trainer Road
 * uses it too. `comeback` is Normal's comeback Energy that day (1 from rules 7, up to 2 before).
 */
export function DuelModePick({ easy, hard, comeback, level, onLevel, offText = "Not on today's duel", stars = false }: { easy: { can: boolean }; hard: { can: boolean; why?: "ok" | "off" | "asked" }; comeback: number; level: DuelLevelPick; onLevel: (l: DuelLevelPick) => void; offText?: string; /** Trainer Road: Easy wins earn two stars at most. */ stars?: boolean }) {
  const off = hard.why === "asked" ? "Closed today: you asked the professor" : offText;
  const normalLine = `Comeback Energy: ${normalComeback(comeback)}`;
  return (
    <div className="duel-modes">
      <p className="duel-start__label" id="duel-mode-label">Mode</p>
      <div className={`duel-modes__pick${easy.can ? " duel-modes__pick--3" : ""}`} role="group" aria-labelledby="duel-mode-label">
        {easy.can && (
          <Card variant="outlined" padding="small" interactive selected={level === "easy"} onClick={() => onLevel("easy")} className="duel-mode duel-mode--easy"
            aria-label={`Easy: comeback Energy 1, then 2, then 3, the professor can help, 200 less on a win${stars ? ", two stars at most" : ""}`}>
            <span className="duel-mode__name">Easy</span>
            <span className="duel-mode__line">Comeback Energy: 1, then 2, then 3</span>
            <span className="duel-mode__line">The professor can help</span>
            <span className="duel-mode__line duel-mode__less">200 less on a win</span>
            {stars && <span className="duel-mode__line duel-mode__less">Two stars at most</span>}
          </Card>
        )}
        <Card variant="outlined" padding="small" interactive selected={level === "normal"} onClick={() => onLevel("normal")} className="duel-mode"
          aria-label={`Normal: ${normalLine}, and the professor can help`}>
          <span className="duel-mode__name">Normal</span>
          <span className="duel-mode__line">{normalLine}</span>
          <span className="duel-mode__line">The professor can help</span>
        </Card>
        <Card variant="outlined" padding="small" interactive={hard.can} disabled={!hard.can} selected={level === "hard"} onClick={() => { if (hard.can) onLevel("hard"); }} className="duel-mode duel-mode--hard"
          aria-label={`Hard: no comeback Energy, no professor, 200 more on a win${!hard.can ? `. ${off}` : ""}`}>
          <span className="duel-mode__name">Hard</span>
          <span className="duel-mode__line">No comeback Energy</span>
          <span className="duel-mode__line">No professor</span>
          <span className="duel-mode__line duel-mode__bonus">+200 on a win</span>
          {!hard.can && <span className="duel-mode__off">{off}</span>}
        </Card>
      </div>
    </div>
  );
}

export type DuelLevelPick = DuelLevel;

/** The last mode picked, kept in this browser for the Daily Duel and Trainer Road alike. */
export const LEVEL_KEY = "gs-duel-level";
export function readLevel(): DuelLevel {
  try {
    const v = typeof window !== "undefined" ? window.localStorage.getItem(LEVEL_KEY) : null;
    return v === "hard" || v === "easy" ? v : "normal";
  } catch { return "normal"; }
}

/** The mode to show and play: a pick that isn't open on this duel falls back to Normal. */
export function openLevel(level: DuelLevel, open: { easy: { can: boolean }; hard: { can: boolean } }): DuelLevel {
  return (level === "easy" && !open.easy.can) || (level === "hard" && !open.hard.can) ? "normal" : level;
}

export function DuelStart({ home, busy, level, onLevel, onStart, onAsk, onZoom }: {
  home: DuelHome;
  busy: boolean;
  /** Easy, Normal or Hard for the official duel (Easy and Hard only when open, see `openLevel`). */
  level: DuelLevelPick;
  onLevel: (l: DuelLevelPick) => void;
  onStart: () => void;
  /** Asks the professor for the plans (true once they're in `home.plans`). */
  onAsk: () => Promise<boolean>;
  onZoom: (card: DuelCardView, owner: string) => void;
}) {
  const t = home.trainer!;
  const their = `${t.name}'s`;
  const steps = home.rules >= 6 ? [...STEPS_6] : home.rules >= 5 ? [
    { icon: "energy", title: "Play an Energy", text: "Each turn, put one of the three in your hand on any of your cards. It stays there." },
    { icon: "move", title: "Make your move", text: "A move works once its dots are covered. Hitting a Weakness does double." },
    { icon: "board", title: "Knock out every card", text: "Lose a card and the next one comes in with extra Energy. Fewer turns score higher, and your first duel today counts." },
  ] : [
    { icon: "energy", title: "Place an Energy", text: "Each turn, put the next Energy on any of your cards. It stays there." },
    { icon: "move", title: "Make your move", text: "A move works once its dots are covered. Hitting a Weakness does double." },
    { icon: "board", title: "Knock out every card", text: "Fewer turns score higher. Your first duel today counts." },
  ];
  const howTo = <DailySteps steps={steps as Parameters<typeof DailySteps>[0]["steps"]} />;
  return (
    <section aria-labelledby="duel-today-title">
      <DailyStartCard
        className="daily-start--duel"
        onStart={() => { if (!busy) onStart(); }}
        label="Battle now"
        icon={IconSwords}
        note={`${home.number >= 1 ? `Daily Duel #${home.number}` : "The warm-up duel"} · ${t.tierLabel} day. The clock starts${home.rules >= 6 ? " and your mode locks" : ""} when you tap Battle now.`}
        head={
          <div className="duel-start__head">
            <div className="duel-start__top">
              {t.picture && (
                <div className="duel-start__media">
                  <TrainerArt picture={t.picture} shape="banner" alt={t.picture.alt} eager className="duel-start__art" />
                </div>
              )}
              <div className="duel-start__intro">
                <h2 id="duel-today-title" className="duel-start__title">{t.name} challenged you to a duel</h2>
                <p className="duel-start__who">{t.title} · {t.game}</p>
                {t.bio && <p className="duel-start__bio">{t.bio}</p>}
                <p className="duel-start__sig"><b>{their} own event, {t.signature.title}{/[.!?]$/.test(t.signature.title) ? "" : ":"}</b> {t.signature.text}</p>
              </div>
            </div>
            <div className="duel-start__side">
              <p className="duel-start__label">{their} team</p>
              <DuelTeamCards team={home.team} owner={their} onZoom={(c) => onZoom(c, their)} />
            </div>
            <div className="duel-start__side">
              <p className="duel-start__label">Your six, the same for everyone{home.bring < home.pack.length ? `. Bring ${home.bring}.` : ""}</p>
              <div className="duel-start__cards" role="group" aria-label="Your six">
                {home.pack.map((c) => <CardThumb key={c.index} card={c} size="md" onPress={() => onZoom(c, "Your")} label={`See the ${c.name} card`} />)}
              </div>
            </div>
            {home.rules >= 6 && <DuelModePick easy={home.easy} hard={home.hard} comeback={home.comeback} level={openLevel(level, home)} onLevel={onLevel} />}
            {openLevel(level, home) !== "hard" && <DuelProfessor home={home} onAsk={onAsk} />}
          </div>
        }
      >
        {home.history.played > 0 ? (
          <Accordion variant="flush" className="duel-howto" items={[{ id: "how", title: "How to play", content: howTo }]} />
        ) : howTo}
      </DailyStartCard>
    </section>
  );
}
