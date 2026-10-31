"use client";

/**
 * Parts every MMR card layout shares (MmrCard.tsx's four fixed layouts and MmrRolling.tsx):
 * the glyph fields, the big number's roll or count (or the division's name, Rank only), squares, the
 * change chip, the GameShuffle line, tonight's goal and streak chips, the moment layers and how a
 * moment plays, the card's theme variables (with the name's fit) and screen-reader summary.
 */

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {
  IconFlameFilled, IconLaurelWreathFilled, IconSparklesFilled, IconStarFilled, IconTargetArrow, IconTrendingDown, IconTrendingUp,
} from "@tabler/icons-react";
import { divisionLook, fontStylesheet, lookVars, type DivisionLook, type MmrLook } from "@/lib/mmr/look";
import { flagUrl } from "@/lib/lounge/flags";
import { mmrRubik } from "./mmrFonts";
import { MMR_GAMES, fmtMmr, milestoneTier, placeWord, signed, type MmrView, type Square } from "@/lib/mmr/rules";
import { pieceText, type MmrInfo, type Shown } from "@/lib/mmr/pieces";
import { goalText, type GoalProgress } from "@/lib/mmr/goal";
import { GLYPHS } from "./glyphs";
import { PIECE_ICONS } from "./pieceIcons";

export interface MmrPlay {
  /** Changes for every moment, so the same kind can play twice in a row. */
  id: number;
  delta: number;
  /** The new division's name when the event crossed into one. */
  rankup: string | null;
  /** A world-rank milestone reached for the first time (10, 100, 250, 1000). */
  milestone?: number | null;
  /** Tonight's goal, when this event reached it (GS Pro). */
  goal?: number | null;
}

// ── Glyph fields ──────────────────────────────────────────────────────────

