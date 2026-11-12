"use client";

/**
 * The Level queue piece on the GameShuffle overlay (levels picks 2026-11-11, pick 19A; approved mockup): now playing
 * with its code and who sent it, then the next three, and how to join ("!add your course ID in chat"). Shows while
 * the queue is open or a level is being played. Off by default (format.ts); the Layout editor shows a sample.
 */

import type { CSSProperties } from "react";
import { addLine, LEVEL_GAMES } from "@/lib/levels/games";
import type { LevelQueueOverlayData } from "@/lib/levels/types";
import "@/styles/levels.css";

/** The Layout editor's sample (the mockup's made-up level, not a real course). */
const SAMPLE: LevelQueueOverlayData = {
  game: "super-mario-maker-2", open: true,
  now: { code: "7BK-QXN-4FG", from: "Sam", title: "Spin Jump Gauntlet" },
  next: ["Riley", "Kit", "Nova"], waiting: 3,
};

export function LevelQueueOverlay({ queue, sample, style }: { queue?: LevelQueueOverlayData | null; sample?: boolean; style?: CSSProperties }) {
  const q = sample ? SAMPLE : queue;
  if (!q) return null;
  return (
    <div className="lvq-piece" style={style}>
      <div className="lvq-piece__card">
        {q.now ? (
          <>
            <p className="lvq-piece__kicker">Now playing · from {q.now.from}</p>
            <p className="lvq-piece__code">{q.now.code}</p>
            {q.now.title && <p className="lvq-piece__title">{q.now.title}</p>}
          </>
        ) : (
          <>
            <p className="lvq-piece__kicker">Level queue · {LEVEL_GAMES[q.game].short}</p>
            <p className="lvq-piece__title">{q.waiting ? `${q.waiting} in line` : "Send yours in"}</p>
          </>
        )}
        {q.next.length > 0 && (
          <div className="lvq-piece__next">
            <p className="lvq-piece__kicker">Next</p>
            <p className="lvq-piece__names">{q.next.join(" · ")}{q.waiting > q.next.length ? ` +${q.waiting - q.next.length}` : ""}</p>
          </div>
        )}
        <p className="lvq-piece__join">{q.open ? addLine(q.game) : "The queue is closed"}</p>
      </div>
    </div>
  );
}
