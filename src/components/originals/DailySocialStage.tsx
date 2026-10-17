"use client";

/**
 * The 9:16 stage behind the Daily's social videos (/social/daily). The site's
 * own hero ground (indigo glow, two auroras, the Originals glyph field) with
 * the logo, today's first hint rolling up a line at a time, and the way to
 * play. Everything moves in CSS (social.css), timed from the moment the root
 * gets `go`: straight away when you open the page, or when the recorder says
 * so (?paused=1), so frame one of a recording is the first frame of motion.
 *
 * The hint is measured in a hidden copy first, so each line rolls up as the
 * line it really wraps to at this size. `data-ready` tells the recorder the
 * lines are set.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { IconField } from "@/components/events/EventHeaderArt";

/** Seconds: when the first hint line starts, and the gap between lines. */
const LINES_AT = 2.0;
const LINE_GAP = 0.42;

/** What changes between the games: each keeps its own colors, glyphs and link (as on its share image). */
const GAMES = {
  shuffle: { accent: "daily", field: "daily", title: "The Daily Shuffle", noun: "character", link: "gameshuffle.co/daily" },
  dex: { accent: "dex", field: "dex", title: "The Daily Dex", noun: "Pokémon", link: "gameshuffle.co/daily-dex" },
} as const;

export function DailySocialStage({ game = "shuffle", number, hint, guesses, paused }: { game?: keyof typeof GAMES; number: number; hint: string; guesses: number; paused: boolean }) {
  const g = GAMES[game];
  const measureRef = useRef<HTMLParagraphElement>(null);
  const [lines, setLines] = useState<string[] | null>(null);

  useEffect(() => {
    let alive = true;
    const measure = () => {
      const el = measureRef.current;
      if (!el || !alive) return;
      el.textContent = "";
      const spans = hint.split(" ").map((w) => { const s = document.createElement("span"); s.textContent = `${w} `; el.append(s); return s; });
      const out: string[] = [];
      let top: number | null = null;
      for (const s of spans) {
        if (top === null || s.offsetTop > top + 2) { out.push(""); top = s.offsetTop; }
        out[out.length - 1] += s.textContent;
      }
      el.textContent = "";
      setLines(out.map((l) => l.trim()));
    };
    void document.fonts.ready.then(measure);
    return () => { alive = false; };
  }, [hint]);

  const shown = lines ?? [hint];
  const askAt = LINES_AT + LINE_GAP * shown.length + 1.0;
  const timing = { "--ask-at": `${askAt}s`, "--cta-at": `${askAt + 1.1}s` } as CSSProperties;

  return (
    <main
      className={`social-stage browse-hero browse-hero--${g.accent}${paused ? "" : " go"}`}
      style={timing}
      data-ready={lines ? "1" : undefined}
    >
      <IconField category={g.field} seed={`hero-${g.field}`} opacity={0.085} className="browse-hero__field" />
      <div className="social-stage__top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="social-stage__logo" src="/images/fg/logos/gameshuffle-wht.svg" alt="GameShuffle" />
        <p className="social-stage__eyebrow">{g.title} · #{number}</p>
      </div>
      <div className="social-stage__mid">
        <p className="social-stage__label">Today&apos;s first hint</p>
        <p className="social-stage__hint" aria-label={hint}>
          {shown.map((line, i) => (
            <span key={`${i}-${line}`} className="social-stage__line" aria-hidden>
              <span style={{ animationDelay: `${LINES_AT + LINE_GAP * i}s` }}>{line}</span>
            </span>
          ))}
        </p>
        <p ref={measureRef} className="social-stage__hint social-stage__measure" aria-hidden />
        <p className="social-stage__ask">Can you name today&apos;s {g.noun}?</p>
      </div>
      <div className="social-stage__cta">
        <span className="social-stage__pill">Play at {g.link}</span>
        <p className="social-stage__sub">{guesses} guesses · a new hint after every miss</p>
      </div>
    </main>
  );
}
