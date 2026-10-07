"use client";

/**
 * Party card overlay — a Chance card or mission dealt in a live party night,
 * shown on the streamer's OBS overlay. Helps are green, crutches amber,
 * missions blue. Self-contained CSS in overlay.css; format-agnostic (caller
 * passes the placement `style`).
 */

import type { CSSProperties } from "react";
import { IconCards, IconTarget } from "@tabler/icons-react";

export interface PartyCardOverlayPayload {
  kind: "help" | "crutch" | "mission" | "rule";
  title: string;
  text: string;
  player?: string | null;
  worth?: number | null;
  triggeredBy?: string | null;
}

const LABEL: Record<PartyCardOverlayPayload["kind"], string> = { help: "Help", crutch: "Crutch", mission: "Mission", rule: "House rule" };

export function PartyCardOverlay({ payload, style }: { payload: PartyCardOverlayPayload; style?: CSSProperties }) {
  const Icon = payload.kind === "mission" ? IconTarget : IconCards;
  return (
    <div className="gs-overlay-partycard-pos" style={style}>
      <div className={`gs-overlay-partycard gs-overlay-partycard--${payload.kind}`}>
        <div className="gs-overlay-partycard__label">
          <Icon size={18} stroke={1.9} /> {LABEL[payload.kind]}
          {payload.player ? <span className="gs-overlay-partycard__player">for {payload.player}</span> : null}
          {payload.worth ? <span className="gs-overlay-partycard__worth">{payload.worth} pt{payload.worth === 1 ? "" : "s"}</span> : null}
        </div>
        <div className="gs-overlay-partycard__title">{payload.title}</div>
        <div className="gs-overlay-partycard__text">{payload.text}</div>
      </div>
    </div>
  );
}
