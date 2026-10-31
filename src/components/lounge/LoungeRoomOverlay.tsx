"use client";

/**
 * "Tonight's room" on the GameShuffle overlay (GS Pro, dashboard additions picks 2026-10-20):
 * the room the streamer last checked on /lounge, with their seed, likely finish and what 1st,
 * the break-even place and last pay. Off by default (format.ts); the editor shows a sample.
 */

import type { CSSProperties } from "react";
import { MMR_GAMES, placeWord } from "@/lib/mmr/rules";
import type { RoomOverlayData } from "@/lib/lounge/roomServer";
import "@/styles/lounge-room-piece.css";

const SAMPLE: RoomOverlayData = { game: "mkworld12p", name: "Sam", seed: 3, of: 12, likely: 6, breakEven: 6, pays: [{ place: 1, delta: 209 }, { place: 6, delta: 9 }, { place: 12, delta: -231 }], average: 7792 };
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

export function LoungeRoomOverlay({ room, sample, style }: { room?: RoomOverlayData | null; sample?: boolean; style?: CSSProperties }) {
  const r = sample ? SAMPLE : room;
  if (!r) return null;
  return (
    <div className="lounge-room-piece" style={style}>
      <div className="lounge-room-piece__card">
        <div className="lounge-room-piece__top"><span>Tonight&apos;s room · {MMR_GAMES[r.game].short}</span><span>{r.name}</span></div>
        <div className="lounge-room-piece__seed">{placeWord(r.seed)} of {r.of} by MMR · likely {placeWord(Math.round(r.likely))}</div>
        <div className="lounge-room-piece__pays">
          {r.pays.map((p) => (
            <div key={p.place}><small>{placeWord(p.place)}</small><b className={p.delta >= 0 ? "g" : "l"}>{signed(p.delta)}</b></div>
          ))}
        </div>
      </div>
    </div>
  );
}
