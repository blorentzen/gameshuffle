"use client";

/**
 * The Daily Duel's challenger on the pages that lead into it (picks 2026-10-22,
 * https://claude.ai/artifact/RqcHdCgb2M4wxnLVs1NJ2E, all as recommended; Britton: no badge on the
 * picture, the headline says it). "Larry challenged you to a duel": the trainer's own card art, who
 * they are, their team as cards, Battle now. ChallengerBand leads the homepage's Today (in place of
 * the Duel's small card); ChallengerStrip sits under the today bar on the other dailies. Once today's
 * official duel is over, both show how it went and who comes tomorrow (by tier, never by name).
 */

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "@empac/cascadeds";
import { IconSwords } from "@tabler/icons-react";
import type { DuelChallengerView } from "@/lib/originals/duel/view";
import { currentDay, dailiesSnapshot, readDailiesStore, subscribeDailies, type DuelDayResult } from "@/lib/originals/dailies";
import { tomorrowLine } from "@/lib/originals/duel/rules";
import { EVENTS, track } from "@/lib/analytics/events";
import { TrainerArt } from "./TrainerArt";
import "@/styles/duel-challenger.css";

/** Today's official duel as this browser recorded it: undefined before it's over, else its result (null when unknown). */
export function useTodayDuelResult(): DuelDayResult | null | undefined {
  const raw = useSyncExternalStore(subscribeDailies, dailiesSnapshot, () => "");
  return useMemo(() => {
    const e = readDailiesStore(raw || "null").entries.duel;
    return e?.state === "done" && e.day === currentDay("duel") ? e.duel ?? null : undefined;
  }, [raw]);
}

let challengerLoad: Promise<DuelChallengerView | null> | null = null;
/** Today's challenger from the Duel's API (one request per page; cached a minute at the edge). */
function useChallenger(initial: DuelChallengerView | null): DuelChallengerView | null {
  const [c, setC] = useState(initial);
  useEffect(() => {
    if (initial) return;
    challengerLoad ??= fetch("/api/daily-duel?view=challenger").then((r) => (r.ok ? r.json() : null)).then((d: ({ ready: boolean } & DuelChallengerView) | null) => (d?.ready ? d : null)).catch(() => null);
    let alive = true;
    void challengerLoad.then((v) => { if (alive) setC(v); });
    return () => { alive = false; };
  }, [initial]);
  return c;
}

/** "You beat Larry in 11 turns" / "Larry won today's duel". */
function resultLine(name: string, r: DuelDayResult | null): string {
  if (!r) return `You've dueled ${name} today`;
  return r.won ? `You beat ${name} in ${r.turns} ${r.turns === 1 ? "turn" : "turns"}` : `${name} won today's duel`;
}

/** The homepage's challenger: the picture, the headline, who they are, their team and Battle now. */
export function ChallengerBand({ challenger }: { challenger: DuelChallengerView }) {
  const played = useTodayDuelResult();
  const c = challenger;
  const done = played !== undefined;
  return (
    <article className="duel-ch" aria-labelledby="duel-ch-title">
      {c.picture && (
        <div className="duel-ch__media">
          <TrainerArt picture={c.picture} shape="banner" alt={c.picture.alt} className="duel-ch__art" />
        </div>
      )}
      <div className="duel-ch__body">
        <h3 id="duel-ch-title" className="duel-ch__title">{done ? resultLine(c.name, played) : `${c.name} challenged you to a duel`}</h3>
        <p className="duel-ch__who">{c.title} · {c.game}</p>
        {!done && c.team.length > 0 && (
          <>
            <p className="duel-ch__label">{c.name}&apos;s team</p>
            <ul className="duel-ch__team" style={{ "--n": c.team.length } as React.CSSProperties} aria-label={`${c.name}'s team`}>
              {c.team.map((card, i) => (
                <li key={i}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- Scrydex CDN image, medium size, never rewritten */}
                  {card.img ? <img src={card.img} alt={card.name} loading="lazy" decoding="async" /> : <span className="duel-ch__noart">{card.name}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
        <Link href="/daily-duel" className="duel-ch__link" onClick={() => track(EVENTS.duelChallengerClicked, { from: "home", played: done })}>
          {done
            ? <Button variant="secondary" size="large" className="duel-ch__again">See how you did</Button>
            : <Button variant="primary" size="large" iconBefore={IconSwords} className="duel-ch__go">Battle now</Button>}
        </Link>
        <p className="duel-ch__small">{done ? tomorrowLine(c.day) : `Daily Duel #${c.number} · ${c.tierLabel} day · the same six cards for everyone`}</p>
      </div>
    </article>
  );
}

/**
 * The other dailies' challenger, under the today bar: the trainer's face, the headline and Battle.
 * `result` comes from the dailies (undefined until today's official duel is over).
 */
export function ChallengerStrip({ result, from }: { result: DuelDayResult | null | undefined; from: string }) {
  const c = useChallenger(null);
  if (!c) return null;
  const done = result !== undefined;
  return (
    <div className={`duel-chs${done ? " duel-chs--done" : ""}`}>
      {c.picture && <TrainerArt picture={c.picture} shape="round" className="duel-chs__face" />}
      <p className="duel-chs__text">
        <b>{done ? resultLine(c.name, result) : `${c.name} challenged you to a duel`}</b>
        {done && <span>{tomorrowLine(c.day)}</span>}
      </p>
      <Link href="/daily-duel" className="duel-chs__link" onClick={() => track(EVENTS.duelChallengerClicked, { from, played: done })}>
        {done
          ? <Button variant="secondary" size="small" className="duel-chs__again">Results<span className="sr-only"> of today&apos;s Daily Duel</span></Button>
          : <Button variant="primary" size="medium" iconBefore={IconSwords} className="duel-chs__go">Battle<span className="sr-only"> {c.name} in today&apos;s Daily Duel</span></Button>}
      </Link>
    </div>
  );
}
