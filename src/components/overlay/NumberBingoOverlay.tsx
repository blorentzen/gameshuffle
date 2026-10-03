/**
 * NumberBingoOverlay: Stream Bingo on the OBS overlay. The latest call big, the
 * 75-ball board with every called number lit, the pattern and prize, and a
 * winner banner when someone gets it. Placement-aware like the other pieces.
 */

import { type CSSProperties } from "react";
import { LETTERS, letterFor } from "@/lib/originals/bingo";

export interface NumberBingoOverlayPayload {
  status: "open" | "won" | "closed";
  patternLabel: string;
  called: number[];
  last: number | null;
  prizeTokens: number;
  prizeText: string | null;
  winnerName: string | null;
  players: number;
}

export function NumberBingoOverlay({ bingo, style }: { bingo: NumberBingoOverlayPayload; style?: CSSProperties }) {
  if (bingo.status === "closed") return null;
  const called = new Set(bingo.called);
  const prize = [bingo.prizeTokens ? `${bingo.prizeTokens} tokens` : null, bingo.prizeText].filter(Boolean).join(" + ");
  return (
    <div className={`gs-numbingo${bingo.status === "won" ? " is-won" : ""}`} style={style}>
      <div className="gs-numbingo__head">
        <span className="gs-numbingo__eyebrow">Bingo · {bingo.patternLabel}</span>
        <span className="gs-numbingo__players">{bingo.players} playing</span>
      </div>
      {bingo.status === "won" ? (
        <div className="gs-numbingo__winner">BINGO! {bingo.winnerName ?? "Someone"} wins</div>
      ) : (
        <div className="gs-numbingo__last" key={bingo.last ?? "none"}>
          {bingo.last !== null ? `${letterFor(bingo.last)} ${bingo.last}` : "Get a card"}
        </div>
      )}
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
      {prize && <div className="gs-numbingo__prize">Prize: {prize}</div>}
    </div>
  );
}
