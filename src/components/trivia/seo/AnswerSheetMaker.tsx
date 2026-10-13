"use client";

/**
 * Printable trivia answer sheet: pick the rounds and questions, add the night's
 * name, print. Print styles show only the sheet. Nothing is saved or sent.
 */

import { useRef, useState } from "react";
import { Button, Input, Switch } from "@empac/cascadeds";
import { Select } from "@/components/ui/Select";
import { EVENTS, track } from "@/lib/analytics/events";

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** `joinQr`/`code`: a real night's sheet (from a league's Nights tab) carries a QR code to answer on a phone. */
export function AnswerSheetMaker({ initialTitle = "", code = null, joinQr = null }: { initialTitle?: string; code?: string | null; joinQr?: string | null }) {
  const [title, setTitle] = useState(initialTitle);
  const [rounds, setRounds] = useState(5);
  const [perRound, setPerRound] = useState(8);
  const [wager, setWager] = useState(true);
  const [tiebreak, setTiebreak] = useState(true);
  const used = useRef(false);

  const print = () => {
    if (!used.current) { used.current = true; track(EVENTS.toolUsed, { tool: "trivia-answer-sheet" }); }
    window.print();
  };

  return (
    <div className="answer-maker">
      <div className="answer-maker__controls">
        <Input fullWidth floatingLabel="Night name (optional)" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
        <div className="answer-maker__row">
          <Select floatingLabel="Rounds" value={String(rounds)} onChange={(v) => setRounds(Number(v))} options={range(1, 10).map((n) => ({ value: String(n), label: String(n) }))} />
          <Select floatingLabel="Questions a round" value={String(perRound)} onChange={(v) => setPerRound(Number(v))} options={range(4, 15).map((n) => ({ value: String(n), label: String(n) }))} />
        </div>
        <div className="answer-maker__row">
          <Switch checked={wager} onChange={(e) => setWager(e.target.checked)} label="Final wager" />
          <Switch checked={tiebreak} onChange={(e) => setTiebreak(e.target.checked)} label="Tiebreaker" />
        </div>
        <Button variant="primary" onClick={print}>Print sheets</Button>
        <p className="answer-maker__hint">Print as many as you have teams. Fits one page for up to about 6 rounds of 8; longer nights run onto a second page.</p>
      </div>

      <div className="answer-sheet" aria-label="Answer sheet preview">
        <div className="answer-sheet__head">
          <div className="answer-sheet__title">{title.trim() || "Trivia night"}</div>
          {joinQr && <div className="answer-sheet__qr" role="img" aria-label="QR code to answer on a phone" dangerouslySetInnerHTML={{ __html: joinQr }} />}
          <div className="answer-sheet__line">Team name</div>
          <div className="answer-sheet__total">Total<span /></div>
        </div>
        <div className="answer-sheet__rounds">
          {range(1, rounds).map((r) => (
            <div key={r} className="answer-sheet__round">
              <div className="answer-sheet__round-head"><span>Round {r}</span><span className="answer-sheet__score">Score <span /></span></div>
              <ol>
                {range(1, perRound).map((q) => <li key={q}><span className="answer-sheet__blank" /></li>)}
              </ol>
            </div>
          ))}
        </div>
        {(wager || tiebreak) && (
          <div className="answer-sheet__extras">
            {wager && <div className="answer-sheet__extra"><strong>Final wager</strong><span>Points bet <span className="answer-sheet__blank answer-sheet__blank--short" /></span><span>Answer <span className="answer-sheet__blank" /></span></div>}
            {tiebreak && <div className="answer-sheet__extra"><strong>Tiebreaker</strong><span>Closest number wins <span className="answer-sheet__blank" /></span></div>}
          </div>
        )}
        <div className="answer-sheet__foot">{code ? `Scan to answer on a phone instead · gameshuffle.co/trivia/play/${code}` : "gameshuffle.co/trivia"}</div>
      </div>
    </div>
  );
}
