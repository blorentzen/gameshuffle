"use client";

/**
 * /dailies (choose your dailies, 2026-11-09, all as recommended): Yours (your dailies with today's state: played or
 * not, the result, the streak, and Play or a check), More to try (the dailies you didn't pick, with Try), This week
 * (the Weekly), and Choose, which opens the sheet. Signed out: all of them under Today's dailies, and a line to make
 * a free account. Before the account can store a list (the migration), signed in reads like signed out without the
 * account line. Rows, not boxes: one flat list per section.
 */

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button } from "@empac/cascadeds";
import { IconAdjustmentsHorizontal, IconCircleCheckFilled, IconFlame } from "@tabler/icons-react";
import { IconTile } from "@/components/ui/IconTile";
import { DAILIES_GLYPHS } from "@/components/originals/DailiesCards";
import { useDailiesToday } from "@/components/originals/Dailies";
import { DailyPicksSheet, useDailyPicks, type DailyPicksSeed } from "@/components/originals/DailyPicks";
import { EVENTS, track } from "@/lib/analytics/events";
import {
  DAILIES, availableDailies, currentDay, formatTime, weeklyLine,
  type DailiesEntry, type DailiesId, type DailyGameId,
} from "@/lib/originals/dailies";

type From = "yours" | "more" | "today" | "week";

/** Today's state in a few words: the result once played, else new or under way. */
function stateText(id: DailiesId, e: DailiesEntry | undefined): string {
  if (e?.state === "done") {
    if (id === "fire") return e.fire ? `${e.fire.score.toLocaleString("en-US")} points, ${e.fire.right} right` : "Played today";
    if (id === "duel") {
      if (!e.duel) return "Played today";
      return e.duel.won ? `Won in ${e.duel.turns} turns${e.duel.par ? `, par ${e.duel.par}` : ""}` : "Lost today";
    }
    const r = e.result;
    if (!r) return "Played today";
    if (!r.solved) return "Not solved today";
    const time = r.seconds != null ? ` in ${formatTime(r.seconds)}` : "";
    return r.saved ? `Solved on the last chance${time}` : `Solved in ${r.guesses} ${r.guesses === 1 ? "guess" : "guesses"}${r.seconds != null ? `, ${formatTime(r.seconds)}` : ""}`;
  }
  return e?.state === "playing" ? "Under way" : "New today";
}

function Row({ id, entry, from, action, line }: { id: DailiesId; entry: DailiesEntry | undefined; from: From; action: string; line?: ReactNode }) {
  const g = DAILIES[id];
  const done = entry?.state === "done";
  const streak = entry?.stats?.streak ?? 0;
  const go = () => track(EVENTS.allDailiesClicked, { to: id, from });
  return (
    <li className={`all-dailies__row dailies--${id}`}>
      <IconTile icon={DAILIES_GLYPHS[id]} tone={id} />
      <div className="all-dailies__text">
        <Link href={g.href} className="all-dailies__name" onClick={go}>{g.name}</Link>
        <p className="all-dailies__status">
          {line ?? <span>{stateText(id, entry)}</span>}
          {id !== "weekly" && streak > 0 && (
            <span className="all-dailies__streak"><IconFlame size={16} stroke={2} aria-hidden="true" />{streak} day streak</span>
          )}
        </p>
      </div>
      <div className="all-dailies__go">
        {done && id !== "weekly" ? (
          <span className="all-dailies__done" role="img" aria-label="Played today"><IconCircleCheckFilled size={28} aria-hidden="true" /></span>
        ) : (
          <Link href={g.href} onClick={go} className="empac-button empac-button--secondary empac-button--small">
            {action}<span className="sr-only"> {g.name}</span>
          </Link>
        )}
      </div>
    </li>
  );
}

export function AllDailies({ initial }: { initial: DailyPicksSeed }) {
  const { picks, signedIn, canChoose } = useDailyPicks(initial);
  const { entries } = useDailiesToday();
  const [choosing, setChoosing] = useState(false);
  const available = availableDailies();
  // Only today's entries count (a report from yesterday reads as new today).
  const today = (id: DailiesId): DailiesEntry | undefined => (entries[id]?.day === currentDay(id) ? entries[id] : undefined);
  const mine = available.filter((id) => (picks as DailiesId[]).includes(id));
  const more = available.filter((id) => !mine.includes(id));
  const personal = signedIn && canChoose;
  const week = weeklyLine(today("weekly"));
  const playLabel = (id: DailyGameId) => (today(id)?.state === "playing" ? "Keep playing" : "Play");

  return (
    <>
      {personal ? (
        <>
          <section className="all-dailies__section" aria-labelledby="all-dailies-yours">
            <div className="all-dailies__head">
              <h2 id="all-dailies-yours" className="all-dailies__title">Yours</h2>
              <Button variant="ghost" size="small" iconBefore={IconAdjustmentsHorizontal} onClick={() => setChoosing(true)} aria-haspopup="dialog">
                Choose<span className="sr-only"> your dailies</span>
              </Button>
            </div>
            <ul className="all-dailies__list">
              {mine.map((id) => <Row key={id} id={id} entry={today(id)} from="yours" action={playLabel(id)} />)}
            </ul>
          </section>
          {more.length > 0 && (
            <section className="all-dailies__section" aria-labelledby="all-dailies-more">
              <h2 id="all-dailies-more" className="all-dailies__title">More to try</h2>
              <ul className="all-dailies__list">
                {more.map((id) => <Row key={id} id={id} entry={today(id)} from="more" action="Try" line={<span>{DAILIES[id].pitch}</span>} />)}
              </ul>
            </section>
          )}
        </>
      ) : (
        <section className="all-dailies__section" aria-labelledby="all-dailies-today">
          <h2 id="all-dailies-today" className="all-dailies__title">Today&apos;s dailies</h2>
          <ul className="all-dailies__list">
            {available.map((id) => <Row key={id} id={id} entry={today(id)} from="today" action={playLabel(id)} />)}
          </ul>
          {!signedIn && (
            <p className="all-dailies__account">
              <Link href="/signup?redirect=/dailies">Make a free account</Link> to choose yours.
            </p>
          )}
        </section>
      )}
      <section className="all-dailies__section" aria-labelledby="all-dailies-week">
        <h2 id="all-dailies-week" className="all-dailies__title">This week</h2>
        <ul className="all-dailies__list">
          <Row
            id="weekly"
            entry={today("weekly")}
            from="week"
            action={week.action}
            line={<span>{week.status[0].toUpperCase() + week.status.slice(1).replace(" · ", ", ")}</span>}
          />
        </ul>
      </section>
      {personal && <DailyPicksSheet open={choosing} onClose={() => setChoosing(false)} />}
    </>
  );
}
