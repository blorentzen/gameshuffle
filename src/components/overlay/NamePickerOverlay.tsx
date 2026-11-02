"use client";

/**
 * Name Picker overlay renderer (Streamer Tools Integration). Flashes entrant
 * names for a beat, then reveals the winner(s). Self-contained CSS;
 * format-agnostic (caller passes `style`).
 */

import { useEffect, useState, type CSSProperties } from "react";
import { IconTicket } from "@tabler/icons-react";

export interface NamePickerOverlayPayload {
  winners: string[];
  entries: number;
  sample: string[];
}

const SPIN_MS = 1800;

export function NamePickerOverlay({
  payload,
  style,
}: {
  payload: NamePickerOverlayPayload;
  style?: CSSProperties;
}) {
  const [spun, setPhase] = useState<"spinning" | "reveal">("spinning");
  // With nobody to spin through, it goes straight to the result.
  const phase = payload.sample.length ? spun : "reveal";
  const [current, setCurrent] = useState(payload.sample[0] ?? "…");

  useEffect(() => {
    if (!payload.sample.length) return;
    let i = 0;
    const spin = window.setInterval(() => {
      i = (i + 1) % payload.sample.length;
      setCurrent(payload.sample[i]);
    }, 90);
    const done = window.setTimeout(() => {
      window.clearInterval(spin);
      setPhase("reveal");
    }, SPIN_MS);
    return () => {
      window.clearInterval(spin);
      window.clearTimeout(done);
    };
  }, [payload.sample]);

  return (
    <div className="gs-overlay-namepick-pos" style={style}>
      <div className="gs-overlay-namepick">
        <div className="gs-overlay-namepick__title">
          <IconTicket size={18} stroke={2} aria-hidden />
          <span>Raffle{payload.entries ? ` · ${payload.entries} entered` : ""}</span>
        </div>
        {phase === "spinning" ? (
          <div className="gs-overlay-namepick__spinning">{current}</div>
        ) : (
          <div className="gs-overlay-namepick__reveal">
            <div className="gs-overlay-namepick__label">
              {payload.winners.length > 1 ? "Winners" : "Winner"}
            </div>
            {payload.winners.length ? (
              payload.winners.map((w, i) => (
                <div key={i} className="gs-overlay-namepick__winner">
                  {w}
                </div>
              ))
            ) : (
              <div className="gs-overlay-namepick__winner">No entries yet</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
