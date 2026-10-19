"use client";

/**
 * The Daily before the first guess (Britton's pick, 2026-10-14): two lanes of
 * the puzzle's characters drifting past (one on phones), so the page isn't an
 * empty white space, and three steps on how to play inside the Start card. The
 * lanes step aside once you've guessed; the steps live on in How it works.
 *
 * The lanes are decoration (hidden from screen readers) and are shuffled on
 * each visit in the browser, never on the server: every character takes a
 * turn, so the parade can't hint at the answer. With reduced motion turned on
 * they hold still (randomizer.css).
 */

import { useEffect, useState, type ComponentType } from "react";
import { IconBulb, IconColorSwatch, IconSearch } from "@tabler/icons-react";

/** Characters per lane: enough to fill a wide screen, few enough to load quickly. */
const PER_LANE = 16;

export function DailyParade({ characters, art }: { characters: { name: string; img: string }[]; art: (src: string) => string }) {
  // Shuffled in the browser after the first paint, so the server and the page agree.
  const [lanes, setLanes] = useState<{ name: string; img: string }[][] | null>(null);
  useEffect(() => {
    const list = characters.filter((c) => c.img);
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    void Promise.resolve().then(() => setLanes([list.slice(0, PER_LANE), list.slice(PER_LANE, PER_LANE * 2)]));
  }, [characters]);
  if (!lanes) return <div className="daily-parade" aria-hidden />;
  return (
    <div className="daily-parade" aria-hidden>
      {lanes.map((lane, i) => (
        <div key={i} className={`daily-parade__lane${i === 1 ? " daily-parade__lane--back" : ""}`}>
          {/* Three times over, so a wide screen never sees the end and the loop has no seam. */}
          {[...lane, ...lane, ...lane].map((c, j) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={`${c.name}-${j}`} src={art(c.img)} alt="" loading="lazy" decoding="async" />
          ))}
        </div>
      ))}
    </div>
  );
}

type TablerIcon = ComponentType<{ size?: number | string; stroke?: number }>;

/**
 * How to play, as three short lines inside the Start card (Britton's pick,
 * 2026-10-19: as three cards they took half a phone screen). The icon tiles
 * keep the site's gradient.
 */
export function DailySteps({ steps }: { steps: { title: string; text: string; icon: "hint" | "guess" | "colors" }[] }) {
  const icons: Record<string, TablerIcon> = { hint: IconBulb, guess: IconSearch, colors: IconColorSwatch };
  return (
    <ul className="daily-steps" aria-label="How to play">
      {steps.map((s) => {
        const Icon = icons[s.icon];
        return (
          <li key={s.title} className="daily-step">
            <span className="daily-step__icon" aria-hidden><Icon size={16} stroke={2} /></span>
            <p className="daily-step__text"><strong>{s.title}.</strong> {s.text}</p>
          </li>
        );
      })}
    </ul>
  );
}
