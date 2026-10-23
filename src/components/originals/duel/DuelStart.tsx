"use client";

/**
 * Today's duel in the dailies' Start card, as today's challenger (challenger picks 2026-10-22,
 * https://claude.ai/artifact/RqcHdCgb2M4wxnLVs1NJ2E): the trainer's picture, "Larry challenged you to
 * a duel", who they are and a line about them, their team as rows (each card's type, HP, Weakness
 * and moves, the one that leads marked; picks 2026-10-22, https://claude.ai/artifact/MFwJQi5RBdq92B1JKS2EWZ)
 * and your six as cards (press one to see it whole), the professor's plans (rules 5: each closed until
 * you open it), the trainer's own event, then Battle now (it starts the official duel and its clock)
 * and three short lines on how to duel. The one boxed thing on the page before you play, in the
 * Duel's own navy.
 */

import { IconSwords } from "@tabler/icons-react";
import { Accordion } from "@empac/cascadeds";
import type { DuelCardView, DuelHome } from "@/lib/originals/duel/view";
import { DailyStartCard } from "@/components/originals/DailyStart";
import { DailySteps } from "@/components/originals/DailyParade";
import { CardThumb, CostDots, MoveConds } from "./DuelBits";
import { CONDITION_LOOK, energyWords } from "./duelLook";
import { TrainerArt } from "./TrainerArt";

const COUNT = ["No", "One", "Two", "Three", "Four", "Five", "Six"];

/** The trainer's team as rows: the card (press it to see it whole), its type, HP and Weakness, and its moves; the first one out says Leads. */
export function DuelTeamRows({ team, owner, onZoom }: { team: DuelCardView[]; owner: string; onZoom: (card: DuelCardView) => void }) {
  return (
    <ul className="duel-team" aria-label={`${owner} team, in the order they come out`}>
      {team.map((c, i) => (
        <li key={c.index} className="duel-team__row">
          <CardThumb card={c} size="sm" onPress={() => onZoom(c)} label={`See ${owner} ${c.name} card`} />
          <div className="duel-team__info">
            <p className="duel-team__head"><b>{c.name}</b>{i === 0 && <span className="duel-team__lead">Leads</span>}</p>
            <p className="duel-team__meta">{c.t} · {c.hp} HP · {c.weak ? `weak to ${c.weak}` : "no Weakness"}{c.energy.length > 0 ? ` · starts with ${c.energy.length} Energy` : ""}</p>
            <ul className="duel-team__moves">
              {c.moves.map((m) => (
                <li key={m.n}>
                  <span className="duel-team__move">{m.n}</span>
                  <CostDots cost={m.cost} energy={c.energy} size="xs" />
                  <MoveConds fx={m.fx} size="xs" />
                  <strong>{m.d}{m.plus ? (m.plus.startsWith("+") ? "+" : "×") : ""}</strong>
                  <span className="sr-only"> damage{m.plus ? `, ${m.plus}` : ""}. Costs {energyWords(m.cost)}.{m.fx.map((f) => ` ${f.chance}% chance to make it ${CONDITION_LOOK[f.c].word}.`).join("")}</span>
                  {m.plus && <span className="duel-team__plus" aria-hidden="true">{m.plus.startsWith("+") ? m.plus : `${m.plus.split(" ")[0]} damage ${m.plus.split(" ").slice(1).join(" ")}`}</span>}
                </li>
              ))}
            </ul>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DuelStart({ home, busy, onStart, onZoom }: {
  home: DuelHome;
  busy: boolean;
  onStart: () => void;
  onZoom: (card: DuelCardView, owner: string) => void;
}) {
  const t = home.trainer!;
  const their = `${t.name}'s`;
  return (
    <section aria-labelledby="duel-today-title">
      <DailyStartCard
        className="daily-start--duel"
        onStart={() => { if (!busy) onStart(); }}
        label="Battle now"
        icon={IconSwords}
        note={`${home.number >= 1 ? `Daily Duel #${home.number}` : "The warm-up duel"} · ${t.tierLabel} day. The clock starts when you tap Battle now.`}
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
              </div>
            </div>
            <div className="duel-start__side">
              <p className="duel-start__label">{their} team</p>
              <DuelTeamRows team={home.team} owner={their} onZoom={(c) => onZoom(c, their)} />
            </div>
            <div className="duel-start__side">
              <p className="duel-start__label">Your six, the same for everyone{home.bring < home.pack.length ? `. Bring ${home.bring}.` : ""}</p>
              <div className="duel-start__cards" role="group" aria-label="Your six">
                {home.pack.map((c) => <CardThumb key={c.index} card={c} size="md" onPress={() => onZoom(c, "Your")} label={`See the ${c.name} card`} />)}
              </div>
            </div>
            {home.plans.length > 0 && (
              <div className="duel-plans">
                <p className="duel-start__label">The professor&apos;s plans</p>
                <p className="duel-plans__sub">{COUNT[home.plans.length] ?? home.plans.length} ways to win, each built around a different card. Opening one doesn&apos;t change your score.</p>
                <Accordion
                  variant="flush"
                  allowMultiple
                  className="duel-plans__list"
                  items={home.plans.map((p, i) => ({ id: `plan-${i}`, title: `Plan ${i + 1}: ${p.title}`, content: <p className="duel-plans__text">{p.text}</p> }))}
                />
              </div>
            )}
            <p className="duel-start__sig"><b>{their} own event, {t.signature.title}{/[.!?]$/.test(t.signature.title) ? "" : ":"}</b> {t.signature.text}</p>
          </div>
        }
      >
        <DailySteps steps={home.rules >= 5 ? [
          { icon: "energy", title: "Play an Energy", text: "Each turn, put one of the three in your hand on any of your cards. It stays there." },
          { icon: "move", title: "Make your move", text: "A move works once its dots are covered. Hitting a Weakness does double." },
          { icon: "board", title: "Knock out every card", text: "Lose a card and the next one comes in with extra Energy. Fewer turns score higher, and your first duel today counts." },
        ] : [
          { icon: "energy", title: "Place an Energy", text: "Each turn, put the next Energy on any of your cards. It stays there." },
          { icon: "move", title: "Make your move", text: "A move works once its dots are covered. Hitting a Weakness does double." },
          { icon: "board", title: "Knock out every card", text: "Fewer turns score higher. Your first duel today counts." },
        ]} />
      </DailyStartCard>
    </section>
  );
}
