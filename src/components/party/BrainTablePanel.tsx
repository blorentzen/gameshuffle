"use client";

import { useState } from "react";
import { Alert, Button, Input } from "@empac/cascadeds";
import type { BrainTableView } from "@/lib/party/brainTable";
import type { TableSlot } from "@/lib/chatbrain/tableRules";
import "@/styles/brain-table.css";

/**
 * Chat Brain at the table, on a phone in a live night: the room is one team
 * against a board. The question is on the TV; everyone types an answer here,
 * and when everyone's in (or the host locks it) the answer most of you gave
 * counts for the room. Three strikes or a cleared board ends the board.
 */

export type BrainTableActivityView = BrainTableView;

export function BrainStrikes({ strikes, max }: { strikes: number; max: number }) {
  return (
    <span className="brain-table__strikes" role="img" aria-label={`${strikes} of ${max} strikes`}>
      {Array.from({ length: max }, (_, i) => <span key={i} className={i < strikes ? "is-on" : ""} aria-hidden>✕</span>)}
    </span>
  );
}

/** The board as a list: rank, the answer once found (or "Hidden"), points. */
export function BrainSlots({ slots, tv = false }: { slots: TableSlot[]; tv?: boolean }) {
  return (
    // The TV reads down each column like the stream's board: 1-4 on the left, 5-8 on the right.
    <ol className={tv ? "party-tv__board brain-table__tv-board" : "brain-table__board"} style={tv ? { gridTemplateRows: `repeat(${Math.max(1, Math.ceil(slots.length / 2))}, auto)` } : undefined}>
      {slots.map((s) => (
        <li key={s.rank} className={s.label ? (s.found ? "is-found" : "is-revealed") : undefined}>
          <span className={tv ? "party-tv__rank" : "brain-table__rank"}>{s.rank}</span>
          <span className="brain-table__label">{s.label ?? <span className="brain-table__hidden">Hidden</span>}</span>
          <span className={tv ? "party-tv__pts" : "brain-table__pts"}>{s.label ? s.points : ""}</span>
        </li>
      ))}
    </ol>
  );
}

export function BrainTablePanel({ activity: a, me, seatName, busy, act, gameDone }: {
  activity: BrainTableActivityView;
  me: { isHost: boolean; seat: number | null };
  seatName: (i: number) => string;
  busy: boolean;
  act: (body: Record<string, unknown>) => Promise<unknown>;
  gameDone: boolean;
}) {
  const [text, setText] = useState("");
  if (!a.ready) {
    return <Alert variant="info" title="Chat Brain is almost here">It needs a database update before it can run in a live night.</Alert>;
  }
  const c = a.current;
  const playing = me.seat !== null && a.players.includes(me.seat);
  const betweenBoards = !c || c.phase === "done";
  const waiting = c && c.phase === "playing" ? a.players.filter((s) => !c.answered.includes(s)) : [];
  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    if (await act({ action: "cb_answer", text: t })) setText("");
  };

  return (
    <section className="party-section oddone brain-table">
      <div className="oddone__head">
        <h3 className="party-h3">Chat Brain</h3>
        <span className="party-muted">{c ? `Board ${c.round} of ${a.totalRounds}` : `${a.totalRounds} boards`}</span>
      </div>

      {a.result ? (
        <p className="brain-table__result">{a.result.won ? `You won together: ${a.result.total} points, ${a.result.target} needed.` : `${a.result.total} points, ${a.result.target} needed. Not this time.`}</p>
      ) : (
        <p className="party-muted">Banked so far: <strong>{a.total}</strong> of {a.target} to win together.</p>
      )}

      {a.players.length < 2 && <Alert variant="warning" title="Needs two players">Chat Brain needs at least two people in seats. Share the code so more can join.</Alert>}
      {!c && (
        <p className="party-muted">
          A question goes up on the TV and everyone types an answer. The answer most of you gave counts for the room: if it&apos;s on the board, its points are yours, if not it&apos;s a strike.
          Three strikes ends a board. Bank 50 points a board to win together.
        </p>
      )}

      {c && (
        <div className="likely__prompt">
          <span className="oddone__label">The question</span>
          <strong className="likely__text">{c.question}</strong>
        </div>
      )}

      {c && (
        <div className="brain-table__status">
          <span><strong>{c.score}</strong> points on this board</span>
          <BrainStrikes strikes={c.strikes} max={c.maxStrikes} />
        </div>
      )}
      {c && <BrainSlots slots={c.slots} />}

      {c?.last && <p className={`brain-table__last brain-table__last--${c.last.result}`} role="status">{c.last.line}</p>}

      {c && c.phase === "playing" && (
        <>
          {playing && (
            <form className="brain-table__answer" onSubmit={(e) => { e.preventDefault(); void send(); }}>
              <Input id="brain-table-answer" floatingLabel={c.myAnswer ? "Change your answer" : "Your answer"} value={text} maxLength={40} autoComplete="off" fullWidth onChange={(e) => setText(e.target.value)} />
              <Button type="submit" variant="primary" size="small" disabled={busy || !text.trim()}>{c.myAnswer ? "Change it" : "Send"}</Button>
            </form>
          )}
          {playing && c.myAnswer && <p className="party-muted">You said <strong>{c.myAnswer}</strong>. You can change it until everyone&apos;s in.</p>}
          <p className="party-muted">{c.answered.length} of {a.players.length} answered{waiting.length ? `. Waiting on ${waiting.map(seatName).join(", ")}.` : ". Everyone's in."}</p>
          {me.isHost && (
            <Button variant="secondary" size="small" disabled={busy || c.answered.length === 0} onClick={() => act({ action: "cb_lock" })}>
              Lock it in now
            </Button>
          )}
        </>
      )}

      {c && c.phase === "done" && (
        <p className="brain-table__verdict">{c.cleared ? `Board cleared for ${c.score} points!` : `Three strikes. The room banked ${c.score} on this board.`}</p>
      )}

      {me.isHost && betweenBoards && !gameDone && (
        <div className="party-row">
          <Button variant="primary" size="small" disabled={busy || a.players.length < 2} onClick={() => act({ action: "cb_board" })}>
            {c ? `Next board (${c.round + 1})` : "First board"}
          </Button>
          {a.history.length > 0 && <Button variant="secondary" size="small" disabled={busy} onClick={() => act({ action: "cb_finish" })}>Finish and score it</Button>}
        </div>
      )}
    </section>
  );
}
