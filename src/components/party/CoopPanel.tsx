"use client";

/**
 * A co-op game on a phone inside a live night: Boss Fight, Five Letters, Four
 * in a Row or Shuffle Dice, with everyone at the table on one side
 * (src/lib/party/coop.ts). The round plays here with the same controls as
 * the live page's break card (BreakRoundPlay); the TV shows the board big.
 * A round plays the moment everyone has answered, or when the host plays it.
 */

import { Alert, Badge, Button } from "@empac/cascadeds";
import { BreakRoundPlay } from "@/components/break/BreakRoundPlay";
import type { BreakReveal, BreakRound } from "@/lib/break/types";
import { isCoopGame, type CoopGameId, type CoopRecord, type CoopResult, type CoopResultKind } from "@/lib/coop/rules";
import "@/styles/coop.css";

export interface CoopActivityView {
  slug: CoopGameId;
  label: string;
  ready: boolean;
  players: number[];
  /** Games suggested for this slot. */
  totalRounds: number;
  game: { name: string; noun: string; nouns: string; how: string; roundWord: string; maxRounds: number };
  current: null | {
    /** This game's number in the slot. */
    round: number;
    /** Rounds this game has opened. */
    turn: number;
    phase: "open" | "done";
    view: BreakRound;
    /** The last round's reveal (the final one once done). */
    last: BreakReveal | null;
    answered: number[];
    /** This seat's answer to the open round. */
    mine: string | null;
    outcome: CoopResult | null;
  };
  results: CoopResult[];
  record: CoopRecord;
}

/** Whether a night's activity view is one of the co-op games. */
export function isCoopView(a: { slug: string }): a is CoopActivityView {
  return isCoopGame(a.slug);
}

const LABEL: Record<CoopResultKind, string> = { won: "Won", lost: "Lost", draw: "Draw" };
const BADGE: Record<CoopResultKind, "success" | "error" | "default"> = { won: "success", lost: "error", draw: "default" };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function CoopPanel({ activity: a, me, busy, act, gameDone }: {
  activity: CoopActivityView;
  me: { isHost: boolean; seat: number | null };
  busy: boolean;
  act: (body: Record<string, unknown>) => Promise<unknown>;
  gameDone: boolean;
}) {
  if (!a.ready) return <Alert variant="info" title={`${a.game.name} is almost here`}>It needs a database update before it can run in a live night.</Alert>;
  const c = a.current;
  const playing = me.seat !== null && a.players.includes(me.seat);
  const open = c?.phase === "open";
  const answer = async (text: string) => !!(await act({ action: "co_answer", text }));
  const noun = a.game.noun;

  return (
    <section className="party-section oddone coop-panel">
      <div className="oddone__head">
        <h3 className="party-h3">{a.game.name}</h3>
        <span className="party-muted">{c ? `${cap(noun)} ${c.round} of ${Math.max(c.round, a.totalRounds)}` : `${a.totalRounds} ${a.totalRounds === 1 ? noun : a.game.nouns} suggested`}</span>
      </div>

      {!c && <p className="party-muted">{a.game.how} Everyone at the table is on the same side and plays on their own phone. The board shows on the TV.</p>}

      {c && open && c.last && <p className="coop-panel__last"><span className="oddone__label">Last round</span> {c.last.text}</p>}

      {c && (
        <div className="live-break coop-panel__round">
          <BreakRoundPlay
            round={c.view}
            reveal={c.phase === "done" ? c.last : null}
            open={open && playing}
            mine={c.mine}
            found={null}
            answering={c.answered.length}
            roundKey={`${c.round}:${c.turn}`}
            now={0}
            onAnswer={answer}
            meta={c.phase === "done" || c.view.prompt.includes(`${a.game.roundWord} ${c.turn}`) ? null : `${a.game.roundWord} ${c.turn} of ${a.game.maxRounds}`}
            inputId="coop-answer"
            team="You"
          />
        </div>
      )}

      {c && c.view.layout === "connect" && <p className="party-muted">Your pieces are yellow, GameShuffle&apos;s are red.</p>}
      {c && open && (
        <p className="party-muted">
          {c.answered.length} of {a.players.length} answered. {playing ? "The round plays once everyone has." : "Take a seat to play."}
        </p>
      )}

      {c && c.phase === "done" && c.outcome && (
        <div className={`coop-outcome is-${c.outcome.result}`} role="status">
          <Badge variant={BADGE[c.outcome.result]} size="small">{LABEL[c.outcome.result]}</Badge> {c.outcome.line}
        </div>
      )}

      {a.results.length > 1 && (
        <div>
          <p className="party-options__label">Tonight&apos;s {a.game.nouns}: {a.record.won} won, {a.record.lost} lost{a.record.draw ? `, ${a.record.draw} drawn` : ""}</p>
          <ol className="coop-results">
            {a.results.map((r, i) => (
              <li key={i} className="coop-results__row"><Badge variant={BADGE[r.result]} size="small">{LABEL[r.result]}</Badge><span>{r.line}</span></li>
            ))}
          </ol>
        </div>
      )}

      {me.isHost && !gameDone && (
        <div className="party-row">
          {open && <Button variant="secondary" size="small" disabled={busy} onClick={() => act({ action: "co_close" })}>Play this round now</Button>}
          {!open && (
            <Button variant={c ? "secondary" : "primary"} size="small" disabled={busy || !a.players.length} onClick={() => act({ action: "co_start" })}>
              {c ? `Play another ${noun}` : `Start ${a.game.name}`}
            </Button>
          )}
          {!open && a.results.length > 0 && <Button variant="primary" size="small" disabled={busy} onClick={() => act({ action: "co_finish" })}>Finish and score it</Button>}
        </div>
      )}
    </section>
  );
}
