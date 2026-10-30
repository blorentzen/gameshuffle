"use client";

/**
 * The MMR card (picks 2026-10-20): four layouts on one set of theme variables,
 * sized with container units so it scales like an OBS source.
 *   Deck card: a card on a deck, like the homepage's; a new division deals the next card.
 *   Overlay panel: the same family as the trivia, poll and bingo panels.
 *   Squares strip: a slim bar with the last ten events as the dailies' squares.
 *   Sticker: a square badge for a corner of the stream, and the profile badge.
 * What's on it (picks 2026-10-21) comes from the look's pieces (src/lib/mmr/pieces.ts): each
 * layout gives some pieces a spot of their own and has room for a few details; extras take
 * turns in the last slot every 8 seconds, with small dots.
 * Moments (`play`), each with its own switch: a win or loss pops the change while the card
 * steps back, a new division adds its banner, sparks and the layout's own move, a world-rank
 * milestone gets a laurel banner, tonight's goal a gold one. The number rolls like the
 * randomizer's reels, or counts up.
 * Feedback round (2026-10-29): the country as a code, flag or both; the panel's "Type !mmr in chat"
 * only while GameShuffle's bot answers it (`chat`) and its own switch allows; MMR beside world rank
 * follows its switch; tonight's run and last 10 can sit under the number (Strip, Sticker); the Deck card
 * gets shorter when its foot is empty; the panel's tiles share their row; Line up left or center.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { IconChartLine, IconChevronsUp, IconClock, IconFlag, IconLaurelWreathFilled, IconStar, IconStarFilled } from "@tabler/icons-react";
import { divisionLook, type MmrLook } from "@/lib/mmr/look";
import { MMR_GAMES, fmtMmr, milestoneTier, placeWord, signed, type MmrView } from "@/lib/mmr/rules";
import {
  LAYOUT_SPOTS, TURN_MS, bigIsWorld, detailsFor, fitSlots, pieceText, recentWhen, toNextText, underPieces, type MmrInfo, type MmrPiece, type Shown,
} from "@/lib/mmr/pieces";
import type { NightRecap } from "@/lib/lounge/recap";
import type { MmrPending } from "@/lib/lounge/pending";
import { goalProgress, type GoalProgress } from "@/lib/mmr/goal";
import { MmrEmblem } from "./MmrEmblem";
import { PIECE_ICONS } from "./pieceIcons";
import {
  Brand, BrandTab, CountryTag, Delta, Dots, FontLink, FxLayers, GoalChip, MmrNumber, Squares, StreakChip, UnderLine, World, cardClass, cardSummary, cardVars, playMoment,
  type MmrPlay, type MomentFx,
} from "./cardParts";
import { MmrRolling } from "./MmrRolling";

export type { MmrPlay } from "./cardParts";

function Recent({ view, n }: { view: MmrView; n: number }) {
  const list = view.recent.slice(0, n);
  if (!list.length) return null;
  return (
    <span className="mmr-recent">
      {list.map((e) => (
        <span key={e.id} className="mmr-recent__row">
          <span className="mmr-recent__when">{recentWhen(e)}</span>
          <span className="mmr-recent__place">{e.place ? placeWord(e.place) : ""}</span>
          <span className={`mmr-recent__d ${e.delta > 0 ? "up" : "down"}`}>{signed(e.delta)}</span>
        </span>
      ))}
    </span>
  );
}

interface PieceCtx { view: MmrView; info: MmrInfo; goal: GoalProgress | null; flame: boolean }

/** A detail as a chip (deck, strip, sticker). */
function PieceChip({ p, c, short = false }: { p: Shown; c: PieceCtx; /** The strip's narrow slot: each piece at its shortest, still whole. */ short?: boolean }) {
  const { view, info } = c;
  if (p === "goal") return <GoalChip g={c.goal} />;
  if (p === "streak") return <StreakChip n={view.streak} flame={c.flame} />;
  const t = pieceText(p, view, info, c.goal);
  if (!t) return null;
  const Icon = PIECE_ICONS[p];
  if (p === "world") return <span className="mmr-chip">{milestoneTier(view.worldRank) != null ? <IconLaurelWreathFilled className="mmr-laurel" aria-hidden /> : <Icon aria-hidden />}<span className="mmr-chip__t">{short ? t.short : t.chip}</span></span>;
  if (p === "last10") return <span className="mmr-chip mmr-chip--sq"><Icon aria-hidden />Last 10<Squares marks={view.squares} /></span>;
  if (p === "recent") {
    return (
      <span className="mmr-chip">
        <Icon aria-hidden />
        {view.recent.slice(0, short ? Math.min(3, info.recent) : info.recent).map((e, i) => (
          <span key={e.id} className="mmr-chip__places">{i > 0 && <span className="mmr-chip__sep" aria-hidden="true">·</span>}<b className={e.delta > 0 ? "up" : "down"}>{e.place ? placeWord(e.place) : signed(e.delta)}</b></span>
        ))}
      </span>
    );
  }
  return <span className={`mmr-chip${p === "line" ? " mmr-chip--line" : ""}`}><Icon aria-hidden /><span className="mmr-chip__t">{short ? t.short : t.chip}</span></span>;
}

