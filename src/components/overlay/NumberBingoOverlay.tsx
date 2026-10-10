"use client";

/**
 * NumberBingoOverlay: Stream Bingo on the OBS overlay. While the doors are
 * open: "the hall is open", a countdown and where to grab a card. Then the
 * latest call big, the 75-ball board with every called number lit, the
 * pattern (drawn small when it has a shape) and prize, and a winner banner.
 * Placement-aware like the other pieces.
 */

import { useEffect, useState, type CSSProperties } from "react";
import { LETTERS, FREE_INDEX, letterFor } from "@/lib/originals/bingo";

export interface NumberBingoOverlayPayload {
  status: "open" | "won" | "closed";
  patternLabel: string;
  called: number[];
  last: number | null;
  prizeTokens: number;
  prizeText: string | null;
  winnerName: string | null;
  players: number;
  /** Squares to complete (null for "Any line"). */
  shape?: number[] | null;
  /** Sign-up window end (null = no window). */
  doorsCloseAt?: string | null;
}

/** The pattern drawn as a tiny 5×5, the free centre always filled. */
export function BingoShape({ cells, className = "" }: { cells: number[]; className?: string }) {
  const on = new Set([...cells, FREE_INDEX]);
  return (
    <span className={`bingo-shape ${className}`} aria-hidden="true">
      {Array.from({ length: 25 }, (_, i) => <span key={i} className={on.has(i) ? "is-on" : ""} />)}
    </span>
  );
}

function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function NumberBingoOverlay({ bingo, style }: { bingo: NumberBingoOverlayPayload; style?: CSSProperties }) {
  const closesAt = bingo.doorsCloseAt ? Date.parse(bingo.doorsCloseAt) : 0;
  const [now, setNow] = useState(() => Date.now());
  const doorsOpen = bingo.status === "open" && closesAt > now;
  useEffect(() => {
    if (!doorsOpen) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [doorsOpen]);

  if (bingo.status === "closed") return null;
  const called = new Set(bingo.called);
  const prize = [bingo.prizeTokens ? `${bingo.prizeTokens} tokens` : null, bingo.prizeText].filter(Boolean).join(" + ");
  return (
    <div className={`gs-numbingo${bingo.status === "won" ? " is-won" : ""}${doorsOpen ? " is-doors" : ""}`} style={style}>
      <div className="gs-numbingo__head">
        <span className="gs-numbingo__eyebrow">{doorsOpen ? "The bingo hall is open" : `Bingo · ${bingo.patternLabel}`}</span>
        <span className="gs-numbingo__players">{bingo.players} {doorsOpen ? (bingo.players === 1 ? "card" : "cards") : "playing"}</span>
      </div>
      {bingo.status === "won" ? (
        <div className="gs-numbingo__winner">BINGO! {bingo.winnerName ?? "Someone"} wins</div>
      ) : doorsOpen ? (
        <div className="gs-numbingo__doors">
          <span className="gs-numbingo__doors-label">Doors close in</span>
          <span className="gs-numbingo__last gs-numbingo__clock">{clock(closesAt - now)}</span>
          <span className="gs-numbingo__doors-how">Grab a card on the live page or type !bingocard</span>
        </div>
      ) : (
        <div className="gs-numbingo__last" key={bingo.last ?? "none"}>
          {bingo.last !== null ? `${letterFor(bingo.last)} ${bingo.last}` : "Calling starts now"}
        </div>
      )}
      {doorsOpen ? (
        <div className="gs-numbingo__goal">
          {bingo.shape && <BingoShape cells={bingo.shape} className="bingo-shape--overlay" />}
          <span>To win: <strong>{bingo.patternLabel}</strong></span>
        </div>
      ) : (
        <div className="gs-numbingo__board" aria-hidden="true">
          {LETTERS.map((l, r) => (
            <div key={l} className="gs-numbingo__row">
              <span className="gs-numbingo__letter">{l}</span>
              {Array.from({ length: 15 }, (_, i) => r * 15 + i + 1).map((n) => (
                <span key={n} className={`gs-numbingo__n${called.has(n) ? " is-called" : ""}${n === bingo.last ? " is-last" : ""}`}>{n}</span>
              ))}
            </div>
          ))}
        </div>
      )}
      {prize && <div className="gs-numbingo__prize">Prize: {prize}</div>}
    </div>
  );
}
