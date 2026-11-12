"use client";

/**
 * The speedrun overlay on a 1920 × 1080 canvas (approved mockups 2026-11-09, screens 1 to 3): the Column (every split
 * down the right side, the timer, PB, sum of best and attempts, "Built by GameShuffle") or the Strip (one line along
 * the bottom or top, a tick per split). Moments: a gold split, a new PB, a reset.
 *
 * Sizes are calc(N * var(--u)) where --u is 1px on a full-size canvas (container units of `.sr-stage`, measured by
 * ContainerUnitsFallback on OBS's older Chromium). Colors are theme variables (`.sr-cv`) so GS Pro themes can swap
 * them in step 2; ahead, behind and gold never change. Used by the OBS page, the setup preview and the pitch.
 */

import { shownState, type ShownSegment } from "@/lib/speedrun/splitGroups";
import type { CSSProperties, ReactNode } from "react";
import {
  IconArrowBackUp, IconCaretDownFilled, IconCaretUpFilled, IconCheck, IconConfetti, IconCrownFilled, IconRefresh, IconSparkles,
  IconStarFilled, IconSteeringWheel, IconStopwatch,
} from "@tabler/icons-react";
import { TOKEN_SRC } from "@/components/TokenIcon";
import { predictionWords } from "@/lib/speedrun/chat";
import { mmrRubik } from "@/components/mmr/mmrFonts";
import { GLYPHS } from "@/components/mmr/glyphs";
import { gameEntry } from "@/lib/games/key";
import { boxArt } from "@/data/game-catalog";
import { clockParts, fmtClock, fmtDelta } from "@/lib/speedrun/time";
import {
  COLUMN_ROWS, currentIndex, deltas, lastDelta, lastReached, pace, pbTime, prevSegment, segmentLengths, sumOfBest,
  ticks, timeBefore, visibleRows, type MomentKind,
} from "@/lib/speedrun/rules";
import type { RelayState, SpeedrunLook, SpeedrunPredictionView } from "@/lib/speedrun/types";
import { speedrunClasses, speedrunFontSheet, speedrunVars } from "@/lib/speedrun/look";
import { useRunMs } from "./useRunClock";

export interface SpeedrunMoment {
  kind: MomentKind;
  /** Changes each time, so the same kind can play twice in a row. */
  id: number;
  /** For a reset: the run as it stood just before (drawn dimmed under the banner). */
  before?: RelayState | null;
}

export interface CanvasProps {
  state: RelayState;
  /** performance.now() when the state arrived (the clock ticks from here). */
  receivedAt: number;
  look: SpeedrunLook;
  /** The game and category from the setup, for before the relay knows them. */
  game?: string | null;
  category?: string | null;
  moment?: SpeedrunMoment | null;
  /** Previews: the clock doesn't tick. */
  still?: boolean;
  /** The game behind the overlay in previews (a blurred picture); OBS pages leave it out. */
  backdrop?: boolean;
  /** Chat's "PB this run" prediction (GS Pro), when one is in play or just ended. */
  prediction?: SpeedrunPredictionView | null;
  /** A race the runner is in (src/components/races/RaceOverlays.tsx), drawn beside the panel in the same look. */
  race?: ReactNode;
}

// ── Pieces ────────────────────────────────────────────────────────────────

