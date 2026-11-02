"use client";

/**
 * A channel's war on stream (GameShuffle Competitive; overlay looks picks 2026-10-31,
 * https://claude.ai/artifact/978WaHqftmK17ogWAWe19J, all as recommended).
 *   WarBoard: one state of the war in a look: four layouts (Scorebug, Top strip, Corner card, Race list), three
 *     surfaces, ice / team / brand / your colors, the MMR card's fonts, pieces and moments switched on or off.
 *   WarOverlay: the OBS source. Polls /api/war/live/<token> every 3 seconds while visible (with ?look=<id>, a saved
 *     look's edits show up too); when a race lands its swing pops and the totals count up, the gold tab comes up once
 *     the war can't be lost, and the final gets a gold edge. Reduced motion shows the end state without movement.
 * Sizes are in container units of each layout's own design width (`--u`), so the source scales in OBS by dragging.
 */

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { accents, DEFAULT_WAR_LOOK, layoutInfo, tagColor, warFont, warFontSheet, type WarLook } from "@/lib/wars/look";
import { demoWar } from "@/lib/wars/demo";
import { mmrRubik } from "@/components/mmr/mmrFonts";
import "@/styles/war-overlay.css";
import type { WarLiveData, WarLiveResult, WarLiveTeam } from "@/lib/wars/types";

const POLL_MS = 3000;
const COUNT_MS = 700;
const POP_MS = 2200;
const noopSubscribe = () => () => {};

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const teamName = (t: { name: string | null; tag: string }) => t.name || t.tag;

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia("(prefers-reduced-motion: reduce)"); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

function useCount(target: number, animate: boolean): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (!animate) { from.current = target; return; }
    if (from.current === target) return;
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      setShown(Math.round(a + (target - a) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, animate]);
  return animate ? shown : target;
}

/** Light text or dark on a color. */
function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#0b0e13" : "#ffffff";
}

function Logo({ team }: { team: WarLiveTeam }) {
  const [failed, setFailed] = useState(false);
  if (team.logo && !failed) {
    // eslint-disable-next-line @next/next/no-img-element -- a team logo from MKCentral or our storage, any size
    return <img className="wo__logo" src={team.logo} alt="" onError={() => setFailed(true)} />;
  }
  return <span className="wo__logo wo__logo--text" style={{ background: tagColor(team.tag) }} aria-hidden="true">{team.tag.slice(0, 4)}</span>;
}

function Pips({ diffs, total, fresh }: { diffs: number[]; total: number; fresh: boolean }) {
  return (
    <div className="wo__pips" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
      {Array.from({ length: total }, (_, i) => {
        const d = diffs[i];
        const cls = d === undefined ? "" : d > 0 ? " is-win" : d < 0 ? " is-loss" : " is-tie";
        return <i key={i} className={`wo__pip${cls}${fresh && i === diffs.length - 1 ? " is-new" : ""}`} />;
      })}
    </div>
  );
}

function Places({ spots, ours }: { spots: number[]; ours: boolean }) {
  return (
    <div className="wo__places" aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => {
        const lit = spots.includes(i + 1) === ours;
        return <i key={i} className={lit ? "is-lit" : undefined}>{i + 1}</i>;
      })}
    </div>
  );
}

function Brand({ brand }: { brand: WarLook["brand"] }) {
  if (brand === "off") return null;
  if (brand === "mark") return <span className="wo__mark" role="img" aria-label="GameShuffle" />;
  return <span className="wo__by"><span>Built by</span><span className="wo__wordmark" role="img" aria-label="GameShuffle" /></span>;
}

export interface WarPop { id: number; diff: number }

