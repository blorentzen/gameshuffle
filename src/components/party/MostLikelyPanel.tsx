"use client";

import { useState } from "react";
import { Alert, Button, Chip, Select } from "@empac/cascadeds";

/**
 * Most Likely To on a phone inside a live night (a GameShuffle Original). The
 * prompt is on the TV, everyone votes here (yourself included), and the reveal
 * shows who the room picked. Votes stay anonymous: only counts are shown.
 */

export interface LikelyActivityView {
  slug: "most-likely-to";
  label: string;
  ready: boolean;
  players: number[];
  totalRounds: number;
  packs: { id: string; label: string }[];
  current: null | {
    round: number;
    prompt: string;
    phase: "voting" | "done";
    votesIn: number;
    voters: number;
    voted: number[];
    myVote: number | null;
    reveal: null | { votes: { seat: number; count: number }[]; top: number[]; points: { seat: number; points: number }[] };
  };
  totals: { seat: number; points: number }[];
  history: { round: number; prompt: string; top: number[] }[];
}

const MIXED = "mixed";

export function MostLikelyPanel({ activity: a, me, seatName, busy, act, gameDone }: {
  activity: LikelyActivityView;
  me: { isHost: boolean; seat: number | null };
  seatName: (i: number) => string;
  busy: boolean;
  act: (body: Record<string, unknown>) => Promise<unknown>;
  gameDone: boolean;
}) {
  const [pack, setPack] = useState(MIXED);
  if (!a.ready) {
    return <Alert variant="info" title="Most Likely To is almost here">It needs a database update before it can run in a live night.</Alert>;
  }
  const c = a.current;
  const playing = me.seat !== null && a.players.includes(me.seat);
  const betweenRounds = !c || c.phase === "done";
  const standings = [...a.totals].sort((x, y) => y.points - x.points || x.seat - y.seat);
  const names = (seats: number[]) => seats.map(seatName).join(" and ");

  return (
    <section className="party-section oddone">
      <div className="oddone__head">
        <h3 className="party-h3">Most Likely To</h3>
        <span className="party-muted">{c ? `Round ${c.round} of ${a.totalRounds}` : `${a.totalRounds} rounds`}</span>
      </div>

      {a.players.length < 3 && <Alert variant="warning" title="Needs three players">Most Likely To needs at least three people in seats. Share the code so more can join.</Alert>}
      {!c && <p className="party-muted">A prompt goes up on the TV and everyone votes for who fits it best, yourself included. You score a point every time your vote matches the room&apos;s pick.</p>}

      {c && (
        <div className="likely__prompt">
          <span className="oddone__label">Who&apos;s most likely to…</span>
          <strong className="likely__text">{c.prompt}?</strong>
        </div>
      )}

      {c && c.phase === "voting" && (
        <>
          {playing && (
            <div className="party-chips">
              {a.players.map((s) => (
                <Chip key={s} clickable selected={c.myVote === s} variant={c.myVote === s ? "primary" : "default"} label={s === me.seat ? `${seatName(s)} (me)` : seatName(s)}
                  onClick={() => { if (!busy) void act({ action: "ml_vote", target: s }); }} />
              ))}
            </div>
          )}
          <p className="party-muted">{c.votesIn} of {c.voters} voted{c.votesIn < c.voters ? `. Waiting on ${a.players.filter((s) => !c.voted.includes(s)).map(seatName).join(", ")}.` : ". Everyone's in."} Votes are anonymous.</p>
          {me.isHost && (
            <Button variant="primary" size="small" disabled={busy || c.votesIn === 0} onClick={() => act({ action: "ml_reveal" })}>
              {c.votesIn < c.voters ? "Reveal now" : "Reveal the votes"}
            </Button>
          )}
        </>
      )}

      {c && c.reveal && (
        <div className="oddone__reveal">
          <p className="oddone__verdict">The room picked <strong>{names(c.reveal.top)}</strong>.</p>
          <ul className="party-live__scores">
            {[...c.reveal.votes].filter((v) => v.count > 0).sort((x, y) => y.count - x.count).map((v) => (
              <li key={v.seat}><span>{seatName(v.seat)}</span><span className="party-muted">{v.count} vote{v.count === 1 ? "" : "s"}</span></li>
            ))}
          </ul>
          {c.reveal.points.length > 0 && <p className="party-muted">Read the room: {c.reveal.points.map((p) => seatName(p.seat)).join(", ")} +1</p>}
        </div>
      )}

      {standings.some((s) => s.points > 0) && (
        <div>
          <p className="party-options__label">Most Likely To standings</p>
          <ul className="party-live__scores">
            {standings.map((s) => <li key={s.seat}><span>{seatName(s.seat)}</span><span className="party-muted">{s.points} pts</span></li>)}
          </ul>
        </div>
      )}

      {me.isHost && betweenRounds && !gameDone && (
        <div className="party-row">
          <Select floatingLabel="Prompt pack" value={pack} onChange={(v) => setPack(String(v))}
            options={[{ value: MIXED, label: "Mixed (a random pack)" }, ...a.packs.map((p) => ({ value: p.id, label: p.label }))]} />
          <Button variant="primary" size="small" disabled={busy || a.players.length < 3} onClick={() => act({ action: "ml_round", pack })}>
            {c ? `Next prompt (${c.round + 1})` : "First prompt"}
          </Button>
          {a.history.length > 0 && <Button variant="secondary" size="small" disabled={busy} onClick={() => act({ action: "ml_finish" })}>Finish and score it</Button>}
        </div>
      )}
    </section>
  );
}
