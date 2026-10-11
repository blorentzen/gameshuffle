"use client";

/**
 * BreakScreenOverlay: break mode on the OBS overlay. The streamer's away
 * line and "back in about…", then the phase: what's next (intro), the round
 * with its countdown and how to answer (open), the answer, the split and
 * who scored (reveal), the standings between games, and the champion when
 * the streamer's back. Leaders for this break down the side.
 *
 * A placeable piece by default; `full` covers the whole canvas for streamers
 * without a BRB scene of their own (Streaming ▸ Live games ▸ Break mode).
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { IconBomb, IconCoin, IconMushroom, IconShield, IconStar } from "@tabler/icons-react";
import type { BreakOption, BreakView, DiceFace, ShuffleTable } from "@/lib/break/types";

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const iv = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(iv);
  }, [active]);
  return now;
}

const secsUntil = (iso: string | null, now: number) => (iso ? Math.max(0, Math.ceil((Date.parse(iso) - now) / 1000)) : 0);

function backLine(view: BreakView, now: number): string {
  if (view.status === "ended") return "Back now";
  if (view.endingRequested) return "Wrapping up";
  if (!view.backBy) return "Back soon";
  const mins = Math.ceil((Date.parse(view.backBy) - now) / 60_000);
  return mins > 1 ? `Back in about ${mins} min` : "Back any minute";
}

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

export function Die({ value, small = false }: { value: number | null; small?: boolean }) {
  return (
    <span className={`gs-break__die${small ? " is-small" : ""}`} aria-label={value ? `a ${value}` : "not rolled yet"}>
      {value
        ? Array.from({ length: 9 }, (_, i) => <i key={i} className={PIPS[value]?.includes(i) ? "on" : ""} />)
        : <b>?</b>}
    </span>
  );
}

/** Shuffle Dice faces, drawn like the one-device tool (a shield for the Shell). */
const FACE: Record<DiceFace, { label: string; icon: ReactNode }> = {
  star: { label: "Star", icon: <IconStar size={26} stroke={2.2} /> },
  coin: { label: "Coin", icon: <IconCoin size={26} stroke={2.2} /> },
  mushroom: { label: "Mushroom", icon: <IconMushroom size={26} stroke={2.2} /> },
  shell: { label: "Shell", icon: <IconShield size={26} stroke={2.2} /> },
  bomb: { label: "Bomb", icon: <IconBomb size={26} stroke={2.2} /> },
};

function Faces({ faces, small = false }: { faces: DiceFace[]; small?: boolean }) {
  if (!faces.length) return <span className="gs-break__none">None</span>;
  return (
    <span className={`gs-break__faces${small ? " is-small" : ""}`}>
      {faces.map((f, i) => <span key={i} className={`gs-break__face is-${f}`} title={FACE[f].label} aria-label={FACE[f].label}>{FACE[f].icon}</span>)}
    </span>
  );
}

function Table({ t }: { t: ShuffleTable }) {
  return (
    <div className="gs-break__table">
      <div className="gs-break__table-row"><span>This roll</span><Faces faces={t.roll} /></div>
      <div className="gs-break__table-row"><span>Kept</span><Faces faces={t.kept} small /></div>
      <div className="gs-break__table-row">
        <span>Bombs</span>
        <span className="gs-break__bombs" aria-label={`${t.bombs} of 3 Bombs`}>{[0, 1, 2].map((i) => <i key={i} className={i < t.bombs ? "on" : ""} />)}</span>
        <b className="gs-break__riding">{t.turnPoints} riding</b>
      </div>
      <div className="gs-break__score"><span>Chat <b>{t.chat}</b></span><span>House <b>{t.house}</b></span><span>First to {t.target}</span></div>
    </div>
  );
}