/** A detail as a tile (the overlay panel). */
function PieceTile({ p, c, dots }: { p: Shown; c: PieceCtx; dots?: ReactNode }) {
  const t = pieceText(p, c.view, c.info, c.goal);
  if (!t) return null;
  const Icon = PIECE_ICONS[p];
  return (
    <div className={`mmr-cell${p === "line" ? " mmr-cell--line" : ""}`}>
      <i><Icon aria-hidden /></i>
      <span>
        {t.label && <small>{t.label}</small>}
        {p === "last10" ? <Squares marks={c.view.squares} /> : <b>{t.value}</b>}
      </span>
      {dots}
    </div>
  );
}

/** Steps through `count` items every 8 seconds (0 when nothing takes turns). */
function useTurn(count: number): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (count < 2) return;
    const id = window.setInterval(() => setTick((t) => t + 1), TURN_MS);
    return () => clearInterval(id);
  }, [count]);
  return count > 1 ? tick % count : 0;
}

// ── The card ──────────────────────────────────────────────────────────────

export interface MmrCardProps {
  view: MmrView;
  look: MmrLook;
  play?: MmrPlay | null;
  className?: string;
  /** Tonight's goal (GS Pro): "184 to 15,500" on the card, a moment when it's reached. */
  goal?: number | null;
  /** A submitted table not yet verified: a chip with the change it should bring. */
  pending?: MmrPending | null;
  /** The night's recap (the OBS link's ?view=recap, GS Pro): drawn on the panel's skin in the player's look. */
  recap?: NightRecap | null;
  /** "frame": a page preview (keeps its OBS proportions, scrolls on narrow screens); "obs": fills the browser source. */
  fit?: "frame" | "obs";
  /** GameShuffle's bot answers !mmr in the streamer's chat: the panel's "Type !mmr in chat" line may show. */
  chat?: boolean;
}

/** The card in its look's layout: the Rolling layout has its own component (MmrRolling.tsx). */
export function MmrCard(props: MmrCardProps) {
  return props.look.layout === "rolling" && !props.recap ? <MmrRolling {...props} /> : <FixedCard {...props} />;
}

/** Whether the strip's progress text fits beside the division on one line. When it doesn't, it's left
 *  out there (it wraps onto a hidden second line, never cut to a stub) and joins the details instead. */
function useStripRoom(active: boolean, deps: unknown[]) {
  const lineRef = useRef<HTMLSpanElement>(null);
  const progRef = useRef<HTMLSpanElement>(null);
  const [fits, setFits] = useState(true);
  useLayoutEffect(() => {
    const line = lineRef.current, prog = progRef.current;
    if (!active || !line || !prog) { setFits(true); return; }
    const check = () => {
      const lr = line.getBoundingClientRect(), pr = prog.getBoundingClientRect();
      setFits(pr.top < lr.top + 2 && pr.right <= lr.right + 1);
    };
    check();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(check);
    ro.observe(line);
    ro.observe(prog);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ...deps]);
  return { lineRef, progRef, fits };
}

