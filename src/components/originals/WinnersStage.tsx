"use client";

/**
 * The 9:16 stage behind the morning winners video (/social/winners; Britton's
 * picks, 2026-10-16): yesterday's top 5 on each daily that had at least three
 * finishers, counted down from 5 to the crowned winner, then "Make today's
 * top 5". It's the hint videos' stage (social.css: the hero ground, glyph field
 * and logo, kept clear of the platforms' buttons), in each game's own colors:
 * the first game's ground, then each later game's layer fades in over it (the
 * Dex's warm, Fire Round's ember). Fire Round's rows show the score, right
 * answers and best streak in place of guess dots.
 *
 * Britton films it on his phone: the start screen copies the caption, then Play
 * hides it and the video runs once, full screen. `?paused=1` skips that screen
 * for the recorder, which adds `go` itself once `data-ready` is set (the
 * pictures have loaded). Every step is timed in CSS from `go`.
 */

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Button } from "@empac/cascadeds";
import { IconBolt, IconCopy, IconCrown, IconFlame, IconPlayerPlay, IconStopwatch, IconTrophy } from "@tabler/icons-react";
import { IconField } from "@/components/events/EventHeaderArt";
import { TypeTile } from "@/components/pokemon/TypeCard";
import { useToast } from "@/components/toast/ToastProvider";
import { formatTime } from "@/lib/originals/dailies";
import { WINNERS_INTRO, WINNERS_SECTION, rowDelay, winnersTimeline, type WinnerRow, type WinnersSection } from "@/lib/originals/winners";

const LOOK = { shuffle: "daily", dex: "dex", fire: "fire" } as const;

const vars = (o: Record<string, string>) => o as CSSProperties;

