"use client";

/**
 * The MMR card as a piece on the GameShuffle overlay (Layout editor ▸ Apps). It reads the
 * card's own live link, so it plays the same moments as the standalone OBS source.
 * Off by default (format.ts); the editor shows the made-up night instead.
 */

import type { CSSProperties } from "react";
import { DEFAULT_LOOK } from "@/lib/mmr/look";
import { MmrDemo, MmrLive } from "./MmrLive";
import "@/styles/mmr-card.css";

export function MmrOverlay({ token, sample, style }: { token?: string | null; sample?: boolean; style?: CSSProperties }) {
  return (
    <div className="mmr-overlay-piece" style={style}>
      <div style={{ width: 640 }}>
        {sample || !token ? <MmrDemo look={DEFAULT_LOOK} fit="obs" /> : <MmrLive token={token} initial={{ ok: false, reason: "no_card" }} fit="obs" />}
      </div>
    </div>
  );
}
