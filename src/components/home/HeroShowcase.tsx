"use client";

import { useEffect, useReducer, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { getImageProps } from "next/image";
import { Badge, Icon, IconButton } from "@empac/cascadeds";
import type { IconName } from "@empac/cascadeds";
import { KartSlot } from "@/components/randomizer/KartSlot";
import { WheelGraphic } from "@/components/wheel/WheelGraphic";
import { computeSlices, landingRotation } from "@/lib/wheel/geometry";
import { EVENTS, tagged } from "@/lib/analytics/events";

/**
 * The homepage hero's showcase: one real piece of GameShuffle at a time, dealt
 * in like a card, doing what it does (a kart reel landing, a Daily row filling
 * in, a bracket resolving), then dealt away for the next. The order is
 * shuffled per visit and each card holds a slightly different time, so no two
 * visits run the same.
 *
 * Custom, flagged: CDS `Carousel` slides a strip and has no fade/deal mode, no
 * controlled index and one interval for every slide, so it can't hold a card
 * until its demo has finished. The pieces inside are the real components
 * (`KartSlot`, `WheelGraphic`) and the controls are CDS `IconButton`s.
 *
 * Motion rules: reduced motion shows one card at rest and never advances;
 * hovering, focusing inside, a hidden tab or scrolling away pauses it; any
 * dot click hands control to the visitor (auto-advance stops until Play).
 */

/* ── Data: small curated pools, so the homepage bundle never carries a roster. ── */

const MK = "https://cdn.empac.co/gameshuffle/images/mk8dx";
type Part = { name: string; img: string; color?: string };
const mk = (dir: string, slug: string, name: string, ext = "webp"): Part => ({ name, img: `${MK}/${dir}/${slug}.${ext}` });

const KART_POOLS: { label: string; pool: Part[] }[] = [
  { label: "Character", pool: [mk("characters", "mario", "Mario", "png"), mk("characters", "peach", "Peach", "png"), mk("characters", "yoshi", "Yoshi", "png"), mk("characters", "bowser", "Bowser", "png"), mk("characters", "link", "Link", "png"), mk("characters", "donkey-kong", "Donkey Kong", "png"), mk("characters", "isabelle", "Isabelle", "png")] },
  { label: "Vehicle", pool: [mk("vehicles", "standard-kart", "Standard Kart"), mk("vehicles", "tri-speeder", "Tri-Speeder"), mk("vehicles", "sports-coupe", "Sports Coupe"), mk("vehicles", "tanooki-kart", "Tanooki Kart"), mk("vehicles", "comet", "Comet"), mk("vehicles", "jet-bike", "Jet Bike"), mk("vehicles", "wild-wiggler", "Wild Wiggler")] },
  { label: "Wheels", pool: [mk("wheels", "standard", "Standard"), mk("wheels", "slick", "Slick"), mk("wheels", "sponge", "Sponge"), mk("wheels", "hot-monster", "Hot Monster"), mk("wheels", "retro-off-road", "Retro Off-Road"), mk("wheels", "ancient", "Ancient")] },
  { label: "Glider", pool: [mk("gliders", "super", "Super Glider"), mk("gliders", "waddle-wing", "Waddle Wing"), mk("gliders", "parafoil", "Parafoil"), mk("gliders", "plane", "Plane Glider"), mk("gliders", "hylian-kite", "Hylian Kite")] },
];

/* Colours copied from SMASH_SERIES_COLORS (src/data/smash/ultimate.ts), so the
   homepage doesn't import the whole roster for thirteen tiles. */
const smash = (slug: string, name: string, color: string): Part => ({ name, img: `/images/super-smash-bros-ultimate/fighters/${slug}.webp`, color });
const FIGHTERS: Part[] = [
  smash("mario", "Mario", "#e52521"), smash("link", "Link", "#3f9b5a"), smash("kirby", "Kirby", "#f06ba8"),
  smash("pikachu", "Pikachu", "#f2c80f"), smash("samus", "Samus", "#e0701f"), smash("donkey-kong", "Donkey Kong", "#8b5a2b"),
  smash("inkling", "Inkling", "#e84c8b"), smash("sonic", "Sonic", "#2a6fdb"), smash("steve", "Steve", "#6a9a3a"),
  smash("isabelle", "Isabelle", "#6cbf56"), smash("cloud", "Cloud", "#4a5fa8"), smash("pac-man", "Pac-Man", "#f2c80f"),
  smash("mega-man", "Mega Man", "#2f8ad8"),
];

const JAMBOREE = "https://cdn.empac.co/gameshuffle/images/mario-party-jamboree/boards";
const BOARDS = [
  { name: "Mega Wiggler's Tree Party", color: "#5cbd7a", slug: "mega-wigglers-tree-party" },
  { name: "Roll 'em Raceway", color: "#ef8cba", slug: "roll-em-raceway" },
  { name: "Rainbow Galleria", color: "#d02631", slug: "rainbow-galleria" },
  { name: "Goomba Lagoon", color: "#6d95ce", slug: "goomba-lagoon" },
  { name: "Western Land", color: "#f2b07a", slug: "western-land" },
  { name: "Mario's Rainbow Castle", color: "#70bdea", slug: "marios-rainbow-castle" },
  { name: "King Bowser's Keep", color: "#a197c9", slug: "king-bowsers-keep" },
];
const PARTY_TURNS = [10, 15, 20, 25, 30];

/* A real Mario Kart 8 Deluxe puzzle, from src/data/originals/daily-facts.ts:
   the answer is Wario (Heavy, Human, 1992, Mario Kart 64 in 1996). */
type Cell = { v: string; s: "match" | "close" | "miss" };
const DAILY_COLS = ["Weight", "Species", "Debut", "Kart debut"];
const DAILY_ROWS: { name: string; img: string; cells: Cell[] }[] = [
  { name: "Yoshi", img: `${MK}/characters/yoshi.png`, cells: [{ v: "Medium ↑", s: "miss" }, { v: "Yoshi", s: "miss" }, { v: "1990 ↑", s: "close" }, { v: "1992 ↑", s: "miss" }] },
  { name: "Donkey Kong", img: `${MK}/characters/donkey-kong.png`, cells: [{ v: "Heavy", s: "match" }, { v: "Kong", s: "miss" }, { v: "1981 ↑", s: "miss" }, { v: "1996", s: "match" }] },
  { name: "Wario", img: `${MK}/characters/wario.png`, cells: [{ v: "Heavy", s: "match" }, { v: "Human", s: "match" }, { v: "1992", s: "match" }, { v: "1996", s: "match" }] },
];

/* From the "Mario Kart challenges" preset (src/data/wheel-presets.ts), trimmed
   to eight so the labels stay readable at hero size. */
const WHEEL = ["No items", "Mirror mode", "Only bikes", "No drifting", "Bananas only", "Tiny wheels", "Chat picks track", "Free race"].map((label) => ({ label }));
const WHEEL_SLICES = computeSlices(WHEEL);

const PLAYERS = ["Kaz", "Mira", "Dex", "Juno"];
const CUPS = ["Mushroom Cup", "Flower Cup", "Star Cup", "Special Cup"];

/* ── Small helpers ── */

const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(xs: readonly T[]): T => xs[rand(xs.length)];
function shuffle<T>(xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Which beat of a timeline we're on: 0 before the first, `at.length` once done. At rest it starts done. */
function useBeats(play: boolean, at: readonly number[]): number {
  const [beat, setBeat] = useState(play ? 0 : at.length);
  useEffect(() => {
    if (!play) return;
    const ts = at.map((ms, i) => window.setTimeout(() => setBeat(i + 1), ms));
    return () => ts.forEach(clearTimeout);
  }, [play, at]);
  return beat;
}

function preload(srcs: string[]) {
  for (const src of srcs) {
    const img = new window.Image();
    img.src = src;
  }
}

/* ── The demos. Each takes `play`: false draws the finished state straight away. ── */

type DemoProps = { play: boolean };

const KART_AT = [650, 900, 1150, 1400];
function KartDemo({ play }: DemoProps) {
  const [combo] = useState(() => KART_POOLS.map((s) => pick(s.pool)));
  const beat = useBeats(play, KART_AT);
  return (
    <div className="hero-demo hero-demo--kart">
      <p className="hero-demo__line">Player 1</p>
      <ul className="hero-demo__slots">
        {KART_POOLS.map((s, i) => {
          const landed = beat > i;
          return (
            <KartSlot key={s.label} label={s.label} name={landed ? combo[i].name : null} imageSrc={landed ? combo[i].img : null} pool={s.pool} animate={play} />
          );
        })}
      </ul>
    </div>
  );
}

const SMASH_AT = [650, 1000];
function SmashDemo({ play }: DemoProps) {
  const [pair] = useState(() => shuffle(FIGHTERS).slice(0, 2));
  const beat = useBeats(play, SMASH_AT);
  return (
    <div className="hero-demo hero-demo--smash">
      {pair.map((f, i) => (
        <div key={i} className="hero-demo__fighter">
          <p className="hero-demo__line">Player {i + 1}</p>
          <ul className="hero-demo__slots">
            <KartSlot label="Fighter" portrait name={beat > i ? f.name : null} imageSrc={beat > i ? f.img : null} color={beat > i ? f.color : null} pool={FIGHTERS} animate={play} empty={<span className="hero-demo__unknown">?</span>} />
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * The landed board's art, drawn on a canvas rather than an <img>. It appears
 * seconds after load and is bigger than the headline, so as an image it became
 * the page's Largest Contentful Paint and pushed LCP out to whenever this card
 * came up. A canvas isn't an LCP candidate. Same optimized file next/image serves.
 */
function BoardArt({ slug }: { slug: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const { props } = getImageProps({ src: `${JAMBOREE}/${slug}.png`, alt: "", width: 420, height: 236 });
    const img = new window.Image();
    let live = true;
    img.onload = () => {
      const ctx = canvas.getContext("2d");
      if (!live || !ctx) return;
      const box = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(box.width * dpr);
      canvas.height = Math.round(box.height * dpr);
      // object-fit: cover
      const scale = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      canvas.classList.add("is-drawn");
    };
    img.src = props.src;
    return () => { live = false; };
  }, [slug]);
  return <canvas ref={ref} className="hero-demo__board-art" />;
}

/** A decelerating reel through the boards, landing on the pick, then the rules. */
function PartyDemo({ play }: DemoProps) {
  const [final] = useState(() => rand(BOARDS.length));
  const [turns] = useState(() => pick(PARTY_TURNS));
  const [shown, setShown] = useState(play ? -1 : final);
  const [phase, setPhase] = useState<"wait" | "spin" | "landed">(play ? "wait" : "landed");
  useEffect(() => {
    if (!play) return;
    const ts: number[] = [];
    let t = 600;
    const steps = 15;
    for (let k = 0; k < steps; k++) {
      t += 45 + Math.pow(k / steps, 2.3) * 190;
      ts.push(window.setTimeout(() => { setPhase("spin"); setShown((final + k + 1) % BOARDS.length); }, t));
    }
    ts.push(window.setTimeout(() => { setShown(final); setPhase("landed"); }, t + 120));
    return () => ts.forEach(clearTimeout);
  }, [play, final]);
  const board = shown >= 0 ? BOARDS[shown] : null;
  const landed = phase === "landed";
  return (
    <div className="hero-demo hero-demo--party">
      <div className={`hero-demo__board${landed ? " is-landed" : ""}`} style={{ "--board": board?.color ?? "#8e96ff" } as CSSProperties}>
        {landed && board && <BoardArt slug={board.slug} />}
        <span key={shown} className="hero-demo__board-name">{board ? board.name : "Rolling a board…"}</span>
      </div>
      <div className={`hero-demo__chips${landed ? " is-on" : ""}`}>
        <Badge variant="info">Party Rules</Badge>
        <Badge variant="info">{turns} turns</Badge>
        <Badge variant="info">4 players</Badge>
      </div>
    </div>
  );
}

/** Cells flip in one at a time, row by row, like a real game of the Daily. */
const DAILY_AT = (() => {
  const at: number[] = [];
  let t = 600;
  for (let r = 0; r < DAILY_ROWS.length; r++) {
    for (let c = 0; c <= DAILY_COLS.length; c++) { at.push(t); t += 140; }
    t += 420;
  }
  at.push(t);
  return at;
})();
function DailyDemo({ play }: DemoProps) {
  const beat = useBeats(play, DAILY_AT);
  const perRow = DAILY_COLS.length + 1;
  return (
    <div className="hero-demo hero-demo--daily">
      <div className="hero-demo__grid">
        <span className="hero-demo__th">Guess</span>
        {DAILY_COLS.map((c) => <span key={c} className="hero-demo__th">{c}</span>)}
        {DAILY_ROWS.map((row, r) => (
          <div key={row.name} className="hero-demo__row">
            {[null, ...row.cells].map((cell, c) => {
              const on = beat > r * perRow + c;
              if (cell === null) {
                return (
                  <span key="who" className={`hero-demo__who${on ? " is-on" : ""}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={row.img} alt="" />
                  </span>
                );
              }
              return (
                <span key={c} className={`daily__cell hero-demo__cell${on ? ` daily__cell--${cell.s} is-on` : " daily__cell--blank"}`}>
                  {on ? cell.v : "?"}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <p className={`hero-demo__result${beat >= DAILY_AT.length ? " is-on" : ""}`}>Wario in 3 guesses</p>
    </div>
  );
}

/** The real WheelGraphic, spun with a CSS transition to a random slice. */
function WheelDemo({ play }: DemoProps) {
  const [win] = useState(() => rand(WHEEL.length));
  const target = landingRotation(WHEEL_SLICES, win, 6);
  const [rotation, setRotation] = useState(play ? 0 : target);
  const [done, setDone] = useState(!play);
  useEffect(() => {
    if (!play) return;
    const a = window.setTimeout(() => setRotation(target), 650);
    const b = window.setTimeout(() => setDone(true), 650 + 3300);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [play, target]);
  return (
    <div className="hero-demo hero-demo--wheel">
      <div className="hero-demo__wheel">
        <WheelGraphic segments={WHEEL} rotation={rotation} svgClassName="hero-demo__wheel-svg" rotorClassName="hero-demo__wheel-rotor" />
      </div>
      <p className={`hero-demo__result${done ? " is-on" : ""}`}>{WHEEL[win].label}</p>
    </div>
  );
}

const BRACKET_AT = [700, 1150, 1650, 2350, 2850];
function BracketDemo({ play }: DemoProps) {
  /* Each match: [winner, loser] indices into PLAYERS, plus the loser's games. */
  const [plan] = useState(() => {
    const s1 = shuffle([0, 1]);
    const s2 = shuffle([2, 3]);
    const f = shuffle([s1[0], s2[0]]);
    return { s1, s2, f, l1: rand(3), l2: rand(3), lf: rand(3) };
  });
  const beat = useBeats(play, BRACKET_AT);
  const seat = (p: number, score: number | null, won: boolean | null) => (
    <span className={`hero-demo__seat${won === true ? " is-win" : won === false ? " is-out" : ""}`}>
      <span>{PLAYERS[p]}</span>
      <b>{score ?? ""}</b>
    </span>
  );
  const semi = (pair: number[], loser: number, at: number) => {
    const shown = beat >= at;
    const [a, b] = [...pair].sort();
    return (
      <div className="hero-demo__match">
        {seat(a, shown ? (a === pair[0] ? 3 : loser) : null, shown ? a === pair[0] : null)}
        {seat(b, shown ? (b === pair[0] ? 3 : loser) : null, shown ? b === pair[0] : null)}
      </div>
    );
  };
  const finalists = beat >= 3;
  const finalShown = beat >= 4;
  return (
    <div className="hero-demo hero-demo--bracket">
      <p className="hero-demo__line">Single elimination · first to 3</p>
      <div className="hero-demo__tree">
        <div className="hero-demo__round">
          {semi(plan.s1, plan.l1, 1)}
          {semi(plan.s2, plan.l2, 2)}
        </div>
        <div className="hero-demo__round hero-demo__round--final">
          <div className={`hero-demo__match${finalists ? "" : " is-empty"}`}>
            {finalists ? seat(plan.s1[0], finalShown ? (plan.f[0] === plan.s1[0] ? 3 : plan.lf) : null, finalShown ? plan.f[0] === plan.s1[0] : null) : <span className="hero-demo__seat is-tbd">Winner of 1</span>}
            {finalists ? seat(plan.s2[0], finalShown ? (plan.f[0] === plan.s2[0] ? 3 : plan.lf) : null, finalShown ? plan.f[0] === plan.s2[0] : null) : <span className="hero-demo__seat is-tbd">Winner of 2</span>}
          </div>
        </div>
      </div>
      <p className={`hero-demo__result${beat >= 5 ? " is-on" : ""}`}>
        <Icon name="award" size="20" /> {PLAYERS[plan.f[0]]} takes the cup
      </p>
    </div>
  );
}

/** Votes pour in from every platform into one tally. */
function PollDemo({ play }: DemoProps) {
  const [targets] = useState(() => {
    const winner = rand(CUPS.length);
    return CUPS.map((_, i) => (i === winner ? 64 + rand(30) : 12 + rand(44)));
  });
  const [progress, setProgress] = useState(play ? 0 : 1);
  useEffect(() => {
    if (!play) return;
    let raf = 0;
    const start = performance.now() + 650;
    const run = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / 2600));
      setProgress(1 - Math.pow(1 - p, 2));
      if (p < 1) raf = requestAnimationFrame(run);
    };
    raf = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf);
  }, [play]);
  const counts = targets.map((t) => Math.round(t * progress));
  const total = counts.reduce((a, b) => a + b, 0);
  const top = Math.max(...targets);
  const done = progress >= 1;
  return (
    <div className="hero-demo hero-demo--poll">
      <p className="hero-demo__question">Which cup next?</p>
      <ul className="hero-demo__bars">
        {CUPS.map((cup, i) => (
          <li key={cup} className={`hero-demo__bar${done && targets[i] === top ? " is-win" : ""}`}>
            <span className="hero-demo__bar-fill" style={{ width: `${total ? (counts[i] / Math.max(total, 1)) * 100 : 0}%` }} />
            <span className="hero-demo__bar-label"><span>{i + 1}. {cup}</span><b>{counts[i]}</b></span>
          </li>
        ))}
      </ul>
      <p className="hero-demo__line">{total} votes from Twitch chat, Discord and the live page</p>
    </div>
  );
}

/* ── The showcases ── */

interface Showcase {
  id: string;
  icon: IconName;
  kicker: string;
  title: string;
  href: string;
  cta: string;
  /** How long the card stays, before the random extra. Long enough for its demo to finish and be read. */
  hold: number;
  Demo: (p: DemoProps) => ReactNode;
  /** Images to warm up before the card is dealt, so its reel never blinks. */
  assets?: string[];
}

const SHOWCASES: Showcase[] = [
  { id: "kart", icon: "steering-wheel", kicker: "Randomizer", title: "Mario Kart 8 Deluxe", href: "/randomizers/mario-kart-8-deluxe", cta: "Roll your karts", hold: 5200, Demo: KartDemo, assets: KART_POOLS.flatMap((s) => s.pool.map((p) => p.img)) },
  { id: "smash", icon: "bolt", kicker: "Randomizer", title: "Super Smash Bros. Ultimate", href: "/randomizers/super-smash-bros-ultimate", cta: "Roll fighters", hold: 4800, Demo: SmashDemo, assets: FIGHTERS.map((f) => f.img) },
  { id: "party", icon: "star", kicker: "Randomizer", title: "Mario Party Jamboree", href: "/randomizers/super-mario-party-jamboree", cta: "Roll a board", hold: 5400, Demo: PartyDemo },
  { id: "daily", icon: "calendar", kicker: "Daily game", title: "The Daily Shuffle", href: "/daily", cta: "Play today's puzzle", hold: 6200, Demo: DailyDemo, assets: DAILY_ROWS.map((r) => r.img) },
  { id: "wheel", icon: "rotate", kicker: "Free tool", title: "Wheel Spinner", href: "/wheel-spinner", cta: "Spin your own wheel", hold: 5600, Demo: WheelDemo },
  { id: "bracket", icon: "award", kicker: "Tournaments", title: "Brackets that run themselves", href: "/tournament", cta: "Browse tournaments", hold: 5200, Demo: BracketDemo },
  { id: "poll", icon: "chart-bar", kicker: "For streamers", title: "One poll, every platform", href: "/gs-pro", cta: "See GS Pro", hold: 5200, Demo: PollDemo },
];

/* ── The stage ── */

type Deal = { pos: number; deal: number; extra: number; leaving: { pos: number; deal: number } | null };
type Action = { type: "go"; to: number } | { type: "settle" };
const N = SHOWCASES.length;
/** "Staggered by chance": every card gets up to 0.9s extra, so the rhythm never settles. */
const jitter = () => rand(900);

function dealer(s: Deal, a: Action): Deal {
  if (a.type === "settle") return s.leaving ? { ...s, leaving: null } : s;
  const to = ((a.to % N) + N) % N;
  if (to === s.pos) return s;
  return { pos: to, deal: s.deal + 1, extra: jitter(), leaving: { pos: s.pos, deal: s.deal } };
}

const REDUCED = "(prefers-reduced-motion: reduce)";
const noop = () => () => {};
function subscribeReduced(cb: () => void) {
  const m = window.matchMedia(REDUCED);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

export function HeroShowcase() {
  // Nothing order-dependent renders until mounted, so the per-visit shuffle
  // never fights hydration; the first card simply deals in once it's ready.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const reduced = useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED).matches, () => false);
  const [order] = useState(() => shuffle(SHOWCASES.map((_, i) => i)));
  const [state, dispatch] = useReducer(dealer, { pos: 0, deal: 0, extra: 0, leaving: null });
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [offscreen, setOffscreen] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const rootRef = useRef<HTMLElement>(null);

  const running = mounted && !reduced && !paused && !hovered && !focused && !offscreen && !tabHidden;
  const current = SHOWCASES[order[state.pos]];

  useEffect(() => {
    const onVis = () => setTabHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVis);
    const el = rootRef.current;
    const io = el ? new IntersectionObserver(([e]) => setOffscreen(!e.isIntersecting), { threshold: 0.2 }) : null;
    if (el && io) io.observe(el);
    return () => { document.removeEventListener("visibilitychange", onVis); io?.disconnect(); };
  }, []);

  useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(() => dispatch({ type: "go", to: state.pos + 1 }), current.hold + state.extra);
    return () => clearTimeout(t);
  }, [running, state.pos, state.deal, state.extra, current.hold]);

  useEffect(() => {
    if (!state.leaving) return;
    const t = window.setTimeout(() => dispatch({ type: "settle" }), 700);
    return () => clearTimeout(t);
  }, [state.leaving]);

  // Warm the next card's images while this one plays.
  useEffect(() => {
    if (!mounted) return;
    const next = SHOWCASES[order[(state.pos + 1) % N]];
    preload([...(current.assets ?? []), ...(next.assets ?? [])]);
  }, [mounted, order, state.pos, current.assets]);

  const card = (pos: number, deal: number, phase: "in" | "out") => {
    const sc = SHOWCASES[order[pos]];
    const Demo = sc.Demo;
    return (
      <div key={`deal-${deal}`} className={`hero-show__slot hero-show__slot--${phase}`} aria-hidden={phase === "out" || undefined} inert={phase === "out"}>
        <div className="hero-show__card" role="group" aria-roledescription="slide" aria-label={`${pos + 1} of ${N}: ${sc.title}`}>
          <header className="hero-show__head">
            <span className="hero-show__icon"><Icon name={sc.icon} size="20" /></span>
            <span className="hero-show__titles">
              <span className="hero-show__kicker">{sc.kicker}</span>
              <span className="hero-show__title">{sc.title}</span>
            </span>
          </header>
          <div className="hero-show__demo" aria-hidden="true">
            <Demo play={!reduced} />
          </div>
          <Link href={sc.href} className={`hero-show__cta ${tagged(EVENTS.heroShowcaseClicked, { showcase: sc.id })}`}>
            {sc.cta} <Icon name="arrow-right" size="16" />
          </Link>
        </div>
      </div>
    );
  };

  return (
    <section
      ref={rootRef}
      className="hero-show"
      aria-roledescription="carousel"
      aria-label="Things to try on GameShuffle"
    >
      {/* Hover and focus pause only over the card (so its link holds still),
          never over the controls, or pressing Play would stay paused. */}
      <div
        className="hero-show__stage"
        onPointerEnter={(e) => { if (e.pointerType === "mouse") setHovered(true); }}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false); }}
      >
        <span className="hero-show__deck" aria-hidden />
        {mounted && state.leaving && card(state.leaving.pos, state.leaving.deal, "out")}
        {mounted && card(state.pos, state.deal, "in")}
      </div>
      <div className="hero-show__controls">
        <div className="hero-show__dots">
          {/* Fixed order until mounted, so the server HTML and hydration agree. */}
          {(mounted ? order : SHOWCASES.map((_, i) => i)).map((idx, pos) => {
            const sc = SHOWCASES[idx];
            const active = mounted && pos === state.pos;
            return (
              <button
                key={sc.id}
                type="button"
                className={`hero-show__dot${active ? ` is-active${running ? " is-timing" : ""}` : ""}`}
                aria-label={`Show ${sc.title}`}
                aria-current={active || undefined}
                onClick={() => { setPaused(true); dispatch({ type: "go", to: pos }); }}
              >
                <span className="hero-show__pip">
                  {active && running && (
                    <span key={`fill-${state.deal}`} className="hero-show__pip-fill" style={{ animationDuration: `${current.hold + state.extra}ms` }} />
                  )}
                </span>
              </button>
            );
          })}
        </div>
        {!reduced && (
          <IconButton
            variant="tertiary"
            size="small"
            className="hero-show__pause"
            aria-label={paused ? "Play the showcase" : "Pause the showcase"}
            onClick={() => setPaused((p) => !p)}
          >
            <Icon name={paused ? "player-play" : "player-pause"} size="16" />
          </IconButton>
        )}
      </div>
    </section>
  );
}