/** One state of a war, drawn in a look. `pop`: a race that just landed (its swing pops); `animate`: count the totals up. */
export function WarBoard({ war, look, pop = null, animate = false }: { war: WarLiveData; look: WarLook; pop?: WarPop | null; animate?: boolean }) {
  const flip = look.side === "them";
  const left = flip ? war.them : war.us;
  const right = flip ? war.us : war.them;
  const leftTotal = useCount(left.total, animate && look.moments.race);
  const rightTotal = useCount(right.total, animate && look.moments.race);
  const diff = left.total - right.total;
  const diffs = war.diffs.map((d) => (flip ? -d : d));
  const sideTeam = (s: "us" | "them") => (s === "us" ? war.us : war.them);
  const final = war.status !== "live";
  const caught = !final && war.decided ? sideTeam(war.decided) : null;
  const winner = diff > 0 ? left : diff < 0 ? right : null;
  const headline = war.status === "ended" && war.played < war.racesTotal
    ? `Ended after race ${war.played}`
    : winner ? `${teamName(winner)} win ${Math.max(left.total, right.total)} to ${Math.min(left.total, right.total)}` : `A tie, ${left.total} to ${right.total}`;
  let line: string;
  if (final) line = winner ? `${teamName(winner)} win` : war.status === "ended" ? "Ended" : "A tie";
  else if (war.penalty) line = `${war.penalty.points} off ${teamName(sideTeam(war.penalty.side))}${war.penalty.reason ? ` (${war.penalty.reason})` : ""}`;
  else if (caught) line = `${teamName(caught)} can't be caught`;
  else if (war.need) line = `${teamName(sideTeam(war.need.side))} need to average ${signed(war.need.avg)} a race`;
  else line = war.played ? "Level" : "Waiting for race 1";
  const race = final ? `Final · ${war.racesTotal} races` : war.last ? `Race ${war.last.n} of ${war.racesTotal}${war.last.track ? ` · ${war.last.track}` : ""}` : `${war.racesTotal} races`;

  const { a, b } = accents(look);
  const [family, weight, style] = warFont(look);
  const vars = {
    "--wo-a": a, "--wo-b": b, "--wo-a-ink": inkOn(a),
    "--wo-l": left.color || tagColor(left.tag), "--wo-r": right.color || tagColor(right.tag),
    "--wo-font": family, "--wo-fw": String(weight), "--wo-fs": style,
    "--wo-w": String(layoutInfo(look.layout).size[0]),
  } as CSSProperties;
  const p = look.pieces;
  const showPop = !!pop && look.moments.race;
  const gold = final && look.moments.final;
  // With the gold tab up, a race's pop drops below the gap instead of rising into the tab's words.
  const tabOn = !!caught && look.moments.caught;
  const cls = ["wo", `wo--${look.layout}`, `wo--${look.surface}`, look.colors === "teams" ? "wo--teams" : look.colors === "ice" ? "wo--ice" : "wo--brand", gold ? "is-final" : "", tabOn ? "has-tab" : "", diff > 0 ? "is-up" : diff < 0 ? "is-down" : ""].filter(Boolean).join(" ");
  const label = `${teamName(left)} ${left.total}, ${teamName(right)} ${right.total}. ${race}. ${line}.`;

  const gap = <span key={showPop ? pop!.id : "gap"} className={`wo__gap${showPop ? " is-pop" : ""}`}>{signed(diff)}</span>;
  const popChip = showPop ? <span key={`pop-${pop!.id}`} className="wo__pop">{signed(flip ? -pop!.diff : pop!.diff)}</span> : null;
  const tab = tabOn && caught ? <span className="wo__tab">{teamName(caught)} can&apos;t be caught</span> : null;
  // On a gold final the headline says who won, so the line steps aside; without the moment it carries the result.
  const lineEl = (!final && p.comeback) || (final && !gold) ? <span className={`wo__line${caught || final ? " is-gold" : ""}`}>{line}</span> : null;
  const raceEl = p.race ? <span className="wo__race">{race}</span> : null;
  const places = p.places && war.last && !final ? <Places spots={war.last.spots} ours={!flip} /> : null;
  const pips = p.markers ? <Pips diffs={diffs} total={war.racesTotal} fresh={showPop} /> : null;
  const team = (t: WarLiveTeam, total: number, end: "l" | "r") => (
    <div className={`wo__team wo__team--${end}`}>
      {p.logos && <Logo team={t} />}
      <span className="wo__tag">{t.tag}</span>
      <span className="wo__total">{total}</span>
    </div>
  );

  if (look.layout === "strip") {
    return (
      <section className={cls} style={vars} aria-label={label}>
        <div className="wo__panel">
          <div className="wo__side wo__side--l">{p.logos && <Logo team={left} />}<span className="wo__names"><b>{teamName(left)}</b><span>{left.tag}</span></span></div>
          <div className="wo__mid">
            <div className="wo__score"><span className="wo__total">{leftTotal}</span><span className="wo__gapwrap">{gap}{popChip}</span><span className="wo__total">{rightTotal}</span></div>
            {pips}
            <span className="wo__meta">{gold ? <span className="is-gold">{headline}</span> : tab ? <span className="is-gold">{teamName(caught!)} can&apos;t be caught</span> : <>{raceEl}{raceEl && lineEl ? " · " : null}{lineEl}</>}</span>
          </div>
          <div className="wo__side wo__side--r"><span className="wo__names"><b>{teamName(right)}</b><span>{right.tag}</span></span>{p.logos && <Logo team={right} />}</div>
        </div>
      </section>
    );
  }

  if (look.layout === "corner" || look.layout === "list") {
    const row = (t: WarLiveTeam, total: number) => (
      <div className="wo__row">{p.logos && <Logo team={t} />}<b className="wo__name">{teamName(t)}</b><span className="wo__total">{total}</span></div>
    );
    const rows = look.layout === "list" ? (
      <div className="wo__list">
        {Array.from({ length: war.racesTotal }, (_, i) => {
          const d = diffs[i];
          const lead = d === undefined ? null : diffs.slice(0, i + 1).reduce((x, y) => x + y, 0);
          return (
            <div key={i} className={`wo__lr${d === undefined ? " is-next" : d > 0 ? " is-up" : d < 0 ? " is-down" : ""}${i === diffs.length - 1 && !final ? " is-now" : ""}`}>
              <span>{i + 1}</span><span>{d === undefined ? "" : signed(d)}</span><span>{lead === null ? "" : signed(lead)}</span>
            </div>
          );
        })}
      </div>
    ) : null;
    return (
      <section className={cls} style={vars} aria-label={label}>
        <div className="wo__panel">
          <div className="wo__head">{raceEl ?? <span />}<span className="wo__gapwrap">{gap}{popChip}</span></div>
          {row(left, leftTotal)}
          {row(right, rightTotal)}
          {gold && <span className="wo__headline">{headline}</span>}
          {places}
          {pips}
          {rows}
          {tab ? <span className="wo__line is-gold">{teamName(caught!)} can&apos;t be caught</span> : !gold && lineEl}
          <Brand brand={look.brand} />
        </div>
      </section>
    );
  }

  return (
    <section className={cls} style={vars} aria-label={label}>
      <div className="wo__panel">
        {tab}
        <div className="wo__score">
          {team(left, leftTotal, "l")}
          <span className="wo__gapwrap">{gap}{popChip}</span>
          {team(right, rightTotal, "r")}
        </div>
        {gold && <span className="wo__headline">{headline}</span>}
        {places}
        {pips}
        {(raceEl || lineEl) && <div className="wo__foot">{raceEl ?? <span />}{lineEl}</div>}
        <Brand brand={look.brand} />
      </div>
    </section>
  );
}

