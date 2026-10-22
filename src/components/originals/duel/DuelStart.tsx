"use client";

/**
 * Today's duel in the dailies' Start card, as today's challenger (challenger picks 2026-10-22,
 * https://claude.ai/artifact/RqcHdCgb2M4wxnLVs1NJ2E): the trainer's picture, "Larry challenged you to
 * a duel", who they are and a line about them, their team and your six as rows of cards (press one
 * to see it whole), the trainer's own event, then Battle now (it starts the official duel and its
 * clock) and three short lines on how to duel. The one boxed thing on the page before you play, in
 * the Duel's own navy.
 */

import { IconSwords } from "@tabler/icons-react";
import type { DuelCardView, DuelHome } from "@/lib/originals/duel/view";
import { DailyStartCard } from "@/components/originals/DailyStart";
import { DailySteps } from "@/components/originals/DailyParade";
import { CardThumb } from "./DuelBits";
import { TrainerArt } from "./TrainerArt";

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
              <div className="duel-start__cards" role="group" aria-label={`${their} team`}>
                {home.team.map((c) => <CardThumb key={c.index} card={c} size="md" onPress={() => onZoom(c, their)} label={`See ${their} ${c.name} card`} />)}
              </div>
            </div>
            <div className="duel-start__side">
              <p className="duel-start__label">Your six, the same for everyone</p>
              <div className="duel-start__cards" role="group" aria-label="Your six">
                {home.pack.map((c) => <CardThumb key={c.index} card={c} size="md" onPress={() => onZoom(c, "Your")} label={`See the ${c.name} card`} />)}
              </div>
            </div>
            <p className="duel-start__sig"><b>{their} own event, {t.signature.title}{/[.!?]$/.test(t.signature.title) ? "" : ":"}</b> {t.signature.text}</p>
          </div>
        }
      >
        <DailySteps steps={[
          { icon: "energy", title: "Place an Energy", text: "Each turn, put the next Energy on any of your cards. It stays there." },
          { icon: "move", title: "Make your move", text: "A move works once its dots are covered. Hitting a Weakness does double." },
          { icon: "board", title: "Knock out every card", text: "Fewer turns score higher. Your first duel today counts." },
        ]} />
      </DailyStartCard>
    </section>
  );
}
