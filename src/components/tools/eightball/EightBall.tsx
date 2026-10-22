"use client";

/**
 * The Magic 8-Ball (item 14): one ball for the free page and the stream
 * overlay. The answer floats in the window; an answer too long for the
 * triangle (a streamer's own) shows under the ball instead.
 */

import type { CSSProperties, ReactNode } from "react";
import type { EightBallTone } from "@/data/eight-ball";

/** Longest answer that fits the window's triangle. */
const WINDOW_MAX = 30;

export interface EightBallAnswerView {
  text: string;
  tone: EightBallTone;
}

export function EightBall({ answer, shaking = false, onClick, label = "Shake the Magic 8-Ball", accent, className = "", caption }: {
  answer: EightBallAnswerView | null;
  shaking?: boolean;
  /** Makes the ball a button (the free page). */
  onClick?: () => void;
  label?: string;
  /** A color for answers without a tone (custom answers). */
  accent?: string | null;
  className?: string;
  /** Extra line under the ball (the overlay's question). */
  caption?: ReactNode;
}) {
  const shown = answer && !shaking ? answer : null;
  const long = !!shown && shown.text.length > WINDOW_MAX;
  const windowStyle = shown?.tone === "neutral" && accent ? ({ "--eight-accent": accent } as CSSProperties) : undefined;
  const face = shown ? (
    <span className="eight-ball__glass">
      <span className={`eight-ball__window eight-ball__window--${shown.tone}`} style={windowStyle}>
        <span className="eight-ball__answer">{long ? "Look below" : shown.text}</span>
      </span>
    </span>
  ) : (
    <span className="eight-ball__num" aria-hidden="true">8</span>
  );
  const ballClass = `eight-ball${shaking ? " is-shaking" : ""}`;
  return (
    <div className={`eight-ball-wrap${className ? ` ${className}` : ""}`}>
      {onClick ? (
        <button type="button" className={ballClass} onClick={onClick} aria-label={label}>{face}</button>
      ) : (
        <div className={ballClass}>{face}</div>
      )}
      {long && shown && <p className="eight-ball__long">{shown.text}</p>}
      {caption}
    </div>
  );
}