/**
 * A war link's feed: polls /api/war/live/<token> (with a saved look's edits) every 3 seconds while visible, and pops
 * each race that lands after the first read. `initial` is the server's first read, when there is one.
 */
function useWarFeed(token: string | null, lookId: string | null, initial: WarLiveResult | null, initialLook: WarLook) {
  const [data, setData] = useState<WarLiveResult | null>(initial);
  const [look, setLook] = useState<WarLook>(initialLook);
  const [pop, setPop] = useState<WarPop | null>(null);
  const seen = useRef(initial?.ok && initial.war ? `${initial.war.id}:${initial.war.played}` : "");
  const hadInitial = useRef(!!initial);
  const popId = useRef(0);

  useEffect(() => {
    if (!token) return;
    let stop = false;
    let clear = 0;
    const load = async () => {
      if (document.hidden) return;
      const res = await fetch(`/api/war/live/${token}${lookId ? `?look=${lookId}` : ""}`, { cache: "no-store" }).catch(() => null);
      if (!res?.ok || stop) return;
      const next = (await res.json().catch(() => null)) as WarLiveResult | null;
      if (!next || !next.ok) return;
      const key = next.war ? `${next.war.id}:${next.war.played}` : "";
      const [seenId, seenPlayed] = seen.current.split(":");
      if (next.war?.last && next.war.id === seenId && next.war.played > Number(seenPlayed ?? 0)) {
        setPop({ id: ++popId.current, diff: next.war.last.diff });
        window.clearTimeout(clear);
        clear = window.setTimeout(() => setPop(null), POP_MS);
      }
      seen.current = key;
      if (next.look) setLook(next.look);
      setData(next);
    };
    if (!hadInitial.current) void load();
    const id = window.setInterval(load, POLL_MS);
    return () => { stop = true; window.clearInterval(id); window.clearTimeout(clear); };
  }, [token, lookId]);

  return { data, look, pop };
}

