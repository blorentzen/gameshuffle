"use client";

/**
 * A co-op game on a live night's TV (PartyTvView): the boss and its health,
 * the letter grid with its keyboard, the Four in a Row board or the Shuffle
 * Dice table, big enough to read from the couch, with who has answered and
 * how the last round went. Never anyone's answer: the TV asks for the public
 * view.
 */

import { BossBar, ConnectBoard, DiceTable, LetterGrid } from "@/components/overlay/BreakScreenOverlay";
import type { CoopActivityView } from "@/components/party/CoopPanel";
import "@/styles/coop.css";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function CoopTv({ a, name }: { a: CoopActivityView; name: (seat: number) => string }) {
  const c = a.current;
  if (!c) {
    return (
      <>
        <p className="party-tv__big">{a.game.name}</p>
        <p className="bgn-display__meta">{a.game.how} Everyone plays on their phone, all on the same side.</p>
        <p className="bgn-display__foot">Waiting for the host to start.</p>
      </>
    );
  }
  const r = c.view;
  const rv = c.phase === "done" ? c.last : null;
  return (
    <>
      <p className="bgn-display__eyebrow">{cap(a.game.noun)} {c.round}{r.prompt.includes(`${a.game.roundWord} ${c.turn}`) ? "" : ` · ${a.game.roundWord} ${c.turn} of ${a.game.maxRounds}`}</p>
      <p className="party-tv__big">{c.phase === "done" && c.outcome ? c.outcome.line : r.prompt}</p>
      <div className="coop-tv">
        {r.layout === "boss" && <BossBar className="coop-tv__boss" boss={rv?.boss ?? r.boss} />}
        {r.layout === "letters" && (
          <>
            <p className="bgn-display__meta">Clue: <strong>{r.category}</strong></p>
            <LetterGrid className="coop-tv__letters" rows={rv?.rows ?? r.rows} maxRows={r.maxRows} keys />
          </>
        )}
        {r.layout === "connect" && (
          <>
            <ConnectBoard className="coop-tv__c4" board={rv?.board ?? r.board} last={rv ? null : r.last} win={rv?.winLine} />
            <p className="bgn-display__foot">Yellow is the table, red is GameShuffle.</p>
          </>
        )}
        {r.layout === "shuffle" && <DiceTable t={rv?.table ?? r.table} base="coop-tv" team="You" />}
      </div>
      {c.last && <p className="bgn-display__meta">{c.last.text}</p>}
      {c.phase === "open" && (
        <>
          <div className="party-tv__voters">
            {a.players.map((s) => <span key={s} className={`party-tv__voter${c.answered.includes(s) ? " party-tv__voter--in" : ""}`}>{name(s)}</span>)}
          </div>
          <p className="bgn-display__foot">{c.answered.length} of {a.players.length} answered</p>
        </>
      )}
      {a.results.length > 0 && (
        <p className="bgn-display__foot">Tonight: {a.record.won} won, {a.record.lost} lost{a.record.draw ? `, ${a.record.draw} drawn` : ""}</p>
      )}
    </>
  );
}
