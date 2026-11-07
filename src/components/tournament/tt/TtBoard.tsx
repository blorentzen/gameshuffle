"use client";

/**
 * A time trial event on the TV display board (shapes pick 7A): who's up at each station (in person), the latest
 * times, and the groups with their cut line, one group at a time when there are several (or the standings on a
 * leaderboard). Read-only; refreshes every few seconds while the event runs.
 */

import { useEffect, useState } from "react";
import { formatTime, ordinal } from "@/lib/timeTrials/rules";
import type { TtEventView } from "@/lib/tournaments/tt/event";
import { trackName } from "./TtParts";
import "@/styles/tt-event.css";

const POLL_MS = 5000;
const TURN_MS = 10_000;

export function TtBoard({ tournamentId }: { tournamentId: string }) {
  const [view, setView] = useState<TtEventView | null>(null);
  const [turn, setTurn] = useState(0);
  useEffect(() => {
    let live = true;
    const load = async () => {
      const res = await fetch(`/api/tournament/${tournamentId}/tt`, { cache: "no-store" }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as { ok?: boolean; view?: TtEventView } | null;
      if (live && j?.ok && j.view) setView(j.view);
    };
    void load();
    const iv = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    const tv = window.setInterval(() => setTurn((t) => t + 1), TURN_MS);
    return () => { live = false; window.clearInterval(iv); window.clearInterval(tv); };
  }, [tournamentId]);

  if (!view || view.phase === "setup") return null;
  const cur = view.rounds.at(-1) ?? null;
  const game = view.settings.game;
  // Groups take turns on screen; your eye finds the station panel and the ticker in the same place every time.
  const groups = cur ? cur.groups : [];
  const shown = groups.length ? groups[turn % groups.length] : null;

  return (
    <>
      {view.venue && cur && cur.n > 0 && !view.final && (
        <section className="tourney-display__panel" aria-labelledby="tt-board-stations">
          <h2 id="tt-board-stations" className="tourney-display__h2">{cur.label} · Stations</h2>
          <ol className="tt-tv__stations">
            {view.venue.stations.map((s) => (
              <li key={s.n} className={`tt-tv__station${s.group != null ? " is-up" : ""}`}>
                <span className="tt-tv__station-n">Station {s.n}</span>
                {s.group != null ? (
                  <>
                    <span className="tt-tv__station-group">Group {s.label} now</span>
                    <span className="tt-tv__station-names">{s.players.join(", ")}</span>
                  </>
                ) : <span className="tt-tv__station-names">Free</span>}
              </li>
            ))}
          </ol>
          {view.venue.queue.length > 0 && <p className="tt-tv__queue">Next: {view.venue.queue.slice(0, 4).map((q) => `Group ${q.label}`).join(", ")}</p>}
        </section>
      )}

      {view.final ? (
        <section className="tourney-display__panel" aria-labelledby="tt-board-final">
          <h2 id="tt-board-final" className="tourney-display__h2">Results</h2>
          <ol className="tourney-display__standings">
            {view.final.slice(0, 12).map((f) => (
              <li key={f.participantId} className="tourney-display__row">
                <span className="tourney-display__rank">{f.place}</span>
                <span className="tourney-display__name">{f.name}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <div className="tt-tv__pair">
          {view.latest.length > 0 && (
            <section className="tourney-display__panel" aria-labelledby="tt-board-latest">
              <h2 id="tt-board-latest" className="tourney-display__h2">Latest times</h2>
              <ol className="tt-tv__latest">
                {view.latest.slice(0, 6).map((t) => (
                  <li key={`${t.name}-${t.track}-${t.at}`}>
                    <span className="tt-tv__latest-name">{t.name}</span>
                    <span className="tt-tv__latest-time">{formatTime(t.ms)}</span>
                    <span className="tt-tv__latest-track">{trackName(game, t.track)}{t.place ? `, ${ordinal(t.place)}` : ""}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {shown && cur && (
            <section className="tourney-display__panel" aria-labelledby="tt-board-group" aria-live="off">
              <h2 id="tt-board-group" className="tourney-display__h2">
                {cur.n === 0 ? "Standings" : cur.final ? "Final" : `Group ${shown.label}`}
                {groups.length > 1 && <span className="tt-tv__of"> · {(turn % groups.length) + 1} of {groups.length}</span>}
              </h2>
              <ol className="tourney-display__standings">
                {shown.rows.slice(0, 12).map((r, i) => (
                  <li key={r.participantId} className={`tourney-display__row${shown.cutAfter != null && i === shown.cutAfter - 1 && i < shown.rows.length - 1 ? " tt-tv__cut" : ""}`}>
                    <span className="tourney-display__rank">{r.done ? r.place : ""}</span>
                    <span className="tourney-display__name">{r.name}</span>
                    <span className="tourney-display__pts">
                      {view.settings.scoring === "total" ? (r.total != null ? formatTime(r.total) : `${r.done} of ${cur.tracks.length}`) : `${r.points} pts`}
                    </span>
                  </li>
                ))}
              </ol>
              {shown.cutAfter != null && <p className="tt-tv__queue">{shown.cutAfter === 1 ? "The fastest moves on" : `Top ${shown.cutAfter} move on`}</p>}
            </section>
          )}
        </div>
      )}
    </>
  );
}
