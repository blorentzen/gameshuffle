"use client";

/**
 * Today's duel in the dailies' Start card: the trainer (their picture as a banner, with their name,
 * title and the game their team is from over it),
 * their team and your six as rows of cards (press one to see it whole), the trainer's own event,
 * then the Start button (it starts the official duel and its clock) and three short lines on how
 * to duel. The one boxed thing on the page before you play.
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
        label="Start today's duel"
        note="The clock starts when you tap Start."
        head={
          <div className="duel-start__head">
            <span className="duel-start__tile" aria-hidden="true"><IconSwords size={22} stroke={2} /></span>
            <h2 id="duel-today-title" className="duel-start__title">Today&apos;s Daily Duel{home.number >= 1 ? ` #${home.number}` : ""}</h2>
            {t.picture ? (
              <div className="duel-banner">
                <TrainerArt picture={t.picture} shape="banner" alt={t.picture.alt} eager className="duel-banner__art" />
                <div className="duel-banner__text">
                  <p className="duel-banner__name">{t.name}</p>
                  <p className="duel-banner__title">{t.title} · {t.game}</p>
                </div>
              </div>
            ) : (
              <p className="duel-start__who"><b>{t.name}</b>, {t.title} · {t.game}</p>
            )}
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
            <p className="duel-start__sig"><b>{their} own event, {t.signature.title}:</b> {t.signature.text}</p>
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
