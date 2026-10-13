"use client";

import { useState } from "react";
import { Alert, Button, Select } from "@empac/cascadeds";
import { LETTERS, FREE, letterFor } from "@/lib/originals/bingo";

/**
 * Number Bingo on a phone inside a live night (a GameShuffle Original, the
 * couch version of Stream Bingo). You mark your own card; a Bingo! claim is
 * checked on the server against the numbers actually called.
 */

export interface BingoActivityView {
  slug: "number-bingo";
  label: string;
  ready: boolean;
  players: number[];
  totalRounds: number;
  patterns: { id: string; label: string; blurb: string }[];
  current: null | { round: number; phase: "calling" | "done"; called: number[]; last: number | null; winner: number | null; line: number[] | null; pattern: string; patternLabel: string; myCard: number[] | null; /** Keeps marks apart when round numbers repeat (the Discord room). */ scope?: string };
  /** The Discord room calls numbers on a timer: seconds between calls (0 = by hand). */
  callSeconds?: number;
  totals: { seat: number; points: number }[];
  history: { round: number; winner: number | null }[];
}

function marksKey(round: number | string) { return `gs-bingo-marks:${typeof window !== "undefined" ? window.location.pathname : ""}:${round}`; }
function readMarks(round: number | string): number[] { try { return JSON.parse(localStorage.getItem(marksKey(round)) ?? "[]") as number[]; } catch { return []; } }

export function BingoPanel({ activity: a, me, seatName, busy, act, gameDone, inCall = false }: {
  activity: BingoActivityView;
  me: { isHost: boolean; seat: number | null };
  seatName: (i: number) => string;
  busy: boolean;
  act: (body: Record<string, unknown>) => Promise<unknown>;
  gameDone: boolean;
  /** Played in a Discord call (the Activity's Together tab) instead of at a live night. */
  inCall?: boolean;
}) {
  const c = a.current;
  // Marks are yours alone and live on this phone; the server never needs them.
  const [marks, setMarks] = useState<{ round: number | string; squares: number[] } | null>(null);
  const [pattern, setPattern] = useState("line");
  if (!a.ready) return <Alert variant="info" title="Bingo is almost here">It needs a database update before it can run in a live night.</Alert>;

  const key = c ? (c.scope ?? c.round) : 0;
  const squares = c ? (marks?.round === key ? marks.squares : readMarks(key)) : [];
  const toggle = (i: number) => {
    if (!c) return;
    // Functional update so two quick taps both stick (see LiveBingoCard).
    setMarks((prev) => {
      const cur = prev?.round === key ? prev.squares : readMarks(key);
      const next = cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i];
      try { localStorage.setItem(marksKey(key), JSON.stringify(next)); } catch { /* marks still work this visit */ }
      return { round: key, squares: next };
    });
  };
  const standings = [...a.totals].sort((x, y) => y.points - x.points || x.seat - y.seat);
  const betweenRounds = !c || c.phase === "done";

  return (
    <section className="party-section oddone">
      <div className="oddone__head">
        <h3 className="party-h3">Number Bingo</h3>
        <span className="party-muted">{c ? `Round ${c.round} of ${a.totalRounds}` : `${a.totalRounds} rounds`}</span>
      </div>
      {!c && <p className="party-muted">{inCall ? "Everyone gets a card on their own screen. Numbers are called every few seconds" : "Everyone gets a card on their phone. The host calls numbers (they show on the TV)"}, you mark your own card, and the first real bingo wins the round.</p>}

      {c && c.phase === "calling" && (
        <p className="party-muted">To win this round: <strong>{c.patternLabel}</strong> ({a.patterns.find((p) => p.id === c.pattern)?.blurb.toLowerCase()}).</p>
      )}

      {c && c.last !== null && c.phase === "calling" && (
        <div className="likely__prompt bingo-live__call">
          <span className="oddone__label">Just called · {c.called.length} of 75</span>
          <strong className="bingo-live__num">{letterFor(c.last)} {c.last}</strong>
        </div>
      )}

      {c && c.myCard && (
        <div className="bingo-card bingo-card--numbers bingo-live__card">
          <div className="bingo-card__header" aria-hidden="true">{LETTERS.map((l) => <span key={l} className="bingo-card__letter">{l}</span>)}</div>
          <div className="bingo-card__grid">
            {c.myCard.map((n, i) => {
              const free = n === FREE;
              const inLine = c.phase === "done" && c.winner === me.seat && c.line?.includes(i);
              return (
                <button key={i} type="button" disabled={free || c.phase === "done"} aria-pressed={free || squares.includes(i)}
                  className={`bingo-cell${free ? " bingo-cell--free" : ""}${free || squares.includes(i) ? " is-marked" : ""}${inLine ? " bingo-live__win" : ""}`}
                  onClick={() => toggle(i)}>
                  <span className="bingo-cell__text">{free ? "Free" : n}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {c && c.phase === "calling" && c.myCard && (
        <Button variant="primary" size="large" disabled={busy} onClick={() => act({ action: "bg_claim" })}>Bingo!</Button>
      )}

      {c && c.phase === "done" && c.winner !== null && (
        <p className="oddone__verdict"><strong>{seatName(c.winner)}</strong> got bingo in round {c.round}!</p>
      )}

      {!inCall && standings.some((s) => s.points > 0) && (
        <div>
          <p className="party-options__label">Rounds won</p>
          <ul className="party-live__scores">{standings.map((s) => <li key={s.seat}><span>{seatName(s.seat)}</span><span className="party-muted">{s.points}</span></li>)}</ul>
        </div>
      )}

      {me.isHost && !gameDone && (
        <div className="party-row">
          {c && c.phase === "calling" && <Button variant="primary" size="small" disabled={busy} onClick={() => act({ action: "bg_call" })}>Call the next number</Button>}
          {betweenRounds && (
            <Select floatingLabel="Pattern to win" value={pattern} onChange={(v) => setPattern(String(v))}
              options={[...a.patterns.map((p) => ({ value: p.id, label: p.label })), { value: "series", label: "Series (a new pattern each round)" }]} />
          )}
          {betweenRounds && <Button variant={c ? "secondary" : "primary"} size="small" disabled={busy || a.players.length < 2} onClick={() => act({ action: "bg_round", pattern })}>{c ? `Deal round ${c.round + 1}` : "Deal the cards"}</Button>}
          {betweenRounds && a.history.length > 0 && <Button variant="secondary" size="small" disabled={busy} onClick={() => act({ action: "bg_finish" })}>Finish and score it</Button>}
        </div>
      )}
    </section>
  );
}
