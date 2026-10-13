"use client";

/**
 * Swiss on the TV display board: the round and its clock, big, then every
 * table (or the top cut bracket, or the final standings). Read-only; it
 * refreshes itself while rounds are being played.
 */

import { BracketView } from "@/components/tournament/BracketView";
import { clockText, cutRoundLabel } from "@/lib/tournaments/swiss";
import { useClock, useSwiss } from "./useSwiss";
import { resultText } from "./SwissParts";

export function SwissBoard({ tournamentId }: { tournamentId: string }) {
  const { view } = useSwiss(tournamentId);
  const left = useClock(view?.clock ?? null);
  if (!view || view.phase === "setup") return null;
  const nameOf = (id: string | null) => (id ? view.standings.find((r) => r.id === id)?.name ?? "Player" : "TBD");
  return (
    <>
      {view.phase !== "done" && (
        <section className="tourney-display__now swiss-board__now">
          <span className="tourney-display__now-eyebrow">● {view.phase === "cut" ? `Top ${view.topCut}` : `Round ${view.round?.n} of ${view.rounds}`}</span>
          {view.clock && left !== null && <span className="tourney-display__now-title swiss-board__clock">{clockText(left)}{!view.clock.running ? " (paused)" : ""}</span>}
          <span className="tourney-display__now-names">{view.counts.done} of {view.counts.tables} {view.phase === "cut" ? "matches" : "tables"} reported</span>
        </section>
      )}

      {view.round && view.phase === "swiss" && (
        <section className="tourney-display__panel">
          <h2 className="tourney-display__h2">Pairings</h2>
          <ol className="swiss-board__tables">
            {view.round.tables.map((t) => (
              <li key={t.t} className={`swiss-board__table${t.result ? " is-done" : ""}`}>
                <span className="swiss-board__t">{t.b ? t.t : "Bye"}</span>
                <span className="swiss-board__names">
                  {t.a.name} <span className="swiss-board__rec">{t.a.record}</span>
                  {t.b && <> <span className="swiss-board__vs">vs</span> {t.b.name} <span className="swiss-board__rec">{t.b.record}</span></>}
                </span>
                {t.result && t.b && <span className="swiss-board__res">{resultText(t.result, t.a.name, t.b.name)}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {view.cut && (
        <section className="tourney-display__panel">
          <h2 className="tourney-display__h2">Top {view.topCut}</h2>
          <div className="tourney-display__structure"><BracketView bracket={view.cut.bracket} nameOf={nameOf} /></div>
          <p className="swiss-board__note">{view.cut.matches.filter((m) => m.a && m.b && !m.winner).map((m) => `${cutRoundLabel(view.cut!.bracket, m.round)}: ${nameOf(m.a)} vs ${nameOf(m.b)}`).join(" · ")}</p>
        </section>
      )}

      <section className="tourney-display__panel">
        <h2 className="tourney-display__h2">{view.phase === "done" ? "Final standings" : "Standings"}</h2>
        <ol className="tourney-display__standings">
          {view.standings.slice(0, 16).map((r) => (
            <li key={r.id} className="tourney-display__row">
              <span className="tourney-display__rank">{r.rank}</span>
              <span className="tourney-display__name">{r.name}</span>
              <span className="tourney-display__pts">{r.record} · {r.points} pts</span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
