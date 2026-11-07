/**
 * "Time trial events" on the time trials pages (events pick 12A): the events taking players or running now, each
 * with where it is and how many are in, plus a way to run one. Server component.
 */

import Link from "next/link";
import { IconStopwatch } from "@tabler/icons-react";
import { IconTile } from "@/components/ui/IconTile";
import { ArrowLink, ArrowCue, ARROW_HOST_CLASS } from "@/components/ui/ArrowLink";
import { TT_GAMES, type TtGame } from "@/lib/timeTrials/tracks";
import type { TtEventListItem } from "@/lib/tournaments/tt/store";

function closesIn(iso: string): string {
  const m = Math.max(1, Math.ceil((Date.parse(iso) - Date.now()) / 60_000));
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"}`;
  return `${Math.round(h / 24)} days`;
}

export function TtEventsRow({ events, game }: { events: TtEventListItem[]; game: TtGame | null }) {
  return (
    <section className="tt-events" aria-labelledby="tt-events-title">
      <div className="tt-events__head">
        <h2 id="tt-events-title" className="tt-events__title">Time trial events</h2>
        <ArrowLink href="/tournament/create?format=time_trial">Run one</ArrowLink>
      </div>
      {events.length ? (
        <ul className="tt-events__list">
          {events.map((e) => (
            <li key={e.id}>
              <Link href={`/tournament/${e.id}`} className={`tt-events__item ${ARROW_HOST_CLASS}`}>
                <IconTile icon={IconStopwatch} tone="blue" />
                <span className="tt-events__words">
                  <b>{e.title}</b>
                  <small>
                    {e.status === "in_progress" ? (e.closesAt ? `Running, closes in ${closesIn(e.closesAt)}` : "Running") : "Taking players"}
                    {" · "}{game ? "" : `${TT_GAMES[e.game].label}, `}{e.board}{" · "}{e.players} {e.players === 1 ? "player" : "players"}
                  </small>
                </span>
                <ArrowCue className="tt-events__cue">Open</ArrowCue>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="tt-events__none">No time trial events are open right now.</p>
      )}
    </section>
  );
}