export const RACING = ["SteeringWheel", "Flag", "Trophy", "Bolt", "Gauge", "Star"];
export const divisionGlyphs = (d: DivisionLook) => (d.kind === "gem" ? ["Diamond", "Sparkles", "Diamonds", "Star"] : d.kind === "crown" ? ["Crown", "Sparkles", "Star", "Trophy"] : ["ChevronsUp", "Star", "Sparkles", "Trophy"]);
const fields = new Map<string, string>();
export function field(names: string[], color: string, op: number): string {
  const key = names.join() + color + op;
  const hit = fields.get(key);
  if (hit) return hit;
  const cells: [number, number, number][] = [[18, 14, -12], [96, 22, 10], [150, 70, -6], [54, 66, 14], [118, 116, -16], [20, 122, 8], [74, 150, -4], [150, 154, 12]];
  const body = cells.map(([x, y, r], i) => `<g transform="translate(${x} ${y}) rotate(${r} 12 12) scale(1.15)">${(GLYPHS[names[i % names.length]] ?? []).map((d) => `<path d="${d}"/>`).join("")}</g>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180"><g fill="none" stroke="${color}" stroke-opacity="${op}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
  const url = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  fields.set(key, url);
  return url;
}

// ── The number ────────────────────────────────────────────────────────────

const STRIP = Array.from({ length: 30 }, (_, i) => i % 10);

/** The big number (MMR, or "#2,544" when world rank is the big number), rolled digit by digit
 *  like the randomizer's reels, counted, or "still" (it just changes) when the moment is off. */
export function MmrNumber({ value, mode, prefix = "", slots }: { value: number | null; mode: "roll" | "count" | "still"; prefix?: string; slots?: boolean }) {
  const [counted, setCounted] = useState(value);
  const prev = useRef(value);
  const stripRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const timers = useRef<number[]>([]);

  // Count mode eases from the old number to the new one.
  useEffect(() => {
    if (mode !== "count" || value == null) { setCounted(value); return; }
    const from = counted ?? value;
    if (from === value) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 900);
      setCounted(Math.round(from + (value - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, mode]);

  const str = value == null ? "?" : prefix + fmtMmr(mode === "count" ? counted ?? value : value);
  const digits = str.replace(/\D/g, "");

  // Roll mode: each strip moves to its digit, a full turn forward on a gain and back on a loss.
  useLayoutEffect(() => {
    if (mode !== "roll") { prev.current = value; return; }
    const before = prev.current;
    prev.current = value;
    const dir = value != null && before != null ? Math.sign(value - before) : 0;
    stripRefs.current.forEach((s, i) => {
      if (!s) return;
      const d = Number(digits[i] ?? 0);
      const cur = Number(s.dataset.pos ?? -1);
      if (!dir || cur < 0) {
        s.style.transition = "none";
        s.style.setProperty("--mmr-pos", String(10 + d));
        s.dataset.pos = String(10 + d);
        return;
      }
      if (cur % 10 === d) return;
      const target = dir > 0 ? 20 + d : d;
      s.style.transition = `transform ${0.75 + i * 0.14}s cubic-bezier(.2,.75,.25,1)`;
      s.style.setProperty("--mmr-pos", String(target));
      s.dataset.pos = String(target);
      timers.current.push(window.setTimeout(() => {
        s.style.transition = "none";
        s.style.setProperty("--mmr-pos", String(10 + d));
        s.dataset.pos = String(10 + d);
      }, 1500 + i * 140));
    });
  }, [value, mode, digits]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const big = `mmr-big${str.length >= 6 ? " mmr-big--long" : ""}`;
  if (mode !== "roll" || value == null) {
    if (!slots) return <span className={big}>{str}</span>;
    return <span className={big}>{[...str].map((ch, i) => (/\d|\?/.test(ch) ? <span key={i} className="mmr-rl-static">{ch}</span> : <span key={i} className="mmr-rl-sep">{ch}</span>))}</span>;
  }
  let di = 0;
  return (
    <span className={big} key={str.length}>
      {[...str].map((ch, i) => {
        if (!/\d/.test(ch)) return <span key={i} className="mmr-rl-sep">{ch}</span>;
        const idx = di++;
        return (
          <span key={i} className="mmr-rl">
            <span className="mmr-rl__s" ref={(el) => { stripRefs.current[idx] = el; }}>{STRIP.map((n, k) => <i key={k}>{n}</i>)}</span>
          </span>
        );
      })}
    </span>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────

export function Squares({ marks, five }: { marks: Square[]; five?: boolean }) {
  const cells = [...Array(Math.max(0, 10 - marks.length)).fill(null), ...marks];
  return (
    <span className={`mmr-sq${five ? " mmr-sq--five" : ""}`} aria-hidden="true">
      {cells.map((m, i) => <i key={i} className={m === "w" ? "w" : m === "p" ? "p" : m === "l" ? "l" : ""} />)}
    </span>
  );
}

/** The last change: "+46 · 4th" (or "+46" where room is short); with MMR kept off the card, only the place. */
export function Delta({ last, place, noMmr = false }: { last: MmrView["last"]; place: boolean; noMmr?: boolean }) {
  if (!last || (noMmr && !last.place)) return null;
  const up = last.delta > 0;
  return (
    <span className={`mmr-delta ${up ? "up" : "down"}`}>
      {up ? <IconTrendingUp aria-hidden /> : <IconTrendingDown aria-hidden />}
      <span>{noMmr ? placeWord(last.place!) : `${signed(last.delta)}${place && last.place ? ` · ${placeWord(last.place)}` : ""}`}</span>
    </span>
  );
}

/** The division's name as the big number (Rank only). */
export function DivisionBig({ name }: { name: string }) {
  return <span className={`mmr-big mmr-big--div${name.length > 10 ? " mmr-big--divlong" : ""}`}>{name}</span>;
}

/** The look's moment switches, with MMR kept off the card: no pop, roll, goal or new peak (they'd show MMR). */
export function momentsFor(info: MmrInfo): MmrInfo["moments"] {
  return info.hideMmr ? { ...info.moments, pop: false, roll: false, goal: false, peak: false } : info.moments;
}

/** How much a name's type shrinks to fit (1 up to 8 characters, down to 0.6 for 14 or more); `tight` is the strip's,
 *  which has the least room (1 up to 5 characters, down to 0.55). */
export const nameFit = (name: string, tight = false) => {
  const from = tight ? 5 : 8;
  return Math.max(tight ? 0.55 : 0.6, Math.min(1, from / Math.max(from, name.length)));
};

export function Brand({ brand }: { brand: MmrLook["brand"] }) {
  if (brand === "off" || brand === "tab") return null;
  if (brand === "mark") return <span className="mmr-gsm"><span className="mmr-gsm__mark" role="img" aria-label="GameShuffle" /></span>;
  return (
    <span className="mmr-gsm mmr-gsm--lock">
      <span className="mmr-gsb"><span className="mmr-gsb__by">Built by</span><span className="mmr-gsb__logo" role="img" aria-label="GameShuffle" /></span>
    </span>
  );
}

export function World({ rank }: { rank: number | null }) {
  if (!rank) return null;
  const laurel = milestoneTier(rank) != null;
  // The text has its own span: the laurel comes and goes, and React can't insert it in front of a bare
  // text node once a browser's translator has swapped that node out (Sentry GAMESHUFFLE-6M).
  return <span className="mmr-world">{laurel && <IconLaurelWreathFilled aria-hidden />}<span>#{rank.toLocaleString("en-US")} world</span></span>;
}

/** Tonight's goal as a chip that fills from tonight's starting number to the goal (GS Pro). */
export function GoalChip({ g }: { g: GoalProgress | null }) {
  if (!g) return null;
  return (
    <span className={`mmr-chip mmr-chip--goal${g.reached ? " is-reached" : ""}`} style={{ "--mmr-gp": `${Math.round(g.pct * 100)}%` } as CSSProperties}>
      <IconTargetArrow aria-hidden />{goalText(g)}
    </span>
  );
}

/** The win streak: a plain chip from two wins, the flame from three (when that moment is on). */
export function StreakChip({ n, flame }: { n: number; flame: boolean }) {
  if (flame) return <span key={`flame-${n}`} className="mmr-chip mmr-chip--flame mmr-chip--pop"><IconFlameFilled aria-hidden />{n} wins in a row</span>;
  const Icon = PIECE_ICONS.streak;
  return <span className="mmr-chip"><Icon aria-hidden />{n} wins in a row</span>;
}


/** The newest events: "Tue · Tier C · Free-for-all", the place and the change. */

/** The moment's state the layers draw: the change, the banner, which way, and the glyphs for the field. */
export interface MomentFx { burst: string; banner: string; up: boolean; glyphs: DivisionLook }

/** The moment layers: glyph field, foil, flash, the change, the banner and sparks. */
export function FxLayers({ fx }: { fx: MomentFx }) {
  return (
    <>
      <span className="mmr-fx-field" aria-hidden="true" />
      <span className="mmr-fx-foil" aria-hidden="true" />
      <span className="mmr-fx-flash" aria-hidden="true" />
      <span className="mmr-fx-burst" aria-hidden="true"><span className={fx.up ? "up" : "down"}>{fx.burst}</span></span>
      <span className="mmr-fx-banner" aria-hidden="true">{fx.banner}</span>
      <span className="mmr-fx-sparks" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return <i key={i} style={{ "--mmr-dx": `${Math.round(Math.cos(a) * 38)}cqw`, "--mmr-dy": `${Math.round(Math.sin(a) * 24)}cqw` } as CSSProperties}>{i % 2 ? <IconSparklesFilled /> : <IconStarFilled />}</i>;
        })}
      </span>
    </>
  );
}

/** What a play does on this look, after the moment switches: null when nothing should play. */
export function momentOf(play: MmrPlay, m: MmrInfo["moments"]): { pop: boolean; rankup: string | null; goal: number | null; milestone: number | null; moves: boolean } | null {
  const rankup = m.division ? play.rankup : null;
  const goal = m.goal ? play.goal ?? null : null;
  const milestone = m.milestone ? play.milestone ?? null : null;
  const pop = m.pop && !!play.delta;
  const moves = m.roll && !!play.delta;
  return pop || rankup || goal || milestone || moves ? { pop, rankup, goal, milestone, moves } : null;
}

/** Plays a moment's layers on `el` after `delay` ms: the change pops while the card steps back, then the
 *  division banner, the goal's or the milestone's. Returns a cleanup that stops it. */
export function playMoment(el: HTMLElement, play: MmrPlay, m: MmrInfo["moments"], div: DivisionLook, setFx: (fx: MomentFx) => void, delay = 0): () => void {
  const mo = momentOf(play, m);
  const timers: number[] = [];
  const clear = () => el.classList.remove("mmr-is-win", "mmr-is-loss", "mmr-is-burst", "mmr-is-rankup", "mmr-is-milestone");
  if (!mo || (!mo.pop && !mo.rankup && !mo.goal && !mo.milestone)) return () => timers.forEach(clearTimeout);
  timers.push(window.setTimeout(() => {
    const rankDiv = mo.rankup ? divisionLook(mo.rankup) : null;
    const banner = mo.rankup ?? (mo.goal ? "Goal reached" : mo.milestone ? `Top ${mo.milestone.toLocaleString("en-US")}` : "");
    setFx({ burst: mo.pop ? signed(play.delta) : "", banner, up: play.delta >= 0, glyphs: rankDiv ?? div });
    clear();
    void el.offsetWidth;
    if (mo.pop) el.classList.add("mmr-is-burst", play.delta > 0 ? "mmr-is-win" : "mmr-is-loss");
    timers.push(window.setTimeout(() => {
      if (mo.rankup) el.classList.add("mmr-is-rankup");
      else if (mo.goal || mo.milestone) el.classList.add("mmr-is-milestone");
    }, mo.pop ? 200 : 0));
    timers.push(window.setTimeout(clear, 3000));
  }, delay));
  return () => timers.forEach(clearTimeout);
}

/** The card's theme variables (colors, font, glyph fields, the progress bar's fill). */
export function cardVars(look: MmrLook, div: DivisionLook, glyphs: DivisionLook, pct: number, name = ""): CSSProperties {
  const light = look.surface === "light" && look.fill !== "picture";
  const ink = light ? "#1b2a6b" : "#ffffff";
  const op = light ? 0.08 : 0.12;
  return {
    ...lookVars(look, div),
    "--mmr-field": field(RACING, ink, op),
    "--mmr-field2": field(divisionGlyphs(glyphs), ink, op + 0.08),
    "--mmr-p": `${Math.round(pct * 100)}%`,
    // Long lounge names get smaller type instead of being cut (names are up to 20 or so characters).
    "--mmr-nfit": String(Math.round(nameFit(name) * 100) / 100),
    "--mmr-nfit-tight": String(Math.round(nameFit(name, true) * 100) / 100),
  } as CSSProperties;
}

export const cardClass = (look: MmrLook, fit: "frame" | "obs", className?: string) =>
  `mmr ${mmrRubik.variable} mmr--${fit} mmr-sf-${look.surface} mmr-fill-${look.fill} mmr-bd-${look.border} mmr-brand-${look.brand} mmr-align-${look.align}${look.foil ? " mmr-foil" : ""}${className ? ` ${className}` : ""}`;

/** The look's Google Fonts stylesheet (the paid fonts and "Any Google Font"), hoisted into the page head once. */
export function FontLink({ look }: { look: MmrLook }) {
  const href = fontStylesheet(look);
  return href ? <link rel="stylesheet" href={href} precedence="mmr-font" /> : null;
}

/** The country beside the name: the code, the flag (our own pictures; emoji flags are letters on Windows), or both.
 *  A code we have no flag for stays a code. */
export function CountryTag({ code, mode }: { code: string; mode: MmrLook["country"] }) {
  const flag = mode === "code" ? null : flagUrl(code);
  if (!flag) return <span className="mmr-flag">{code}</span>;
  // eslint-disable-next-line @next/next/no-img-element -- a tiny same-origin SVG inside an OBS source
  const img = <img className="mmr-flag__img" src={flag} alt="" />;
  return mode === "both" ? <span className="mmr-flag mmr-flag--both">{img}{code}</span> : <span className="mmr-flag mmr-flag--pic">{img}</span>;
}

/** Tonight's run and/or last 10 under the number (Strip, Sticker, Rolling's MMR slide). */
export function UnderLine({ pieces, view, noMmr = false }: { pieces: Shown[]; view: MmrView; noMmr?: boolean }) {
  if (!pieces.length) return null;
  const t = view.tonight;
  return (
    <span className="mmr-under">
      {pieces.includes("tonight") && (
        <span className="mmr-under__item"><small>Tonight</small><b className={t.delta > 0 ? "up" : t.delta < 0 ? "down" : undefined}>{noMmr ? `${t.w}-${t.l}` : `${signed(t.delta)} · ${t.w}-${t.l}`}</b></span>
      )}
      {pieces.includes("last10") && view.squares.length > 0 && (
        <span className="mmr-under__item"><small>Last 10</small><Squares marks={view.squares} /></span>
      )}
    </span>
  );
}

/** For screen readers, everything the card shows at once (nothing takes turns here). `extra`: the other pieces shown. */
export function cardSummary(view: MmrView, info: MmrInfo, g: GoalProgress | null, extra: Shown[]): string {
  const more = extra.filter((p) => !["world", "progress", "goal", "mmr", "name", "division", "game", "cc"].includes(p)).map((p) => pieceText(p, view, info, g)?.chip).filter(Boolean);
  const world = view.worldRank ? `, #${view.worldRank.toLocaleString("en-US")} in the world` : "";
  // MMR kept off the card stays off for screen readers too.
  if (info.hideMmr) return `${view.name}: ${view.division}${view.next ? `, next ${view.next.name}` : ""}${world}.${more.length ? ` ${more.join(". ")}.` : ""} ${MMR_GAMES[view.game].short}.`;
  return `${view.name}: ${view.mmr == null ? "no MMR yet" : `${fmtMmr(view.mmr)} MMR`}, ${view.division}${view.next && view.toNext != null ? `, ${fmtMmr(view.toNext)} to ${view.next.name}` : ""}${world}.${g ? ` Tonight's goal: ${goalText(g)}.` : ""}${more.length ? ` ${more.join(". ")}.` : ""} ${MMR_GAMES[view.game].short}.`;
}

/** The "Built by GameShuffle" tab under the card, when the look puts it there. */
export function BrandTab({ brand }: { brand: MmrLook["brand"] }) {
  if (brand !== "tab") return null;
  return <div className="mmr-gstab"><span className="mmr-gsb"><span className="mmr-gsb__by">Built by</span><span className="mmr-gsb__logo" role="img" aria-label="GameShuffle" /></span></div>;
}
