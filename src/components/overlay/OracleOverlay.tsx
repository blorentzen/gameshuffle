"use client";

/**
 * Oracle overlay renderer (Streamer Tools Integration). The Magic 8-Ball is
 * the same ball as the free page (EightBall), answer in the window, with the
 * streamer's own answers; Yes/No and Truth or Dare are the answer card. Tone
 * drives the accent color. Format-agnostic (caller passes `style`).
 */

import type { ComponentType } from "react";
import type { CSSProperties } from "react";
import { resolveOverlayAccent } from "@/lib/overlay/accent";
import { EightBall } from "@/components/tools/eightball/EightBall";
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
  if (payload.kind === "eightball") {
    return (
      <div className="gs-overlay-oracle-pos" style={style}>
        <div className="gs-overlay-eight">
          <EightBall
            answer={{ text: payload.answer, tone }}
            accent={resolveOverlayAccent(payload.accentColor)}
            caption={payload.prompt ? <p className="gs-overlay-eight__prompt">“{payload.prompt}”</p> : null}
          />
        </div>
      </div>
    );
  }
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
