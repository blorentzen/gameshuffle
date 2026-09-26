"use client";

/**
 * Oracle overlay renderer (Streamer Tools Integration) — the shared answer card
 * for Magic 8-Ball, Yes/No, and Truth or Dare. Tone drives the accent color.
 * Self-contained CSS; format-agnostic (caller passes `style`).
 */

import type { ComponentType } from "react";
import type { CSSProperties } from "react";
import { resolveOverlayAccent } from "@/lib/overlay/accent";
import { IconBallBowling, IconFlame, IconHelpCircle, IconMessageCircle } from "@tabler/icons-react";

export interface OracleOverlayPayload {
  kind: "eightball" | "yesno" | "truth" | "dare";
  title: string;
  prompt?: string | null;
  answer: string;
  tone?: "yes" | "no" | "maybe" | "neutral";
  accentColor?: string | null;
  triggeredBy?: string | null;
}

const ICON: Record<OracleOverlayPayload["kind"], ComponentType<{ size?: number | string; stroke?: number }>> = {
  eightball: IconBallBowling,
  yesno: IconHelpCircle,
  truth: IconMessageCircle,
  dare: IconFlame,
};

export function OracleOverlay({
  payload,
  style,
}: {
  payload: OracleOverlayPayload;
  style?: CSSProperties;
}) {
  const tone = payload.tone ?? "neutral";
  // The accent only skins the neutral tone (yes/no/maybe keep their semantic
  // green/red/amber). Neutral defaults to the brand theme unless overridden.
  const cardStyle =
    tone === "neutral"
      ? ({ "--oracle-accent": resolveOverlayAccent(payload.accentColor) } as CSSProperties)
      : undefined;
  // Outer wrapper carries the placement transform; the inner card animates —
  // keeping the two transforms from clobbering each other.
  return (
    <div className="gs-overlay-oracle-pos" style={style}>
      <div className={`gs-overlay-oracle gs-overlay-oracle--${tone}`} style={cardStyle}>
        <div className="gs-overlay-oracle__title">
          {(() => {
            const Glyph = ICON[payload.kind];
            return <Glyph size={18} stroke={1.9} />;
          })()} {payload.title}
        </div>
        {payload.prompt ? (
          <div className="gs-overlay-oracle__prompt">“{payload.prompt}”</div>
        ) : null}
        <div className="gs-overlay-oracle__answer">{payload.answer}</div>
      </div>
    </div>
  );
}
