"use client";

/**
 * The Rolling layout (rolling picks 2026-10-21, all as recommended; rules in src/lib/mmr/rolling.ts).
 * One piece at a time, on a timer: Bar (a lower third), Box or Tall, with the name and emblem
 * pinned or rolling as the first slide, one of six motions (Slide up, Slide across, Flip, Fade,
 * Deal, Ticker), dots or a filling line for progress. Built on the same theme variables and
 * moment layers as the other layouts (cardParts.tsx), in container units so it scales like an
 * OBS source.
 *
 * When the number changes the card goes straight to the MMR slide (or a temporary one when that
 * slide is off), plays the change there the way the other layouts do, holds it, then carries on
 * from the slide it left. On the ticker the MMR slide fades in over the line and the line waits.
 * One slide timer per card, paused while the page is hidden. Reduced motion: slides cut or fade,
 * and the ticker becomes slides.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { IconFlameFilled, IconQuote, IconStarFilled } from "@tabler/icons-react";
import { divisionLook } from "@/lib/mmr/look";
import { placeWord, signed, type MmrView } from "@/lib/mmr/rules";
import { recentWhen, underPieces, type MmrInfo, type Shown } from "@/lib/mmr/pieces";
import {
  ROLL_HOLD_MS, ROLL_MOVE_MS, jumpTarget, nextSlide, resumeAfter, rollSlides, slideSecs, slideText, type RollSlide,
} from "@/lib/mmr/rolling";
import { goalProgress, type GoalProgress } from "@/lib/mmr/goal";
import { MmrEmblem } from "./MmrEmblem";
import { PIECE_ICONS } from "./pieceIcons";
import { Brand, BrandTab, CountryTag, Delta, FontLink, FxLayers, MmrNumber, Squares, UnderLine, cardClass, cardSummary, cardVars, momentOf, playMoment, type MomentFx } from "./cardParts";
import type { MmrCardProps } from "./MmrCard";
import type { MmrPending } from "@/lib/lounge/pending";

const subscribeMotion = (cb: () => void) => {
  const q = window.matchMedia("(prefers-reduced-motion: reduce)");
  q.addEventListener("change", cb);
  return () => q.removeEventListener("change", cb);
};
const subscribeVisible = (cb: () => void) => {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
};
const useReducedMotion = () => useSyncExternalStore(subscribeMotion, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => false);
const useHidden = () => useSyncExternalStore(subscribeVisible, () => document.visibilityState === "hidden", () => false);

/** Which slide is up: `pos` in the slides, or a temporary MMR slide (`temp`) while a change plays with the MMR slide off
 *  (and over the ticker). `out` is the slide leaving, for its motion; `n` counts changes. */
interface RollState { pos: number; temp: boolean; out: RollSlide | null; n: number }

