"use client";

import { useState } from "react";
import { Alert, Badge, Button, Chip, Input, Select } from "@empac/cascadeds";
import { MIXED } from "@/lib/originals/oddOneOut";

/**
 * Odd One Out on a phone inside a live night (a GameShuffle Original). The
 * server only ever sends this seat's own card; the host is a player like
 * everyone else and sees no one else's.
 */

export interface OddActivityView {
  slug: "odd-one-out";
  label: string;
  ready: boolean;
  players: number[];
  totalRounds: number;
  packs: { id: string; label: string }[];
  current: null | {
    round: number;
    category: string;
    start: number;
    phase: "hints" | "guess" | "done";
    votesIn: number;
    voters: number;
    voted: number[];
    myVote: number | null;
    hand: { odd: false; word: string; category: string } | { odd: true; category: string } | null;
    reveal: null | {
      odd: number;
      caught: boolean;
      votes: { seat: number; count: number }[];
      word: string | null;
      guess: string | null;
      guessOk: boolean | null;
      points: { seat: number; points: number }[];
    };
  };
  totals: { seat: number; points: number }[];
  history: { round: number; word: string; odd: number; caught: boolean }[];
}

export function OddOneOutPanel({ activity: a, me, seatName, busy, act, gameDone }: {
  activity: OddActivityView;
  me: { isHost: boolean; seat: number | null };
  seatName: (i: number) => string;
  busy: boolean;
  act: (body: Record<string, unknown>) => Promise<unknown>;
  gameDone: boolean;
}) {
  const [pack, setPack] = useState(MIXED);
  const [guess, setGuess] = useState("");

  if (!a.ready) {
    return <Alert variant="info" title="Odd One Out is almost here">It needs a database update before it can run in a live night. The pass-the-phone version on the tools page works now.</Alert>;
  }

  const c = a.current;
  const playing = me.seat !== null && a.players.includes(me.seat);
  const betweenRounds = !c || c.phase === "done";
  const roundsDone = a.history.length;
  const standings = [...a.totals].sort((x, y) => y.points - x.points || x.seat - y.seat);

  return (
    <section className="party-section oddone">
      <div className="oddone__head">
        <h3 className="party-h3">Odd One Out</h3>
        <span className="party-muted">{c ? `Round ${c.round} of ${a.totalRounds}` : `${a.totalRounds} rounds`}</span>
      </div>

      {a.players.length < 3 && <Alert variant="warning" title="Needs three players">Odd One Out needs at least three people in seats. Share the code so more can join.</Alert>}

      {!c && (
        <p className="party-muted">
          Everyone gets the same secret word except one player, who only sees the category. Go around giving one-word hints out loud, then vote on your phone for who&apos;s faking it.
        </p>
      )}

      {c && c.phase === "hints" && (
        <>
          {playing && c.hand ? (
            <div className={`oddone__card${c.hand.odd ? " oddone__card--odd" : ""}`}>
              <span className="oddone__label">{c.hand.odd ? "You're the odd one out" : "Your word"}</span>
              <strong className="oddone__word">{c.hand.odd ? "Bluff it" : c.hand.word}</strong>
              <span className="party-muted">Category: {c.hand.category}{c.hand.odd ? ". Listen to the hints and blend in." : ". Keep it hidden."}</span>
            </div>
          ) : (
            <p className="party-muted">You&apos;re watching this round. Category: {c.category}.</p>
          )}
          <p className="oddone__turn"><strong>{seatName(c.start)}</strong> gives the first hint, then go around the room. One word each.</p>

          {playing && (
            <div className="oddone__vote">
              <p className="party-options__label">Who&apos;s the odd one out?</p>
              <div className="party-chips">
                {a.players.filter((s) => s !== me.seat).map((s) => (
                  <Chip key={s} clickable selected={c.myVote === s} variant={c.myVote === s ? "primary" : "default"} label={seatName(s)}
                    onClick={() => { if (!busy) void act({ action: "oo_vote", target: s }); }} />
                ))}
              </div>
            </div>
          )}
          <p className="party-muted">{c.votesIn} of {c.voters} voted{c.votesIn < c.voters ? `. Waiting on ${a.players.filter((s) => !c.voted.includes(s)).map(seatName).join(", ")}.` : ". Everyone's in."}</p>
          {me.isHost && (
            <Button variant="primary" size="small" disabled={busy || c.votesIn === 0} onClick={() => act({ action: "oo_reveal" })}>
              {c.votesIn < c.voters ? "Reveal now" : "Reveal the votes"}
            </Button>
          )}
        </>
      )}

      {c && c.reveal && (
        <div className="oddone__reveal">
          <p className="oddone__verdict">
            <strong>{seatName(c.reveal.odd)}</strong> was the odd one out
            {c.reveal.caught ? " and got caught." : " and got away with it!"}
          </p>
          <ul className="party-live__scores">
            {[...c.reveal.votes].sort((x, y) => y.count - x.count).map((v) => (
              <li key={v.seat}><span>{seatName(v.seat)}{v.seat === c.reveal!.odd ? " (odd one out)" : ""}</span><span className="party-muted">{v.count} vote{v.count === 1 ? "" : "s"}</span></li>
            ))}
          </ul>

          {c.phase === "guess" && (
            me.seat === c.reveal.odd ? (
              <div className="party-row">
                <Input floatingLabel="Your guess at the word" value={guess} maxLength={40} onChange={(e) => setGuess(e.target.value)} />
                <Button variant="primary" size="small" disabled={busy || !guess.trim()} onClick={async () => { if (await act({ action: "oo_guess", guess })) setGuess(""); }}>Guess</Button>
              </div>
            ) : <p className="party-muted">{seatName(c.reveal.odd)} gets one guess at the word…</p>
          )}
          {c.phase === "guess" && me.isHost && (
            <span className="party-row">
              <span className="party-muted">Said it out loud?</span>
              <Button variant="secondary" size="small" disabled={busy} onClick={() => act({ action: "oo_judge", ok: true })}>They got it</Button>
              <Button variant="ghost" size="small" disabled={busy} onClick={() => act({ action: "oo_judge", ok: false })}>Missed it</Button>
            </span>
          )}

          {c.phase === "done" && c.reveal.word && (
            <>
              <p className="oddone__answer">The word was <strong>{c.reveal.word}</strong>
                {c.reveal.guess ? <> · {seatName(c.reveal.odd)} guessed &ldquo;{c.reveal.guess}&rdquo; {c.reveal.guessOk ? <Badge variant="success" size="small">Correct</Badge> : <Badge variant="default" size="small">Not it</Badge>}</> : null}
              </p>
              {c.reveal.points.length > 0 && <p className="party-muted">This round: {c.reveal.points.map((p) => `${seatName(p.seat)} +${p.points}`).join(", ")}</p>}
              {me.isHost && c.reveal.caught && c.reveal.guessOk === false && (
                <Button variant="ghost" size="small" disabled={busy} onClick={() => act({ action: "oo_judge", ok: true })}>Count the guess as right</Button>
              )}
            </>
          )}
        </div>
      )}

      {standings.some((s) => s.points > 0) && (
        <div>
          <p className="party-options__label">Odd One Out standings</p>
          <ul className="party-live__scores">
            {standings.map((s) => <li key={s.seat}><span>{seatName(s.seat)}</span><span className="party-muted">{s.points} pts</span></li>)}
          </ul>
        </div>
      )}

      {me.isHost && betweenRounds && !gameDone && (
        <div className="party-row">
          <Select floatingLabel="Word pack" value={pack} onChange={(v) => setPack(String(v))}
            options={[{ value: MIXED, label: "Mixed (a random pack)" }, ...a.packs.map((p) => ({ value: p.id, label: p.label }))]} />
          <Button variant="primary" size="small" disabled={busy || a.players.length < 3} onClick={() => act({ action: "oo_round", pack })}>
            {c ? `Deal round ${c.round + 1}` : "Deal the first round"}
          </Button>
          {roundsDone > 0 && (
            <Button variant="secondary" size="small" disabled={busy} onClick={() => act({ action: "oo_finish" })}>
              Finish and score it
            </Button>
          )}
        </div>
      )}
      {me.isHost && betweenRounds && roundsDone > 0 && !gameDone && (
        <p className="party-muted">Finishing turns the standings into placements, so Odd One Out counts toward tonight&apos;s scoreboard like any game.</p>
      )}
    </section>
  );
}

/** Every activity view a live night can carry. */
export type ActivityView = OddActivityView | import("@/components/party/MostLikelyPanel").LikelyActivityView | import("@/components/party/TierWarsPanel").TierActivityView | import("@/components/party/DraftPanel").DraftActivityView | import("@/components/party/BingoPanel").BingoActivityView;
