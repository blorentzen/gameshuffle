/**
 * PollOverlay — the live poll bar on the OBS overlay. Placement-aware: the
 * root takes a `style` from the Overlay Layout editor (anchor + scale), same
 * as the other overlay pieces. Shows the question + each option with a live
 * result bar; the overlay client feeds it fresh tallies every poll cycle.
 */

import { type CSSProperties } from "react";

export interface PollOverlayPayload {
  id: string;
  question: string;
  options: { id: string; label: string }[];
  tally: { total: number; byOption: Record<string, number> };
}

export function PollOverlay({ poll, style }: { poll: PollOverlayPayload; style?: CSSProperties }) {
  const total = poll.tally.total;
  const top = Math.max(0, ...poll.options.map((o) => poll.tally.byOption[o.id] ?? 0));
  return (
    <div className="gs-poll-overlay" style={style}>
      <div className="gs-poll-overlay__q">{poll.question}</div>
      <ul className="gs-poll-overlay__opts">
        {poll.options.map((o) => {
          const count = poll.tally.byOption[o.id] ?? 0;
          const pct = total ? Math.round((count / total) * 100) : 0;
          const leading = count > 0 && count === top;
          return (
            <li
              key={o.id}
              className={`gs-poll-overlay__opt${leading ? " gs-poll-overlay__opt--lead" : ""}`}
            >
              <span className="gs-poll-overlay__fill" style={{ width: `${pct}%` }} aria-hidden />
              <span className="gs-poll-overlay__label">{o.label}</span>
              <span className="gs-poll-overlay__pct">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