/** A steady color per name for players without a picture. */
function hueOf(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

function Row({ r, i, count, at, main, fire }: { r: WinnerRow; i: number; count: number; at: number; main: number; fire: boolean }) {
  const dots = fire ? [] : Array.from({ length: Math.max(main, r.guesses) }, (_, k) => (k < r.guesses - 1 ? "miss" : k === r.guesses - 1 ? (r.saved ? "save" : "win") : "open"));
  const first = r.place === 1;
  return (
    <li className={`winners-row winners-row--p${Math.min(r.place, 4)}${first ? " winners-row--first" : ""}`} style={vars({ "--at": `${(at + rowDelay(i, count)).toFixed(2)}s` })}>
      <span className="winners-row__place">
        {first && i === 0 && <IconCrown className="winners-row__crown" stroke={2} aria-hidden />}
        {r.place}
      </span>
      {r.avatar
        // eslint-disable-next-line @next/next/no-img-element
        ? <img className="winners-row__avatar" src={r.avatar} alt="" />
        : <span className="winners-row__avatar winners-row__avatar--initial" style={{ background: `hsl(${hueOf(r.name)} 58% 46%)` }} aria-hidden>{(r.name.match(/[A-Za-z0-9]/)?.[0] ?? "?").toUpperCase()}</span>}
      <span className="winners-row__who">
        <span className="winners-row__name">{r.name}</span>
        {fire ? (
          <span className="winners-row__fire">{r.guesses} right</span>
        ) : (
          <span className="winners-row__dots" role="img" aria-label={r.saved ? "Saved on the last chance" : `Got it in ${r.guesses}`}>
            {dots.map((d, k) => <span key={k} className={`winners-row__dot winners-row__dot--${d}`} />)}
          </span>
        )}
      </span>
      <span className="winners-row__stats">
        {fire && r.score != null && <span className="winners-row__score"><IconTrophy stroke={2} aria-hidden />{r.score.toLocaleString("en-US")}</span>}
        {r.seconds != null && <span><IconStopwatch stroke={2} aria-hidden />{formatTime(r.seconds)}</span>}
        {/* Fire Round: the round's best run of right answers (a bolt, since the flame is the day streak); the puzzles: the day streak. */}
        {fire
          ? r.bestStreak ? <span className="winners-row__streak" aria-label={`Best streak ${r.bestStreak}`}><IconBolt stroke={2} aria-hidden />{r.bestStreak}</span> : null
          : r.streak > 0 && <span className="winners-row__streak"><IconFlame stroke={2} aria-hidden />{r.streak}</span>}
      </span>
    </li>
  );
}

export function WinnersStage({ dateLabel, sections, caption, paused }: { dateLabel: string; sections: WinnersSection[]; caption: string; paused: boolean }) {
  const toast = useToast();
  const { sectionAt, endAt, total } = winnersTimeline(sections.length);
  const firstLook = LOOK[sections[0]?.game ?? "shuffle"];
  const pictures = useMemo(() => [
    ...sections.flatMap((s) => s.rows.map((r) => r.avatar).filter((a): a is string => !!a)),
    ...sections.map((s) => s.answer?.img).filter((a): a is string => !!a),
  ], [sections]);
  const [ready, setReady] = useState(pictures.length === 0);
  // Phone filming: the start screen, then the run, then the start screen again (Play again).
  const [phase, setPhase] = useState<"start" | "playing" | "done">("start");
  const [go, setGo] = useState(false);
  const [run, setRun] = useState(0);

  // The pictures load before anything moves, so frame one of a recording is complete.
  useEffect(() => {
    if (!pictures.length) return;
    let left = pictures.length;
    let alive = true;
    const done = () => { left -= 1; if (left <= 0 && alive) setReady(true); };
    const imgs = pictures.map((src) => { const im = new Image(); im.onload = done; im.onerror = done; im.src = src; return im; });
    const t = window.setTimeout(() => { if (alive) setReady(true); }, 6000);
    return () => { alive = false; window.clearTimeout(t); imgs.forEach((im) => { im.onload = null; im.onerror = null; }); };
  }, [pictures]);

  const play = () => {
    setPhase("playing");
    setGo(false);
    // A beat of the still ground first, so a recording can be trimmed cleanly.
    window.setTimeout(() => { setRun((n) => n + 1); setGo(true); }, 600);
  };
  useEffect(() => {
    if (phase !== "playing" || !go) return;
    const t = window.setTimeout(() => setPhase("done"), (total + 2.5) * 1000);
    return () => window.clearTimeout(t);
  }, [phase, go, total]);

  const copy = () => navigator.clipboard.writeText(caption).then(() => toast.success("Caption copied"), () => toast.error("Couldn't copy the caption"));

  if (!sections.length) {
    return (
      <main className="social-stage winners-stage browse-hero browse-hero--daily go">
        <IconField category="daily" seed="hero-daily" opacity={0.085} className="browse-hero__field" />
        <div className="winners-empty">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="social-stage__logo" src="/images/fg/logos/gameshuffle-wht.svg" alt="GameShuffle" />
          <p className="winners-empty__text">No winners video for {dateLabel}: each daily needs at least 3 people who solved it.</p>
        </div>
      </main>
    );
  }

  const timing = vars({ "--intro-len": `${WINNERS_INTRO}s`, "--section-len": `${WINNERS_SECTION}s`, "--end-at": `${endAt}s` });
  const hasFire = sections.some((s) => s.game === "fire");
  const going = paused ? undefined : go;

  return (
    <>
      <main
        key={run}
        className={`social-stage winners-stage browse-hero browse-hero--${firstLook}${going ? " go" : ""}`}
        style={timing}
        data-ready={ready ? "1" : undefined}
        data-total={total}
      >
        <IconField category={firstLook} seed={`hero-${firstLook}`} opacity={0.085} className="browse-hero__field" />
        {/* Each later game's ground fades in over the first for its part (stacked in order), and all of them out for the end card. */}
        {sections.slice(1).map((s, k) => (
          <div key={s.game} className="winners-warm" aria-hidden style={vars({ "--warm-in": `${sectionAt[k + 1]}s`, "--warm-out": `${endAt}s` })}>
            <div className={`winners-warm__in browse-hero browse-hero--${LOOK[s.game]}`}>
              <IconField category={LOOK[s.game]} seed={`hero-${LOOK[s.game]}`} opacity={0.085} className="browse-hero__field" />
            </div>
          </div>
        ))}

        <div className="winners-top">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="social-stage__logo winners-logo" src="/images/fg/logos/gameshuffle-wht.svg" alt="GameShuffle" />
        </div>

        <section className="winners-scene winners-scene--intro" style={vars({ "--at": "0s", "--len": `${WINNERS_INTRO}s` })}>
          <p className="social-stage__eyebrow winners-in" style={vars({ "--at": "0.2s" })}>The dailies</p>
          <h1 className="winners-big winners-in" style={vars({ "--at": "0.45s" })}>Yesterday&apos;s winners</h1>
          <p className="winners-date winners-in" style={vars({ "--at": "0.8s" })}>{dateLabel}</p>
        </section>

        {sections.map((s, si) => {
          const at = sectionAt[si];
          return (
            <section key={s.game} className={`winners-scene winners-scene--${s.game}`} style={vars({ "--at": `${at}s`, "--len": `${WINNERS_SECTION}s` })}>
              <p className="social-stage__eyebrow winners-in" style={vars({ "--at": `${(at + 0.1).toFixed(2)}s` })}>{s.title}{s.number >= 1 ? ` · #${s.number}` : ""}</p>
              {s.answer ? (
                <p className="winners-answer winners-in" style={vars({ "--at": `${(at + 0.5).toFixed(2)}s` })}>
                  {s.game === "dex"
                    ? <TypeTile types={s.answer.types ?? []} size="medium" />
                    // eslint-disable-next-line @next/next/no-img-element
                    : s.answer.img ? <img className="winners-answer__art" src={s.answer.img} alt="" /> : null}
                  <span>It was <strong>{s.answer.name}</strong></span>
                </p>
              ) : (
                <p className="winners-answer winners-answer--fire winners-in" style={vars({ "--at": `${(at + 0.5).toFixed(2)}s` })}>
                  <span className="winners-answer__tile" aria-hidden><IconFlame stroke={2} /></span>
                  <span><strong>60 seconds</strong> of trivia for everyone</span>
                </p>
              )}
              <ol className="winners-rows" aria-label={`${s.title} top ${s.rows.length}`}>
                {s.rows.map((r, i) => <Row key={`${r.place}-${i}`} r={r} i={i} count={s.rows.length} at={at} main={s.main} fire={s.game === "fire"} />)}
              </ol>
            </section>
          );
        })}

        <section className="winners-scene winners-scene--end" style={vars({ "--at": `${endAt}s` })}>
          <p className="winners-big winners-in" style={vars({ "--at": `${(endAt + 0.15).toFixed(2)}s` })}>Make today&apos;s top 5</p>
          <span className="social-stage__pill winners-in" style={vars({ "--at": `${(endAt + 0.5).toFixed(2)}s` })}>Play at gameshuffle.co/top5</span>
          <p className="social-stage__sub winners-in" style={vars({ "--at": `${(endAt + 0.8).toFixed(2)}s` })}>{hasFire ? "Free puzzles and trivia, new every day" : "Two free puzzles every day · new ones at midnight Pacific"}</p>
        </section>
      </main>

      {!paused && phase !== "playing" && (
        <div className="winners-start" role="dialog" aria-modal="true" aria-labelledby="winners-start-title">
          <div className="winners-start__card">
            <h2 id="winners-start-title" className="winners-start__title">{phase === "done" ? "That's the video" : "Yesterday's winners video"}</h2>
            <p className="winners-start__date">{dateLabel} · {Math.round(total)} seconds · {new Intl.ListFormat("en", { type: "conjunction" }).format(sections.map((s) => s.title.replace("The ", "")))}</p>
            <ol className="winners-start__steps">
              <li>Copy the caption for the post.</li>
              <li>Start your screen recording. In Safari, tap aA ▸ Hide Toolbar first for a clean frame.</li>
              <li>Tap Play: this screen goes away and the video runs once.</li>
            </ol>
            <div className="winners-start__actions">
              <Button variant="primary" iconBefore={IconPlayerPlay} onClick={play} disabled={!ready}>{!ready ? "Loading pictures…" : phase === "done" ? "Play again" : "Play"}</Button>
              <Button variant="secondary" iconBefore={IconCopy} onClick={() => void copy()}>Copy caption</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
