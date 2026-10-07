"use client";

import { useState } from "react";
import { Icon, IconButton } from "@empac/cascadeds";

/**
 * Rows of box art drifting sideways forever: a decorative "look how many games"
 * band that takes one screen instead of a long grid.
 *
 * Custom, flagged: CDS `Carousel` pages through slides and has no continuous
 * marquee mode. Raise it with CascadeDS; until then this stays small. Each row
 * renders its covers twice and slides by exactly one copy, so the loop is
 * seamless; the second copy is hidden from screen readers.
 *
 * Accessibility: moving content needs a way to stop it (WCAG 2.2.2), so there
 * is a pause button, rows also pause while hovered or focused, and with
 * reduced motion the rows sit still and scroll by hand instead.
 */
export interface MarqueeGame { slug: string; name: string; art: string }
export interface MarqueeRow { label: string; tone?: "live" | "soon"; games: MarqueeGame[] }

export function CoverMarquee({ rows }: { rows: MarqueeRow[] }) {
  const [paused, setPaused] = useState(false);
  return (
    <div className={`cover-marquee${paused ? " is-paused" : ""}`}>
      {rows.map((row, r) => (
        <div key={row.label} className="cover-marquee__row" style={{ "--n": row.games.length, "--dir": r % 2 ? "reverse" : "normal" } as React.CSSProperties}>
          <span className={`cover-marquee__label cover-marquee__label--${row.tone ?? "live"}`}>{row.label}</span>
          <div className="cover-marquee__viewport">
            <ul className="cover-marquee__track" aria-label={`${row.label}: ${row.games.map((g) => g.name).join(", ")}`}>
              {[0, 1].map((copy) => row.games.map((g) => (
                <li key={`${copy}-${g.slug}`} aria-hidden={copy === 1 || undefined}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- local 300x400 box art */}
                  <img src={g.art} alt={copy === 0 ? g.name : ""} width={300} height={400} loading="lazy" title={g.name} />
                </li>
              )))}
            </ul>
          </div>
        </div>
      ))}
      <div className="cover-marquee__controls">
        <IconButton
          aria-label={paused ? "Play the game covers" : "Pause the game covers"}
          variant="secondary"
          size="small"
          onClick={() => setPaused((p) => !p)}
        >
          <Icon name={paused ? "player-play" : "player-pause"} size="16" aria-hidden />
        </IconButton>
      </div>
    </div>
  );
}