function FixedCard({ view, look, play, className, fit = "frame", recap, pending, goal, chat = false }: MmrCardProps) {
  const div = divisionLook(view.division);
  const info = look.info;
  const m = info.moments;
  const momentRef = useRef<HTMLDivElement>(null);
  const [fx, setFx] = useState<MomentFx>({ burst: "", banner: "", up: true, glyphs: div });

  // Each moment has its own switch (playMoment reads them).
  useEffect(() => {
    const el = momentRef.current;
    if (!play || !el) return;
    return playMoment(el, play, m, div, setFx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play?.id]);

  const g = goal != null && info.on.goal ? goalProgress(goal, view.mmr, view.mmr != null ? view.mmr - view.tonight.delta : null) : null;
  const worldBig = bigIsWorld(info, view);
  const has = (p: Shown) => pieceText(p, view, info, g) != null;
  const on = (p: MmrPiece) => info.on[p] && has(p);
  const layout = recap ? null : look.layout;
  const strip = useStripRoom(layout === "strip" && info.on.progress, [view.division, view.toNext, info.on.division, look.font]);
  const details = layout ? detailsFor(layout, info, has, worldBig, layout === "strip" && !strip.fits ? ["progress"] : []) : [];
  // Tonight's run and last 10 under the number (Strip, Sticker), when picked there.
  const under = layout ? underPieces(info, layout).filter((p) => has(p)) : [];
  const slots = layout ? fitSlots(details, LAYOUT_SPOTS[layout].slots) : { shown: [], turns: [] };
  const at = useTurn(slots.turns.length);
  const turn = slots.turns.length ? slots.turns[at] : null;
  const ctx: PieceCtx = { view, info, goal: g, flame: m.streak && view.streak >= 3 };

  const vars = cardVars(look, div, fx.glyphs, view.pct);
  const cls = cardClass(look, fit, className);
  const game = MMR_GAMES[view.game];
  const summary = cardSummary(view, info, g, [...details, ...under, ...(["last10", "recent", "streak", "delta"] as MmrPiece[]).filter((p) => on(p) && !details.includes(p) && !under.includes(p))]);

  const fxLayers = <FxLayers fx={fx} />;
  const emblem = <span className={`mmr-emb${look.emblem === "name" ? " mmr-emb--name" : look.emblem === "off" ? " mmr-emb--off" : ""}`}><MmrEmblem d={div} frame={look.emblem} avatar={view.avatar} /></span>;
  const flag = info.on.cc && view.country ? <CountryTag code={view.country} mode={look.country} /> : null;
  // The chat line only when the bot would answer and the look keeps it.
  const chatLine = chat && info.chat;
  const big = <MmrNumber value={worldBig ? view.worldRank : view.mmr} prefix={worldBig ? "#" : ""} mode={m.roll ? look.number : "still"} />;
  // World rank's own spot (deck and panel): MMR goes there when world rank is the big number.
  const worldSpot = worldBig ? (info.on.mmr && view.mmr != null ? <span className="mmr-world">{fmtMmr(view.mmr)} MMR</span> : null) : info.on.world ? <World rank={view.worldRank} /> : null;
  const pendingChip = pending ? <span className="mmr-chip mmr-chip--pending"><IconClock aria-hidden />{placeWord(pending.place)}: about {signed(pending.delta)}, waiting to verify</span> : null;
  const newPeak = m.peak && view.last?.peak ? <span key={`peak-${view.peak}`} className="mmr-chip mmr-chip--peak mmr-chip--pop"><IconStarFilled aria-hidden />New peak</span> : null;
  // The flame on its own, when the streak isn't a piece on this card.
  const flameAlone = (shownStreak: boolean) => (!shownStreak && ctx.flame ? <StreakChip n={view.streak} flame /> : null);
  /** The slots' chips: the ones that stay, then the slot that takes turns. */
  const chipSlots = (
    <>
      {slots.shown.map((p) => <PieceChip key={p} p={p} c={ctx} />)}
      {turn && <span className="mmr-turn" key={`turn-${turn}`}><PieceChip p={turn} c={ctx} /><Dots n={slots.turns.length} at={at} /></span>}
    </>
  );
  const recentOn = on("recent");
  const recentRows = recentOn ? Math.min(info.recent, view.recent.length) : 0;

  let body: React.ReactNode;
  if (recap) {
    const best = recap.best ? `${recap.best.place ? placeWord(recap.best.place) : "Win"}${recap.best.format === "FFA" ? "" : ` (${recap.best.format})`}, ${signed(recap.best.delta)}` : "None yet";
    body = (
      <div className="mmr-panel mmr-skin mmr-recap">
        {fxLayers}
        <div className="mmr-c">
          <div className="mmr-panel__top"><span className="mmr-eyebrow">Tonight in {game.short}</span><span className="mmr-eyebrow">{view.name}</span></div>
          <div className="mmr-panel__main">
            {emblem}
            <div className="mmr-recap__big"><b>{recap.events ? signed(recap.net) : "0"}</b><span>{recap.events ? `${recap.wins} ${recap.wins === 1 ? "win" : "wins"}, ${recap.losses} ${recap.losses === 1 ? "loss" : "losses"}` : "No events yet tonight"}</span></div>
          </div>
          <div className="mmr-panel__cells">
            <div className="mmr-cell"><i><IconStar aria-hidden /></i><span><small>Best event</small><b>{best}</b></span></div>
            <div className="mmr-cell"><i><IconChartLine aria-hidden /></i><span><small>Now</small><b>{recap.mmr != null ? fmtMmr(recap.mmr) : "?"} · {recap.division}</b></span></div>
            <div className="mmr-cell"><i><IconChevronsUp aria-hidden /></i><span><small>New division</small><b>{recap.newDivisions.length ? recap.newDivisions[recap.newDivisions.length - 1] : "None tonight"}</b></span></div>
            <div className="mmr-cell"><i><IconFlag aria-hidden /></i><span><small>Tonight&apos;s events</small><Squares marks={recap.squares.slice(-10)} /></span></div>
          </div>
          <div className="mmr-panel__foot">{chatLine && <span>Type !tonight in chat</span>}{g && <span className="mmr-chips"><GoalChip g={g} /></span>}<Brand brand={look.brand} /></div>
        </div>
      </div>
    );
  } else if (look.layout === "panel") {
    const streakShown = on("streak");
    body = (
      <div className="mmr-panel mmr-skin">
        {fxLayers}
        <div className="mmr-c">
          {(info.on.game || worldSpot) && (
            <div className="mmr-panel__top"><span className="mmr-eyebrow">{info.on.game ? game.short : ""}</span><span className="mmr-eyebrow">{worldSpot}</span></div>
          )}
          <div className="mmr-panel__main">
            {emblem}
            <div className="mmr-panel__who">
              {(info.on.name || flag) && <span className="mmr-panel__name">{info.on.name && <span>{view.name}</span>}{flag}</span>}
              {info.on.division && <span className="mmr-panel__div">{view.division}</span>}
            </div>
            <div className="mmr-panel__num">{big}{info.on.delta && <Delta last={view.last} place />}</div>
          </div>
          {details.length > 0 && (
            <div className={`mmr-panel__cells mmr-cells-${Math.min(6, slots.shown.length + (turn ? 1 : 0))}`}>
              {slots.shown.map((p) => <PieceTile key={p} p={p} c={ctx} />)}
              {turn && <div className="mmr-turn mmr-turn--tile" key={`turn-${turn}`}><PieceTile p={turn} c={ctx} dots={<Dots n={slots.turns.length} at={at} />} /></div>}
            </div>
          )}
          {recentOn && <Recent view={view} n={info.recent} />}
          <div className="mmr-panel__foot">
            {chatLine && <span>Type !mmr in chat</span>}
            <span className="mmr-chips">
              {on("goal") && <GoalChip g={g} />}
              {pendingChip}
              {streakShown ? <StreakChip n={view.streak} flame={ctx.flame} /> : flameAlone(false)}
              {newPeak}
            </span>
            <Brand brand={look.brand} />
          </div>
        </div>
      </div>
    );
  } else if (look.layout === "strip") {
    const slot = slots.shown.length ? <PieceChip p={slots.shown[0]} c={ctx} short /> : turn ? <span className="mmr-turn" key={`turn-${turn}`}><PieceChip p={turn} c={ctx} short /><Dots n={slots.turns.length} at={at} /></span> : null;
    // A long line of your own can wrap to two lines: the slot keeps room for both so taking turns doesn't jump.
    const twoLines = details.includes("line") && info.line.length > 18;
    body = (
      <div className="mmr-strip mmr-skin">
        {fxLayers}
        <div className="mmr-c">
          {emblem}
          <div className="mmr-strip__who">
            {(info.on.name || flag) && <span className="mmr-strip__name">{info.on.name && <span>{view.name}</span>}{flag}</span>}
            {(info.on.division || info.on.progress) && <span className="mmr-strip__div" ref={strip.lineRef}>{info.on.division && <b>{view.division}</b>}{info.on.progress && <span ref={strip.progRef} className={strip.fits ? undefined : "mmr-strip__off"}>{toNextText(view)}</span>}</span>}
            {slot && <span className={`mmr-strip__slot${twoLines ? " mmr-strip__slot--two" : ""}`}>{slot}</span>}
          </div>
          {on("last10") && !under.includes("last10") && <div className="mmr-strip__sq"><small>Last 10</small><Squares marks={view.squares} five /></div>}
          <div className="mmr-strip__num">{big}{info.on.delta && <Delta last={view.last} place={false} />}<UnderLine pieces={under} view={view} /></div>
          <Brand brand={look.brand} />
        </div>
      </div>
    );
  } else if (look.layout === "sticker") {
    const slot = slots.shown.length ? <PieceChip p={slots.shown[0]} c={ctx} /> : turn ? <span className="mmr-turn" key={`turn-${turn}`}><PieceChip p={turn} c={ctx} /><Dots n={slots.turns.length} at={at} /></span> : null;
    body = (
      <div className="mmr-sticker mmr-skin">
        {fxLayers}
        <div className="mmr-c">
          {emblem}
          {big}
          <UnderLine pieces={under} view={view} />
          {(info.on.name || flag || info.on.division) && (
            <span className="mmr-sticker__name">{info.on.name && view.name}{flag}{(info.on.name || flag) && info.on.division ? " · " : ""}{info.on.division && <b>{view.division}</b>}</span>
          )}
          {slot}
        </div>
        {info.on.delta && <Delta last={view.last} place={false} />}
        <Brand brand={look.brand} />
      </div>
    );
  } else {
    const progress = info.on.progress;
    const streakShown = details.includes("streak");
    // Nothing set for the foot (no details, progress or world rank): the card fits what's on it, keeping one row for
    // the chips that come and go (a pending table, the flame, a new peak) so its height never changes on stream.
    const short = !progress && !worldSpot && details.length === 0;
    body = (
      <div className={`mmr-deck${short ? " mmr-deck--short" : ""}`} style={recentRows && !short ? { aspectRatio: `640 / ${392 + recentRows * 34}` } : undefined}>
        <span className="mmr-deck__ghost mmr-deck__ghost--1" aria-hidden="true" />
        <span className="mmr-deck__ghost mmr-deck__ghost--2" aria-hidden="true" />
        <div className="mmr-deck__card mmr-skin">
          {fxLayers}
          <div className="mmr-c">
            <div className="mmr-deck__head">
              {emblem}
              <div className="mmr-deck__who">
                {(info.on.game || info.on.division) && (
                  <span className="mmr-deck__labels">
                    {info.on.game && <span className="mmr-eyebrow">{game.short}</span>}
                    {info.on.division && <span className="mmr-eyebrow mmr-deck__div">{view.division}</span>}
                  </span>
                )}
                {(info.on.name || flag) && <span className="mmr-deck__name">{info.on.name && <span>{view.name}</span>}{flag}</span>}
              </div>
              <Brand brand={look.brand} />
            </div>
            <div className="mmr-deck__mid">
              <div className="mmr-deck__num">{big}{info.on.delta && <Delta last={view.last} place />}</div>
              {on("last10") && <div className="mmr-deck__l10"><span className="mmr-eyebrow">Last 10</span><Squares marks={view.squares} /></div>}
            </div>
            {recentOn && <Recent view={view} n={info.recent} />}
            <div className="mmr-deck__foot">
              <span className="mmr-chips">
                {pendingChip}
                {chipSlots}
                {flameAlone(streakShown)}
                {newPeak}
              </span>
              {progress && <div className="mmr-bar"><i /></div>}
              {(progress || worldSpot) && <div className="mmr-bar-txt">{progress && <span>{toNextText(view)}</span>}{worldSpot && <span className="mmr-bar-txt__end">{worldSpot}</span>}</div>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cls} data-layout={recap ? "panel" : look.layout} style={vars}>
      <FontLink look={look} />
      <span className="mmr-sr">{recap ? `${view.name} tonight: ${recap.events} events, ${recap.wins}-${recap.losses}, ${signed(recap.net)}. Now ${recap.mmr != null ? fmtMmr(recap.mmr) : "no MMR"}, ${recap.division}.` : summary}</span>
      <div className="mmr-moment" ref={momentRef} aria-hidden="true">
        {body}
        <BrandTab brand={look.brand} />
      </div>
    </div>
  );
}