export function MmrRolling({ view, look, play, className, fit = "frame", pending, goal }: MmrCardProps) {
  const info = look.info;
  const r = look.rolling;
  const m = info.moments;
  const reduce = useReducedMotion();
  const hidden = useHidden();

  // The card on show: while a change jumps to the MMR slide, the new number waits until the slide has landed
  // and the change has popped, so it rolls in front of the viewer.
  const [v, setV] = useState<MmrView>(view);
  const holdUntil = useRef(0);
  useEffect(() => {
    const wait = holdUntil.current - Date.now();
    if (wait <= 0) { setV(view); return; }
    const t = window.setTimeout(() => setV(view), wait);
    return () => clearTimeout(t);
  }, [view]);

  const div = divisionLook(v.division);
  const g = goal != null && info.on.goal ? goalProgress(goal, v.mmr, v.mmr != null ? v.mmr - v.tonight.delta : null) : null;
  const idShown = look.emblem !== "off" || info.on.name || info.on.division;
  const ticker = r.motion === "ticker" && !reduce;
  // Tonight's run and last 10 under the MMR (they leave their own slides). The ticker shows every piece in its line instead.
  const slideInfo = useMemo<MmrInfo>(() => (ticker ? { ...info, under: "none" } : info), [info, ticker]);
  const under: Shown[] = ticker ? [] : underPieces(info, "rolling").filter((p) => slideText(p, v, info, g) != null);
  const slides = useMemo(
    () => rollSlides(slideInfo, r, (p) => slideText(p, v, info, g) != null, idShown),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slideInfo, r.pin, v, g?.goal, g?.reached, idShown],
  );
  const slidesKey = slides.join();
  const motion = reduce || r.motion === "ticker" ? "fade" : r.motion;

  const [st, setSt] = useState<RollState>({ pos: 0, temp: false, out: null, n: 0 });
  const [inMoment, setInMoment] = useState(false);
  const [fx, setFx] = useState<MomentFx>({ burst: "", banner: "", up: true, glyphs: div });
  const momentRef = useRef<HTMLDivElement>(null);
  const slidesRef = useRef(slides);
  const stRef = useRef(st);
  const tickerRef = useRef(ticker);
  const leftRef = useRef(0);
  const inMomentRef = useRef(false);
  useLayoutEffect(() => { slidesRef.current = slides; stRef.current = st; tickerRef.current = ticker; });

  const pos = st.pos < slides.length ? st.pos : 0;
  const cur: RollSlide = st.temp ? "mmr" : slides[pos];
  /** Shows a slide (with the look's motion from the one that's up). */
  const show = (to: number, temp = false) => setSt((s) => {
    const sl = slidesRef.current;
    const from: RollSlide | null = s.temp ? "mmr" : sl[s.pos < sl.length ? s.pos : 0] ?? null;
    const next: RollSlide = temp ? "mmr" : sl[to] ?? sl[0];
    return { pos: to, temp, out: from && from !== next ? from : null, n: s.n + 1 };
  });

  // The slides changed (the studio, a streak starting): stay in range.
  useEffect(() => { if (st.pos >= slides.length) setSt((s) => ({ ...s, pos: 0, out: null })); }, [slidesKey, st.pos, slides.length]);

  // One slide timer: the next slide after this one's time. Waits while a change plays and while the page is hidden.
  useEffect(() => {
    if (ticker || inMoment || hidden || slides.length < 2 || st.temp) return;
    const t = window.setTimeout(() => show(nextSlide(slidesRef.current, stRef.current.pos)), slideSecs(r, slides[pos]) * 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.n, pos, slidesKey, ticker, inMoment, hidden, st.temp, r.secs, JSON.stringify(r.perSlide)]);

  // The slide leaving is drawn until its motion ends.
  useEffect(() => {
    if (!st.out) return;
    const n = st.n;
    const t = window.setTimeout(() => setSt((s) => (s.n === n ? { ...s, out: null } : s)), ROLL_MOVE_MS + 40);
    return () => clearTimeout(t);
  }, [st.n, st.out]);

  // A change: jump to the MMR slide, play it there, hold, carry on.
  useEffect(() => {
    const el = momentRef.current;
    if (!play || !el || !momentOf(play, m)) return;
    const sl = slidesRef.current, s = stRef.current;
    const mi = jumpTarget(sl);
    if (!inMomentRef.current) leftRef.current = s.pos;
    let jump = 0;
    if (tickerRef.current) {
      if (!s.temp) { setSt((x) => ({ ...x, temp: true, out: null, n: x.n + 1 })); jump = 400; }
    } else if (!(s.temp || (mi >= 0 && sl[s.pos] === "mmr"))) {
      jump = ROLL_MOVE_MS;
      if (mi >= 0) show(mi); else show(s.pos, true);
    }
    holdUntil.current = Date.now() + jump + 650;
    inMomentRef.current = true;
    setInMoment(true);
    const stop = playMoment(el, play, m, div, setFx, jump);
    const end = window.setTimeout(() => {
      inMomentRef.current = false;
      setInMoment(false);
      if (tickerRef.current) setSt((x) => ({ ...x, temp: false, out: null, n: x.n + 1 }));
      else show(resumeAfter(slidesRef.current, leftRef.current));
    }, jump + ROLL_HOLD_MS);
    return () => { clearTimeout(end); stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play?.id]);

  const vars = { ...cardVars(look, div, fx.glyphs, v.pct), "--mmr-rmove": `${ROLL_MOVE_MS}ms` } as CSSProperties;
  const cls = cardClass(look, fit, className);
  const summary = cardSummary(v, info, g, [...slides.filter((s): s is Exclude<RollSlide, "id"> => s !== "id"), ...under, ...(info.on.delta ? (["delta"] as const) : [])]);

  const emblem = <span className={`mmr-emb${look.emblem === "name" ? " mmr-emb--name" : look.emblem === "off" ? " mmr-emb--off" : ""}`}><MmrEmblem d={div} frame={look.emblem} avatar={v.avatar} /></span>;
  const flag = info.on.cc && v.country ? <CountryTag code={v.country} mode={look.country} /> : null;
  const who = (info.on.name || flag || info.on.division) ? (
    <span className="mmr-rwho">
      {(info.on.name || flag) && <span className="mmr-rname">{info.on.name && <span>{v.name}</span>}{flag}</span>}
      {info.on.division && <span className="mmr-rdiv">{v.division}</span>}
    </span>
  ) : null;
  const head = r.pin && idShown ? <div className="mmr-rhead">{emblem}{who}</div> : null;

  const ctx: SlideCtx = { v, info, g, shape: r.shape, flame: m.streak && v.streak >= 3, roll: m.roll ? look.number : "still", deltaOn: info.on.delta || inMoment, playN: play?.id ?? 0, peakOn: m.peak, emblem, who, pending: pending ?? null, under };
  const slideCls = (dir: "in" | "out") => `mmr-rs mmr-rs--${dir}-${motion}`;
  const viewport = (
    <div className={`mmr-rvp${ticker ? " mmr-rvp--ticker" : ""}${ticker && st.temp ? " is-moment" : ""}`}>
      {ticker && <Ticker slides={slides} c={ctx} paused={st.temp || hidden} />}
      {st.out && !ticker && <div key={`out-${st.n}`} className={slideCls("out")}><Slide s={st.out} c={ctx} /></div>}
      {(!ticker || st.temp) && (
        <div key={`in-${st.n}-${cur}`} className={st.n ? slideCls("in") : "mmr-rs"}><Slide s={cur} c={ctx} /></div>
      )}
    </div>
  );
  const marks = !ticker && slides.length > 1 && r.progress !== "none" ? (
    r.progress === "dots"
      ? <span className="mmr-rdots" aria-hidden="true">{slides.map((s, i) => <i key={s} className={!st.temp && i === pos ? "on" : undefined} />)}</span>
      : <span className="mmr-rprog" aria-hidden="true"><i key={`p-${st.n}`} className={inMoment || hidden || st.temp ? "is-paused" : undefined} style={{ animationDuration: `${slideSecs(r, cur)}s` }} /></span>
  ) : null;
  const brand = <Brand brand={look.brand} />;

  return (
    <div className={cls} data-layout="rolling" data-shape={r.shape} style={vars}>
      <FontLink look={look} />
      <span className="mmr-sr">{summary}</span>
      <div className="mmr-moment" ref={momentRef} aria-hidden="true">
        <div className={`mmr-roll mmr-roll--${r.shape} mmr-skin`}>
          <FxLayers fx={fx} />
          <div className="mmr-c">
            {r.shape === "bar" ? (
              <>
                {head}
                {viewport}
                <div className="mmr-rside">{r.progress === "dots" && marks}{brand}</div>
              </>
            ) : (
              <>
                {head ?? <span />}
                {viewport}
                <div className="mmr-rfoot">{r.progress === "dots" ? marks ?? <span /> : <span />}{brand}</div>
              </>
            )}
          </div>
          {r.progress === "line" && marks}
        </div>
        <BrandTab brand={look.brand} />
      </div>
    </div>
  );
}

interface SlideCtx {
  v: MmrView;
  info: MmrInfo;
  g: GoalProgress | null;
  shape: "bar" | "box" | "tall";
  flame: boolean;
  roll: "roll" | "count" | "still";
  deltaOn: boolean;
  playN: number;
  peakOn: boolean;
  emblem: ReactNode;
  who: ReactNode;
  /** A submitted table not yet verified: said under the MMR. */
  pending: MmrPending | null;
  /** Tonight's run and/or last 10 under the MMR, in the line the game usually takes. */
  under: Shown[];
}

/** One slide: a small label, the big value, and what sits under it. */
function Slide({ s, c }: { s: RollSlide; c: SlideCtx }) {
  const { v, info, g, shape } = c;
  if (s === "id") return <div className="mmr-rs__id">{c.emblem}{c.who}</div>;
  const t = slideText(s, v, info, g);
  if (!t) return null;
  const Icon = PIECE_ICONS[s];
  const label = t.label ? <span className="mmr-rlab"><Icon aria-hidden />{t.label}</span> : null;
  const sub = t.sub ? <span className="mmr-rsub">{t.sub}</span> : null;
  switch (s) {
    case "mmr": {
      const tags = [
        c.peakOn && v.last?.peak ? <span key="peak" className="mmr-chip mmr-chip--peak"><IconStarFilled aria-hidden />New peak</span> : null,
        c.flame ? <span key="flame" className="mmr-chip mmr-chip--flame"><IconFlameFilled aria-hidden />{v.streak} wins in a row</span> : null,
      ].filter(Boolean);
      return (
        <>
          {label}
          <span className="mmr-rval"><MmrNumber value={v.mmr} mode={c.roll} />{c.deltaOn && v.last && <span key={`d-${c.playN}`} className="mmr-rdelta"><Delta last={v.last} place /></span>}</span>
          {tags.length ? <span className="mmr-rtags">{tags}</span> : c.pending ? <span className="mmr-rsub">{placeWord(c.pending.place)}: about {signed(c.pending.delta)}, waiting to verify</span> : c.under.length ? <UnderLine pieces={c.under} view={v} /> : sub}
        </>
      );
    }
    case "progress": return <>{label}<span className="mmr-rval">{t.value}</span>{v.next && <span className="mmr-rbar"><i style={{ width: `${Math.round(v.pct * 100)}%` }} /></span>}</>;
    case "goal": return <>{label}<span className="mmr-rval">{t.value}</span>{g && <span className="mmr-rbar mmr-rbar--gold"><i style={{ width: `${Math.max(4, Math.round(g.pct * 100))}%` }} /></span>}{sub}</>;
    case "streak": return <>{label}<span className="mmr-rval">{c.flame && <IconFlameFilled className="mmr-rflame" aria-hidden />}{t.value}</span></>;
    case "last10": return <>{label}<Squares marks={v.squares} />{sub}</>;
    case "line": return <span className="mmr-rline"><IconQuote aria-hidden />{t.value}</span>;
    case "recent": {
      const n = shape === "bar" ? Math.min(3, info.recent) : info.recent;
      const list = v.recent.slice(0, n);
      return (
        <>
          {label}
          {shape === "bar" ? (
            <span className="mmr-rinline">{list.map((e) => <span key={e.id} className={e.delta > 0 ? "up" : "down"}>{e.place ? placeWord(e.place) : ""} {signed(e.delta)}</span>)}</span>
          ) : (
            <span className="mmr-rrows">
              {list.map((e) => (
                <span key={e.id} className="mmr-rrow">
                  <span>{shape === "tall" ? recentWhen(e).split(" · ").slice(0, 2).join(" · ") : recentWhen(e)}</span>
                  <b>{e.place ? placeWord(e.place) : ""}</b>
                  <span className={e.delta > 0 ? "up" : "down"}>{signed(e.delta)}</span>
                </span>
              ))}
            </span>
          )}
        </>
      );
    }
    default: return <>{label}<span className="mmr-rval">{t.value}</span>{sub}</>;
  }
}

/** Every slide in one moving line: across on the bar, up on the box and tall. Drawn twice so it loops. */
function Ticker({ slides, c, paused }: { slides: RollSlide[]; c: SlideCtx; paused: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [secs, setSecs] = useState(20);
  const vertical = c.shape !== "bar";
  const key = slides.join();
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => {
      const card = track.closest(".mmr") as HTMLElement | null;
      const w = card?.offsetWidth || 640;
      // About 70px a second on a 640px bar and 34px a second on a 340px box, whatever size the card is drawn at.
      const speed = vertical ? (34 / 340) * w : (70 / 640) * w;
      const half = (vertical ? track.scrollHeight : track.scrollWidth) / 2;
      setSecs(Math.max(8, Math.round(half / speed)));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    return () => ro.disconnect();
  }, [key, vertical]);
  const once = (copy: number) => slides.map((s) => {
    const item = tickerItem(s, c);
    return item ? [<span key={`${copy}-${s}`} className="mmr-rt">{item}</span>, <span key={`${copy}-${s}-sep`} className="mmr-rsep" />] : null;
  });
  return (
    <div ref={trackRef} className={`mmr-rtrack${vertical ? " mmr-rtrack--v" : ""}${paused ? " is-paused" : ""}`} style={{ animationDuration: `${secs}s` }}>
      {once(0)}{once(1)}
    </div>
  );
}

/** A slide as one ticker item: its label and value. */
function tickerItem(s: RollSlide, c: SlideCtx): ReactNode {
  const { v, info, g } = c;
  if (s === "id") return <><span className="mmr-rlab">{v.division}</span><b>{v.name}</b></>;
  const t = slideText(s, v, info, g);
  if (!t) return null;
  const Icon = PIECE_ICONS[s];
  const label = t.label ? <span className="mmr-rlab"><Icon aria-hidden />{t.label}</span> : null;
  if (s === "last10") return <>{label}<Squares marks={v.squares} /></>;
  if (s === "line") return <b className="mmr-rt__line"><IconQuote aria-hidden />{t.value}</b>;
  if (s === "recent") return <>{label}<b>{v.recent.slice(0, 3).map((e) => <span key={e.id} className={e.delta > 0 ? "up" : "down"}>{e.place ? placeWord(e.place) : ""} {signed(e.delta)}</span>)}</b></>;
  if (s === "streak") return <>{label}<b>{c.flame && <IconFlameFilled className="mmr-rflame" aria-hidden />}{t.value}</b></>;
  return <>{label}<b>{t.value}</b></>;
}