/** The OBS source: polls the war (and a saved look's edits) and plays each new race. */
export function WarOverlay({ token, initial, look: initialLook, lookId = null }: { token: string; initial: WarLiveResult; look: WarLook; lookId?: string | null }) {
  const { data, look, pop } = useWarFeed(token, lookId, initial, initialLook);
  const reduced = useReducedMotion();
  const inBrowser = useSyncExternalStore(noopSubscribe, () => !/OBS|Streamlabs|XSplit/i.test(navigator.userAgent), () => false);

  useEffect(() => {
    document.documentElement.classList.add("war-obs-route");
    return () => document.documentElement.classList.remove("war-obs-route");
  }, []);

  const sheet = warFontSheet(look);
  const war = data?.ok ? data.war : null;
  return (
    <>
      {sheet && <link rel="stylesheet" href={sheet} />}
      {war ? (
        <div className={`war-obs__frame war-obs__frame--${look.layout}`}>
          <WarBoard war={war} look={look} pop={reduced ? null : pop} animate={!reduced && !!pop} />
        </div>
      ) : inBrowser ? (
        <p className="war-obs__idle">No war in this channel right now. Start one with /war and it shows up here.</p>
      ) : null}
    </>
  );
}

/**
 * The war as a piece on a GS Pro streamer's GameShuffle overlay (Layout editor ▸ Apps ▸ War score): the channel they
 * added from its overlay setup page, in their saved look, drawn at its layout's design width (the overlay scales it).
 * Nothing shows while the channel has no war, except in the editor (`demoWhenIdle`, or `sample` with no channel yet).
 */
export function WarPiece({ token = null, lookId = null, sample = false, demoWhenIdle = false, style }: {
  token?: string | null;
  lookId?: string | null;
  sample?: boolean;
  demoWhenIdle?: boolean;
  style?: CSSProperties;
}) {
  const { data, look, pop } = useWarFeed(sample ? null : token, lookId, null, DEFAULT_WAR_LOOK);
  const reduced = useReducedMotion();
  const live = data?.ok ? data.war : null;
  const war = sample || (!live && demoWhenIdle && data) ? demoWar() : live;
  if (!war) return null;
  const sheet = warFontSheet(look);
  return (
    <div className={`war-piece ${mmrRubik.variable}`} style={style}>
      {sheet && <link rel="stylesheet" href={sheet} />}
      <div className={`war-piece__frame war-piece__frame--${look.layout}`} style={{ width: layoutInfo(look.layout).size[0] }}>
        <WarBoard war={war} look={look} pop={reduced ? null : pop} animate={!reduced && !!pop} />
      </div>
    </div>
  );
}