/** Zoomed In: the portrait at the step on screen (all the way out once revealed). */
export function ZoomFrame({ img, focus, steps, stepSeconds, openedAt, reveal, now, className = "gs-break__zoom" }: {
  img: string; focus: { x: number; y: number }; steps: number[]; stepSeconds: number; openedAt?: string; reveal: boolean; now: number; className?: string;
}) {
  const opened = openedAt ? Date.parse(openedAt) : now;
  const step = reveal ? steps.length - 1 : Math.min(steps.length - 1, Math.max(0, Math.floor((now - opened) / 1000 / stepSeconds)));
  return (
    <div className={className} aria-label={reveal ? "The whole picture" : `Close-up, step ${step + 1} of ${steps.length}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- our own character art */}
      <img src={img} alt="" style={{ transform: `scale(${steps[step]})`, transformOrigin: `${focus.x}% ${focus.y}%` }} />
    </div>
  );
}

/** Four in a Row's board (row by row from the top), with the last piece or the winning four marked. */
export function ConnectBoard({ board, last, win, className = "gs-break__c4" }: { board: string; last: number | null; win?: number[]; className?: string }) {
  const winSet = new Set(win ?? []);
  return (
    <div className={className} role="img" aria-label="Four in a Row board">
      {[...board].map((cell, i) => (
        <span key={i} className={`${cell === "c" ? "is-chat" : cell === "b" ? "is-bot" : ""}${i === last ? " is-last" : ""}${winSet.has(i) ? " is-win" : ""}`} />
      ))}
    </div>
  );
}

function Option({ o, correct, count, total, reveal, compact = false }: { o: BreakOption; correct: boolean; count: number; total: number; reveal: boolean; compact?: boolean }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  // A word key ("over") is what chat types and the label already says it; a compact row has no room for keys.
  const showKey = o.key.length <= 2 && !compact;
  return (
    <li className={`gs-break__opt${reveal ? (correct ? " is-right" : " is-wrong") : ""}${showKey ? "" : " is-wordkey"}`}>
      {showKey && <span className="gs-break__key">{o.key}</span>}
      {o.img && (
        // eslint-disable-next-line @next/next/no-img-element -- overlay art from our own CDN
        <img className="gs-break__art" src={o.img} alt="" />
      )}
      <span className="gs-break__label">
        <b>{o.label}</b>
        {o.sub && <small>{o.sub}</small>}
      </span>
      {reveal && <span className="gs-break__pct">{pct}%</span>}
      {reveal && <span className="gs-break__bar" style={{ width: `${pct}%` }} />}
    </li>
  );
}

export function BreakScreenOverlay({ view, style, full = false }: { view: BreakView; style?: CSSProperties; full?: boolean }) {
  const now = useNow(view.status === "running");
  const r = view.round;
  const rv = view.reveal;
  const counting = view.phase === "open" && secsUntil(view.countdownEndsAt, now) > 0;
  const total = rv?.answered ?? 0;

  let body: ReactNode;
  if (view.status === "ended") {
    body = (
      <div className="gs-break__center">
        <p className="gs-break__eyebrow">Thanks for playing</p>
        <p className="gs-break__big">{view.streamer} is back!</p>
        {view.champion
          ? <p className="gs-break__champ">Break champion: <b>{view.champion.names.join(" and ")}</b> with {view.champion.points} point{view.champion.points === 1 ? "" : "s"}</p>
          : <p className="gs-break__sub">See you next break.</p>}
        {view.nextPick && <p className="gs-break__handicap">For the first game back: {view.nextPick}</p>}
        {view.handicap && <p className="gs-break__handicap">Chat&apos;s handicap: {view.handicap}</p>}
      </div>
    );
  } else if (view.phase === "intro" || !view.game) {
    body = (
      <div className="gs-break__center">
        <p className="gs-break__eyebrow">Next up</p>
        <p className="gs-break__big">{view.game?.name ?? "Break games"}</p>
        {view.game && <p className="gs-break__sub">{view.game.howTo}{view.game.hosted ? "" : " in chat"}</p>}
      </div>
    );
  } else if (view.phase === "standings") {
    body = (
      <div className="gs-break__center">
        <p className="gs-break__eyebrow">After {view.game.name}</p>
        <ol className="gs-break__standings">
          {view.leaders.length
            ? view.leaders.map((l, i) => <li key={i}><span>{l.name}</span><b>{l.points}</b></li>)
            : <li className="is-empty"><span>No points yet. Jump in next round!</span></li>}
        </ol>
        {view.next && <p className="gs-break__sub">Next: {view.next.name}</p>}
      </div>
    );
  } else if (r) {
    const right = new Set(rv?.correct ?? []);
    body = (
      <>
        <div className="gs-break__meta">
          <span>{view.game.name}{view.gameRounds > 1 ? ` · Round ${view.gameRound} of ${view.gameRounds}` : ""}{r.tag && r.tag !== view.game.name ? ` · ${r.tag}` : ""}</span>
          {view.phase === "open" && <span className={`gs-break__clock${counting ? "" : " is-last"}`}>{counting ? `${secsUntil(view.countdownEndsAt, now)}s` : "Last answers…"}</span>}
        </div>
        <p className="gs-break__prompt">{r.prompt}</p>
        {r.layout === "choice" && (r.item || r.img) && (
          <div className="gs-break__item">
            {r.img && (
              // eslint-disable-next-line @next/next/no-img-element -- overlay art from our own CDN
              <img src={r.img} alt="" />
            )}
            {r.item && <span>{r.item}</span>}
          </div>
        )}
        {r.layout === "choice" && !rv?.tiers && (
          <ol className={`gs-break__opts is-${r.options.length}${r.options.length >= 5 ? " is-compact" : ""}${r.options.length === 3 && !r.options.some((o) => (o.sub ?? "").length > 28) ? " is-row" : ""}`}>
            {r.options.map((o) => <Option key={o.key} o={o} correct={right.has(o.key)} count={rv?.counts?.[o.key] ?? 0} total={total} reveal={!!rv} compact={r.options.length >= 5} />)}
          </ol>
        )}
        {rv?.tiers && (
          <ol className="gs-break__tiers" aria-label="Chat's tier list">
            {rv.tiers.map((row) => <li key={row.tier}><b className={`is-${row.tier.toLowerCase()}`}>{row.tier}</b><span>{row.items.join(", ")}</span></li>)}
          </ol>
        )}
        {r.layout === "bingo" && (
          <div className="gs-break__bingo">
            <span className="gs-break__numeral">{view.bingo?.last ?? "?"}</span>
            <div>
              <p><b>{view.bingo?.called ?? 0}</b> numbers called · <b>{view.bingo?.players ?? 0}</b> card{view.bingo?.players === 1 ? "" : "s"} in play</p>
              {view.bingo?.doorsCloseAt && Date.parse(view.bingo.doorsCloseAt) > now
                ? <p>Cards close in {secsUntil(view.bingo.doorsCloseAt, now)}s{r.url ? ` at ${r.url}` : ""}</p>
                : <p>{view.bingo?.pattern ?? "Any line"} wins</p>}
            </div>
          </div>
        )}
        {r.layout === "shuffle" && (
          <>
            <Table t={rv?.table ?? r.table} />
            {!rv && (
              <ol className="gs-break__opts is-2 is-compact">
                {r.options.map((o) => <Option key={o.key} o={o} correct={false} count={0} total={0} reveal={false} compact />)}
              </ol>
            )}
          </>
        )}
        {r.layout === "text" && (r.big || rv?.word) && (
          <div className="gs-break__text">
            {r.big && <span className="gs-break__big">{r.big}</span>}
            {rv?.word && <span className="gs-break__answer">{rv.word}</span>}
          </div>
        )}
        {r.layout === "zoom" && (
          <div className="gs-break__zoomwrap">
            <ZoomFrame img={r.img} focus={r.focus} steps={r.steps} stepSeconds={r.stepSeconds} openedAt={r.openedAt} reveal={!!rv} now={now} />
            {rv?.word && <span className="gs-break__answer">{rv.word}</span>}
          </div>
        )}
        {r.layout === "rush" && (() => {
          const found = rv?.found ?? view.found ?? [];
          return (
            <div className="gs-break__rush">
              <p className="gs-break__rushcount"><b>{found.length}</b> of {r.total}</p>
              <ul className="gs-break__chips">{found.slice(-30).map((n) => <li key={n}>{n}</li>)}</ul>
              {rv?.missed && rv.missed.length > 0 && <p className="gs-break__missed">Missed: {rv.missed.slice(0, 8).join(", ")}{rv.missed.length > 8 ? "…" : ""}</p>}
            </div>
          );
        })()}
        {r.layout === "royale" && (
          <div className="gs-break__royale">
            {rv?.out && rv.out.length > 0 && (
              <ul className="gs-break__out">
                {rv.out.slice(0, 6).map((o, i) => <li key={i}>{o.line}</li>)}
                {(rv.out.length > 6 || (rv.outMore ?? 0) > 0) && <li>…and {rv.out.length - 6 + (rv.outMore ?? 0)} more</li>}
              </ul>
            )}
            {r.stage === "join" && !rv
              ? <p className="gs-break__joined"><span className="gs-break__numeral">{view.answering}</span> in so far</p>
              : (
                <>
                  <p className="gs-break__rushcount"><b>{rv?.aliveCount ?? r.aliveCount}</b> still in</p>
                  <ul className="gs-break__chips">{(rv?.alive ?? r.alive).slice(0, 24).map((n, i) => <li key={`${n}-${i}`}>{n}</li>)}</ul>
                </>
              )}
          </div>
        )}
        {r.layout === "connect" && (
          <div className="gs-break__c4wrap">
            <ConnectBoard board={rv?.board ?? r.board} last={rv ? null : r.last} win={rv?.winLine} />
            <ol className="gs-break__c4cols" aria-label="Columns">
              {Array.from({ length: 7 }, (_, c) => String(c + 1)).map((k) => (
                <li key={k} className={rv?.correct?.includes(k) ? "is-picked" : ""}>{k}{rv?.counts?.[k] ? <small>{rv.counts[k]}</small> : null}</li>
              ))}
            </ol>
          </div>
        )}
        {r.layout === "number" && (
          <div className="gs-break__number">
            {r.img && (
              // eslint-disable-next-line @next/next/no-img-element -- overlay art from our own CDN
              <img className="gs-break__portrait" src={r.img} alt="" />
            )}
            <span className="gs-break__numeral">{rv?.number ?? "?"}</span>
          </div>
        )}
        {r.layout === "word" && (
          <div className="gs-break__tiles" aria-label={rv?.word ?? r.tiles.join("")}>
            {(rv?.word ? rv.word.toUpperCase().split("") : r.tiles).map((t, i) => <span key={i} className={rv ? "is-solved" : ""}>{t}</span>)}
          </div>
        )}
        {r.layout === "dice" && (
          <div className="gs-break__dice">
            {rv?.rolls
              ? (
                <ol className="gs-break__rolls">
                  {rv.rolls.slice(0, 6).map((x, i) => (
                    <li key={i}><span>{x.name}</span><Die value={x.dice[0]} small /><Die value={x.dice[1]} small /><b>{x.dice[0] + x.dice[1]}</b></li>
                  ))}
                </ol>
              )
              : <><Die value={rv?.dice?.[0] ?? null} /><Die value={rv?.dice?.[1] ?? null} /></>}
            {r.options && (
              <ol className="gs-break__opts is-3 is-compact">
                {r.options.map((o) => <Option key={o.key} o={o} correct={right.has(o.key)} count={rv?.counts?.[o.key] ?? 0} total={total} reveal={!!rv} compact />)}
              </ol>
            )}
          </div>
        )}
        {rv ? (
          <div className="gs-break__reveal">
            <p>{rv.text}</p>
            {rv.winners && rv.winners.length > 0 && (
              <p className="gs-break__winners">{rv.winners.slice(0, 3).map((w) => `${w.name}${w.detail ? ` (${w.detail})` : ""} +${w.points}`).join("  ·  ")}</p>
            )}
            {!rv.winners && rv.answered > 0 && <p className="gs-break__winners">{rv.right} of {rv.answered} got it</p>}
          </div>
        ) : (
          r.layout === "bingo" || (r.layout === "royale" && r.stage === "wave")
            ? <p className="gs-break__hint"><b>{r.hint}</b></p>
            : r.layout === "rush" || r.layout === "royale"
              ? <p className="gs-break__hint"><b>{r.hint}</b> in chat</p>
              : <p className="gs-break__hint"><b>{r.hint}</b> in chat{view.answering ? `  ·  ${view.answering} answer${view.answering === 1 ? "" : "s"} in` : ""}</p>
        )}
      </>
    );
  }

  return (
    <div className={`gs-break${full ? " gs-break--full" : ""}`} style={full ? undefined : style}>
      <div className="gs-break__card">
        <div className="gs-break__top">
          <span className="gs-break__away">{view.status === "ended" ? "Break's over" : `${view.streamer} is on a break`}</span>
          <span className="gs-break__back">{backLine(view, now)}</span>
        </div>
        <div className={`gs-break__body${view.phase === "standings" || view.status !== "running" ? " is-solo" : ""}`}>
          <div className="gs-break__main">{body}</div>
          {view.phase !== "standings" && view.status === "running" && (
            <aside className="gs-break__leaders" aria-label="This break's leaders">
              <p>This break</p>
              {view.leaders.length
                ? <ol>{view.leaders.map((l, i) => <li key={i}><span>{l.name}</span><b>{l.points}</b></li>)}</ol>
                : <span className="gs-break__none">No points yet</span>}
              {view.chatStreak >= 2 && <span className="gs-break__streak">Chat streak: {view.chatStreak}</span>}
            </aside>
          )}
        </div>
        {view.status === "running" && view.next && view.phase !== "intro" && (
          <div className="gs-break__foot">Up next: {view.next.name}</div>
        )}
      </div>
    </div>
  );
}
