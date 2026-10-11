"use client";

/**
 * ChatBrainOverlay: a Chat Brain game on the OBS overlay (Chat plays). The
 * question, the board filling in, three strike marks, the guess countdown,
 * what chat is leaning toward, a short reveal or strike moment after each
 * guess, and the top play-along viewers. Placement-aware like the other
 * overlay pieces. Text only.
 */

import { useEffect, useState, type CSSProperties } from "react";
import type { StreamGameView } from "@/lib/chatbrain/streamGame";

const FLASH_MS = 4500;

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const iv = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(iv);
  }, [active]);
  return now;
}

const secsUntil = (iso: string, now: number) => Math.max(0, Math.ceil((Date.parse(iso) - now) / 1000));

export function ChatBrainOverlay({ game, style }: { game: StreamGameView; style?: CSSProperties }) {
  const now = useNow(game.status === "playing");
  const w = game.window;
  const flash = game.last && now - Date.parse(game.last.at) < FLASH_MS ? game.last : null;

  let status: string;
  if (game.phase === "done") status = `Final score: ${game.score} points`;
  else if (game.phase === "board_done") status = game.boardIndex + 1 < game.boardCount ? "Board over. Next board coming up" : "Board over";
  else if (game.phase === "guessing" && w) status = `Answer with !a  ·  ${secsUntil(w.closesAt, now)}s`;
  else if (w) status = game.phase === "starting" ? `Get ready: first guess in ${secsUntil(w.opensAt, now)}s` : `Next guess in ${secsUntil(w.opensAt, now)}s`;
  else status = "";

  return (
    <div className="gs-brain" style={style}>
      <div className="gs-brain__head">
        <span>Chat Brain{game.boardCount > 1 ? ` · Board ${game.boardIndex + 1} of ${game.boardCount}` : ""}</span>
        <span className="gs-brain__score">{game.score} pts</span>
      </div>
      <div className="gs-brain__q">{game.question}</div>
      {/* Two columns read down like the TV board (1-4 left, 5-8 right), split evenly for shorter boards. */}
      <ol className="gs-brain__board" style={{ gridTemplateRows: `repeat(${Math.max(1, Math.ceil(game.slots.length / 2))}, auto)` }}>
        {game.slots.map((s) => (
          <li key={s.rank} className={`gs-brain__slot${s.label ? (s.found ? " is-found" : " is-revealed") : ""}${flash?.rank === s.rank ? " is-new" : ""}`}>
            <span className="gs-brain__rank">{s.rank}</span>
            <span className="gs-brain__label">{s.label ?? ""}</span>
            <span className="gs-brain__pts">{s.points ?? ""}</span>
          </li>
        ))}
      </ol>
      <div className="gs-brain__status">
        <span className="gs-brain__strikes" aria-label={`${game.strikes} of 3 strikes`}>
          {[0, 1, 2].map((i) => <span key={i} className={i < game.strikes ? "is-on" : ""}>✕</span>)}
        </span>
        <span className="gs-brain__clock">{status}</span>
      </div>
      {game.phase === "guessing" && game.leaning.length > 0 && (
        <div className="gs-brain__lean">Chat is leaning: {game.leaning.map((l) => `${l.label} ${Math.round(l.share * 100)}%`).join("  ·  ")}</div>
      )}
      {flash && (
        <div className={`gs-brain__flash gs-brain__flash--${flash.result === "hit" ? "hit" : "miss"}`}>
          {flash.result === "hit"
            ? <>{flash.label}{flash.rank ? <small>#{flash.rank}</small> : null}</>
            : flash.result === "empty" ? <>✕ No answers</> : <>✕ {flash.label}{flash.already ? <small>already up</small> : null}</>}
        </div>
      )}
      {game.playalong.length > 0 && (
        <div className="gs-brain__top">Top brains: {game.playalong.slice(0, 3).map((p) => `${p.name} ${p.points}`).join("  ·  ")}</div>
      )}
    </div>
  );
}