const FIELD_GLYPHS = ["Flag", "Trophy", "SteeringWheel", "Bolt", "Gauge", "Star"];
let fieldCache: string | null = null;
/** The faint glyph field behind the panel, as on the MMR card. */
function fieldUrl(): string {
  if (fieldCache) return fieldCache;
  const cells: [number, number, number][] = [[18, 22, -12], [128, 8, 10], [228, 46, -6], [62, 112, 14], [176, 126, -16], [262, 168, 8], [24, 214, 6], [140, 236, -10]];
  const body = cells.map(([x, y, r], i) => `<g transform="translate(${x} ${y}) rotate(${r} 18 18) scale(1.5)">${(GLYPHS[FIELD_GLYPHS[i % FIELD_GLYPHS.length]] ?? []).map((d) => `<path d="${d}"/>`).join("")}</g>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><g fill="none" stroke="#ffffff" stroke-opacity="0.075" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
  fieldCache = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  return fieldCache;
}

function Delta({ ms, gold = false, word = false }: { ms: number; gold?: boolean; word?: boolean }) {
  const ahead = ms <= 0;
  const cls = gold ? "gold" : ahead ? "ahead" : "behind";
  return (
    <span className={`sr-d ${cls}`}>
      {ahead ? <IconCaretDownFilled aria-hidden="true" /> : <IconCaretUpFilled aria-hidden="true" />}
      {fmtDelta(ms)}{word ? (ahead ? " ahead" : " behind") : ""}
    </span>
  );
}

function Clock({ ms }: { ms: number }) {
  const p = clockParts(ms);
  return <>{p.main}<small>{p.frac}</small></>;
}

/** The run's time, ticking while it runs. */
function RunClock({ st, receivedAt, still }: { st: RelayState; receivedAt: number; still?: boolean }) {
  const ms = useRunMs(st.phase === "running", st.elapsedMs, receivedAt, still);
  return <Clock ms={st.phase === "idle" ? 0 : ms} />;
}

/** The current split's own time (from the last split reached), ticking while it runs. */
function SegClock({ st, receivedAt, still, index }: { st: RelayState; receivedAt: number; still?: boolean; index: number }) {
  const ms = useRunMs(st.phase === "running", st.elapsedMs, receivedAt, still);
  if (st.phase === "idle") return <>{fmtClock(0)}</>;
  return <>{fmtClock(Math.max(0, ms - timeBefore(st, index)))}</>;
}

const isKart = (game: string | null | undefined) => gameEntry(game)?.family === "Mario Kart";

function GameTile({ game }: { game: string | null | undefined }) {
  return <span className="sr-tile">{isKart(game) ? <IconSteeringWheel aria-hidden="true" /> : <IconStopwatch aria-hidden="true" />}</span>;
}

function BuiltBy() {
  return <span className="sr-gsb"><small>Built by</small><span className="sr-gsb__logo" role="img" aria-label="GameShuffle" /></span>;
}

/** Under the Column: a line of your own, else "Built by GameShuffle", the mark alone, or nothing (GS Pro or Supporter). */
function Foot({ look }: { look: SpeedrunLook }) {
  if (look.line) return <div className="sr-cl-foot"><span className="sr-cl-line">{look.line}</span></div>;
  if (look.brand === "off") return null;
  return <div className="sr-cl-foot">{look.brand === "mark" ? <span className="sr-gsb sr-gsb--mark" role="img" aria-label="GameShuffle" /> : <BuiltBy />}</div>;
}

const attemptText = (n: number) => n.toLocaleString("en-US");

/** The name and line under it: the setup's game and category until the relay knows them. */
function names(st: RelayState, game?: string | null, category?: string | null) {
  const key = st.game ?? game ?? null;
  const name = key ? gameEntry(key)?.name ?? key : "";
  const cat = st.category ?? category ?? "";
  return { key, name: name || cat || "Speedrun", cat: name ? cat : "" };
}

// ── Chat's prediction ─────────────────────────────────────────────────────

function PredictionLine({ p, short = false }: { p: SpeedrunPredictionView; short?: boolean }) {
  const w = predictionWords(p, { short });
  const icon = w.kind === "won" ? <IconCheck aria-hidden="true" /> : p.status === "cancelled" ? <IconArrowBackUp aria-hidden="true" /> : p.result?.winner === "pb" ? <IconCrownFilled aria-hidden="true" /> : <IconRefresh aria-hidden="true" />;
  return (
    <div className={`sr-pred sr-pred--${w.kind}`}>
      {w.kind === "tally"
        // eslint-disable-next-line @next/next/no-img-element
        ? <img className="sr-pred__tok" src={TOKEN_SRC} alt="" aria-hidden="true" />
        : <span className="sr-pred__ico">{icon}</span>}
      <b>{w.title}{w.status && !short && <span>{w.status}</span>}</b>
      <div>
        {w.pct != null && <div className="sr-pbar" style={{ "--p": `${w.pct}%` } as CSSProperties}><i /></div>}
        <small>{w.line}</small>
      </div>
    </div>
  );
}

// ── The Column ────────────────────────────────────────────────────────────

function ColumnBanner({ moment, st }: { moment: SpeedrunMoment; st: RelayState }) {
  if (moment.kind === "gold") {
    const i = st.last?.index ?? lastReached(st);
    const seg = st.segments[i];
    const runSeg = segmentLengths(st.splits)[i];
    const best = segmentLengths(st.segments.map((s) => s.bestMs))[i];
    const by = runSeg != null && best != null && best > runSeg ? best - runSeg : null;
    return (
      <div className="sr-banner sr-banner--gold" key={moment.id}>
        <span className="sr-banner__k"><IconStarFilled aria-hidden="true" />Best segment</span>
        <span className="sr-banner__v sr-big">{seg?.name} {runSeg != null ? fmtClock(runSeg) : ""}</span>
        <span className="sr-banner__s">{by != null ? `${fmtDelta(by)} faster than your best ${seg?.name}` : `Your best ${seg?.name} yet`}</span>
      </div>
    );
  }
  if (moment.kind === "pb") {
    const end = st.splits.at(-1) ?? st.elapsedMs;
    const old = pbTime(st.segments);
    return (
      <div className="sr-banner sr-banner--gold sr-banner--mid" key={moment.id}>
        <span className="sr-banner__k"><IconCrownFilled aria-hidden="true" />New personal best</span>
        <span className="sr-banner__v sr-big">{fmtClock(end)}</span>
        <span className="sr-banner__s">{old != null && old > end ? `${fmtDelta(old - end)} faster than ${fmtClock(old)}` : "Your first finished run"}</span>
      </div>
    );
  }
  // Reset: where the run ended, how it stood, and the next attempt.
  const before = moment.before ?? st;
  const at = before.index ?? Math.max(0, lastReached(before) + 1);
  const d = lastDelta(before);
  const atName = before.segments[at]?.name ?? before.segments.at(-1)?.name ?? "";
  const how = d ? `${fmtDelta(d.ms)} ${d.ms <= 0 ? "ahead" : "behind"} at ${before.segments[d.index]?.name} · ` : "";
  return (
    <div className="sr-banner sr-banner--reset sr-banner--mid" key={moment.id}>
      <span className="sr-banner__k"><IconRefresh aria-hidden="true" />Run reset</span>
      <span className="sr-banner__v sr-big">{atName ? `at ${atName}` : "Reset"}</span>
      <span className="sr-banner__s">{how}attempt {attemptText(before.attempt + 1)} is next</span>
    </div>
  );
}

function Sparks({ kind, id }: { kind: MomentKind; id: number }) {
  if (kind === "reset") return null;
  const Big = kind === "pb" ? IconConfetti : IconSparkles;
  return (
    <span className="sr-sparks" key={id} aria-hidden="true">
      <i className="sr-spark sr-spark--a"><Big /></i>
      <i className="sr-spark sr-spark--b"><IconSparkles /></i>
      <i className="sr-spark sr-spark--c"><IconStarFilled /></i>
      <i className="sr-spark sr-spark--d"><IconStarFilled /></i>
    </span>
  );
}

function Column({ st, receivedAt, look, game, category, moment, still, prediction }: Omit<CanvasProps, "backdrop" | "state"> & { st: RelayState }) {
  const n = names(st, game, category);
  const cur = currentIndex(st);
  const d = deltas(st);
  const count = st.segments.length;
  const statKeys = (["pb", "sob", "attempts", "prevSegment", "pace"] as const).filter((k) => look.stats[k]);
  // The prediction takes about three rows' height.
  const maxRows = (statKeys.length > 3 ? COLUMN_ROWS - 3 : COLUMN_ROWS - 1) - (prediction ? 3 : 0);
  const rows = visibleRows(count, cur, maxRows);
  const gold = moment?.kind === "gold" ? st.last?.index ?? null : null;

  // The block over the clock: the split being run (or the gold one during its moment, or the last one at the end).
  const segIndex = gold != null ? gold : st.phase === "ended" ? count - 1 : cur ?? 0;
  // The split's group (a cup) rides along over the clock; the rows are too narrow for it.
  const segGroup = (st.segments[segIndex] as ShownSegment | undefined)?.group;
  const segName = st.segments[segIndex] ? `${st.segments[segIndex].name}${segGroup ? ` · ${segGroup}` : ""}` : "Ready";
  let segValue: ReactNode;
  if (gold != null || st.phase === "ended") {
    const len = segmentLengths(st.splits)[segIndex];
    segValue = len != null ? fmtClock(len) : "-";
  } else {
    segValue = <SegClock st={st} receivedAt={receivedAt} still={still} index={segIndex} />;
  }
  const chip = lastDelta(st);
  const isPb = moment?.kind === "pb";
  const pbShown = isPb ? st.splits.at(-1) ?? st.elapsedMs : pbTime(st.segments);
  const prev = prevSegment(st);
  const paceMs = pace(st);

  const stat = (k: (typeof statKeys)[number]) => {
    switch (k) {
      case "pb": return { label: "PB", value: pbShown != null ? fmtClock(pbShown) : "-" };
      case "sob": { const s = sumOfBest(st); return { label: "Sum of best", value: s != null ? fmtClock(s) : "-" }; }
      case "attempts": return { label: "Attempt", value: st.attempt > 0 ? attemptText(st.attempt) : "-" };
      case "prevSegment": return { label: "Previous segment", value: prev ? <Delta ms={prev.ms} /> : "-" };
      case "pace": return { label: "Pace", value: paceMs != null ? fmtClock(paceMs) : "-" };
    }
  };

  const rowEls = rows.map((i, at) => {
    const seg = st.segments[i];
    const jump = at > 0 && rows[at - 1] !== i - 1;
    const reached = cur != null && i < cur;
    const cls = ["sr-row", jump ? "is-jump" : ""];
    if (reached) {
      const t = st.splits[i];
      if (t == null) {
        cls.push("is-skip");
        return <li key={i} className={cls.join(" ")}><span className="n">{seg.name}</span><span /><span className="t">-</span></li>;
      }
      const g = !!st.golds[i];
      if (gold === i) cls.push("is-flash");
      return (
        <li key={i} className={cls.join(" ")}>
          <span className="n">{seg.name}{g && <IconStarFilled className="sr-row__star" aria-hidden="true" />}</span>
          <span className="dl">{d[i] != null ? <Delta ms={d[i] as number} gold={g} /> : null}</span>
          <span className="t">{fmtClock(t)}</span>
        </li>
      );
    }
    cls.push(cur === i && st.phase !== "idle" ? "is-now" : "is-next");
    return <li key={i} className={cls.join(" ")}><span className="n">{seg.name}</span><span /><span className="t">{seg.pbMs != null ? fmtClock(seg.pbMs) : "-"}</span></li>;
  });

  const goldVis = gold != null ? rows.indexOf(gold) : -1;
  return (
    <div className={`sr-ovp sr-colov${moment?.kind === "reset" ? " is-reset" : ""}`} style={{ "--sr-field": fieldUrl() } as CSSProperties}>
      <div className="sr-cl-head">
        <GameTile game={n.key} />
        <div className="sr-cl-names"><div className="sr-cl-game">{n.name}</div>{n.cat && <div className="sr-cl-cat">{n.cat}</div>}</div>
      </div>
      <div className="sr-cl-rowswrap">
        {count ? <ol className="sr-cl-rows">{rowEls}</ol> : <p className="sr-cl-empty">Connect your timer to show your splits</p>}
        {moment?.kind === "gold" && (
          <div className="sr-banner-at" style={{ "--sr-row": Math.max(0, goldVis) + 2 } as CSSProperties}>
            <ColumnBanner moment={moment} st={st} /><Sparks kind={moment.kind} id={moment.id} />
          </div>
        )}
      </div>
      <div className="sr-cl-timer">
        <div className="sr-cl-timer__top">
          <div className="sr-cl-seg"><span className="sr-eyebrow">{segName}</span><b>{segValue}</b></div>
          {chip && <span className={`sr-chip ${chip.ms <= 0 ? "ahead" : "behind"}`}><Delta ms={chip.ms} word /></span>}
        </div>
        <div className={`sr-cl-clock sr-big${isPb ? " is-pb" : moment?.kind === "reset" ? " is-dim" : ""}`}>
          <RunClock st={st} receivedAt={receivedAt} still={still} />
        </div>
      </div>
      {statKeys.length > 0 && (
        <div className={`sr-cl-stats sr-cl-stats--${statKeys.length}`}>
          {statKeys.map((k) => { const s = stat(k); return <div key={k}><span className="sr-eyebrow">{s.label}</span><b>{s.value}</b></div>; })}
        </div>
      )}
      {prediction && <PredictionLine p={prediction} />}
      <Foot look={look} />
      {moment && moment.kind !== "gold" && (
        <div className="sr-banner-at sr-banner-at--mid"><ColumnBanner moment={moment} st={st} /><Sparks kind={moment.kind} id={moment.id} /></div>
      )}
      {moment && moment.kind !== "reset" && <span className="sr-glow" key={`g${moment.id}`} />}
    </div>
  );
}

// ── The Strip ─────────────────────────────────────────────────────────────

function Strip({ st, receivedAt, look, game, category, moment, still, prediction }: Omit<CanvasProps, "backdrop" | "state"> & { st: RelayState }) {
  const n = names(st, game, category);
  const cur = currentIndex(st);
  const count = st.segments.length;
  const kinds = ticks(st);
  const chip = lastDelta(st);
  const ended = st.phase === "ended";
  const at = ended ? count - 1 : cur ?? 0;
  const seg = st.segments[at];
  const nextSeg = !ended && at + 1 < count ? st.segments[at + 1] : null;
  const finish = pbTime(st.segments);
  const goldNow = moment?.kind === "gold";
  const line = [n.cat, look.stats.attempts && st.attempt > 0 ? `attempt ${attemptText(st.attempt)}` : ""].filter(Boolean).join(" · ");

  let flag: ReactNode = null;
  if (moment?.kind === "gold") {
    const i = st.last?.index ?? lastReached(st);
    const len = segmentLengths(st.splits)[i];
    flag = <><IconStarFilled aria-hidden="true" />Best segment · {st.segments[i]?.name}{len != null ? ` ${fmtClock(len)}` : ""}</>;
  } else if (moment?.kind === "pb") {
    flag = <><IconCrownFilled aria-hidden="true" />New personal best · {fmtClock(st.splits.at(-1) ?? st.elapsedMs)}</>;
  } else if (moment?.kind === "reset") {
    const before = moment.before ?? st;
    const where = before.segments[before.index ?? 0]?.name;
    flag = <><IconRefresh aria-hidden="true" />Run reset{where ? ` at ${where}` : ""}</>;
  }

  return (
    <div className={`sr-ovp sr-stripov sr-stripov--${look.position}${prediction ? " sr-stripov--pred" : ""}${moment?.kind === "reset" ? " is-reset" : ""}`} style={{ "--sr-field": fieldUrl() } as CSSProperties}>
      {count > 0 && (
        <div className={`sr-st-ticks${count > 40 ? " is-dense" : ""}`} style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
          {kinds.map((k, i) => <i key={i} className={k} />)}
        </div>
      )}
      <div className="sr-st-game">
        <GameTile game={n.key} />
        <div className="sr-st-names"><b>{n.name}</b>{line && <small>{line}</small>}</div>
      </div>
      <div className="sr-st-split">
        <span className="sr-eyebrow">{ended ? "Finished" : count ? `${(seg as ShownSegment | undefined)?.group ? `${(seg as ShownSegment).group} · ` : ""}Split ${at + 1} of ${count}` : "Waiting for splits"}</span>
        <b>{seg?.name ?? "Your timer"}</b>
        {seg && <small>{ended ? `PB ${finish != null ? fmtClock(finish) : "-"}` : `PB here ${seg.pbMs != null ? fmtClock(seg.pbMs) : "-"}`}</small>}
      </div>
      <div className={`sr-st-delta${goldNow ? " is-gold" : ""}`}>
        {chip ? <><Delta ms={chip.ms} gold={goldNow} /><span className="sr-eyebrow">{chip.ms <= 0 ? "Ahead" : "Behind"}</span></> : null}
      </div>
      <div className={`sr-st-time sr-big${moment?.kind === "pb" ? " is-pb" : moment?.kind === "reset" ? " is-dim" : ""}`}>
        <RunClock st={st} receivedAt={receivedAt} still={still} />
      </div>
      <div className="sr-st-next">
        <span className="sr-eyebrow">{nextSeg ? "Next" : "Finish"}</span>
        <b>{nextSeg ? nextSeg.name : ended ? fmtClock(st.splits.at(-1) ?? st.elapsedMs) : seg?.name ?? ""}</b>
        {count > 0 && <small>{nextSeg ? `PB ${nextSeg.pbMs != null ? fmtClock(nextSeg.pbMs) : "-"} · finish ${finish != null ? fmtClock(finish) : "-"}` : `PB ${finish != null ? fmtClock(finish) : "-"}`}</small>}
      </div>
      {prediction && <div className="sr-st-pred"><PredictionLine p={prediction} short /></div>}
      {flag && <span className={`sr-st-flag sr-st-flag--${moment?.kind}`} key={moment?.id}>{flag}</span>}
    </div>
  );
}

// ── The canvas ────────────────────────────────────────────────────────────

export function SpeedrunCanvas({ state, receivedAt, look, game, category, moment = null, still = false, backdrop = false, prediction = null, race = null }: CanvasProps) {
  // A reset shows the run as it stood, dimmed, until the moment is over.
  // Plain split names (LiveSplit's group marks read, each split keeping its group), the moment's too.
  const shown = shownState(moment?.kind === "reset" && moment.before ? moment.before : state);
  const m = moment?.before ? { ...moment, before: shownState(moment.before) } : moment;
  const props = { st: shown, receivedAt, look, game, category, moment: m, still, prediction };
  const sheet = speedrunFontSheet(look);
  // Previews: the run's own game blurred behind the overlay (its box art), else a plain dark ground.
  const art = backdrop ? boxArt(gameEntry(shown.game ?? game ?? null)) : null;
  return (
    <div className={`sr-stage ${mmrRubik.variable}${backdrop ? " sr-stage--backdrop" : ""}`}>
      {sheet && <link rel="stylesheet" href={sheet} precedence="sr-font" />}
      <div className={`sr-cv ${speedrunClasses(look)}`} style={speedrunVars(look) as CSSProperties}>
        {backdrop && <><div className="sr-game" style={art ? { backgroundImage: `url(${art})` } : undefined} /><div className={`sr-game-shade sr-game-shade--${look.layout}`} /></>}
        {look.layout === "strip" ? <Strip {...props} /> : <Column {...props} />}
        {race}
      </div>
    </div>
  );
}
