"use client";

/**
 * Today on the signed-in home (dailies + explore picks 2026-11-05, all A; context + rooms picks the same day, 3A and
 * 4A, https://claude.ai/artifact/APK5x7mRj9Ldvt7a8J7g4T).
 *
 * Each daily is a slide in its own colors over its glyph field, in one of three states: nobody's played yet (be first,
 * or race a friend with your invite link), others have (how many, the fastest with a crown), or you've played (your
 * place today, who leads, and a friend who hasn't played yet to challenge). Two show side by side from tablets up.
 * "Today's board" (your people on each daily by time, the fastest crowned, Nudge for friends who haven't played) sits
 * in the people rail (`TodayBoard`). Once every daily is done the spot becomes a quiet strip (your results in each
 * daily's color, when new ones come) and "Next for you" becomes a row of its own: three picture cards by what you
 * play, nothing behind them.
 *
 * Both read one `TodayLiveProvider`: it asks for fresh numbers every 3 minutes while the page is on screen; a friend
 * who just finished shows once ("Just now"), and screen readers hear it.
 */

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Avatar, Button, CarouselItem, Tabs } from "@empac/cascadeds";
import { IconArrowsShuffle, IconBell, IconCheck, IconClock, IconCrown, IconFlame, IconPokeball, IconSend, IconSwords, type Icon } from "@tabler/icons-react";
import { LabeledCarousel } from "@/components/ui/LabeledCarousel";
import { TrainerArt } from "@/components/originals/duel/TrainerArt";
import { IconField } from "@/components/events/EventHeaderArt";
import { useToast } from "@/components/toast/ToastProvider";
import { HappeningCard } from "./HappeningBand";
import { useQuickStart } from "./QuickStart";
import { RollNum } from "./RollNum";
import { EVENTS, track } from "@/lib/analytics/events";
import type { TodayGame } from "@/lib/home/forYou";
import type { TodayLive as Live, PersonDay, PulseGame } from "@/lib/home/dailyPulse";
import type { Pick } from "@/lib/home/nextPicks";

const GLYPH: Record<TodayGame["id"], Icon> = { shuffle: IconArrowsShuffle, dex: IconPokeball, fire: IconFlame, duel: IconSwords };
const FIELD = { shuffle: "daily", dex: "dex", fire: "fire", duel: "duel" } as const;
const SHORT: Record<PulseGame, string> = { shuffle: "Shuffle", dex: "Dex", fire: "Fire Round", duel: "Duel" };
const CHECK_MS = 3 * 60_000;

function Squares({ marks, small = false }: { marks: NonNullable<TodayGame["squares"]>; small?: boolean }) {
  return (
    <span className={`room-squares${small ? " room-squares--small" : ""}`} aria-hidden="true">
      {marks.map((m, i) => <i key={i} className={`room-sq room-sq--${m}`} />)}
    </span>
  );
}

const face = (name: string, avatar: string | null, size: "xsmall" | "small" = "xsmall") =>
  <Avatar size={size} src={avatar ?? undefined} initials={name.slice(0, 1).toUpperCase()} alt="" />;

/** Dailies already stamped on this browser today, so a finished one is stamped (with a pop) only the first time it's seen. */
const STAMP_KEY = "gs-today-stamped";

// ─── the live numbers, shared by the slides and the rail's board ─────────────

interface LiveCtx {
  live: Live | null;
  day: string;
  /** A friend who just finished ("game:userId"), shown once. */
  fresh: string | null;
  nudged: Set<string>;
  nudge: (game: PulseGame, to: string, name: string) => void;
  say: (text: string) => void;
}
const TodayCtx = createContext<LiveCtx | null>(null);
const useToday = () => useContext(TodayCtx);

export function TodayLiveProvider({ initial, day, children }: { initial: Live | null; day: string; children: ReactNode }) {
  const toast = useToast();
  const [live, setLive] = useState<Live | null>(initial);
  const [fresh, setFresh] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const [nudged, setNudged] = useState<Set<string>>(() => new Set(initial?.nudged ?? []));

  // Fresh numbers every 3 minutes while the page is on screen; a friend who just finished shows once.
  const seenRef = useRef<Set<string>>(new Set(Object.entries(initial?.people ?? {}).flatMap(([g, rows]) => rows.map((r) => `${g}:${r.userId}`))));
  useEffect(() => {
    if (!initial) return;
    let stop = false;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      const r = await fetch("/api/home/today", { cache: "no-store" }).catch(() => null);
      if (!r?.ok || stop) return;
      const next = (await r.json().catch(() => null)) as Live | null;
      if (!next || next.day !== day) return;
      const arrived: { game: PulseGame; row: PersonDay }[] = [];
      for (const [g, rows] of Object.entries(next.people) as [PulseGame, PersonDay[]][]) {
        for (const row of rows) {
          const key = `${g}:${row.userId}`;
          if (!seenRef.current.has(key)) { seenRef.current.add(key); if (!row.you) arrived.push({ game: g, row }); }
        }
      }
      setLive(next);
      const first = arrived[0];
      if (first) {
        setFresh(`${first.game}:${first.row.userId}`);
        setSaid(`${first.row.name} just ${first.game === "fire" ? `scored ${first.row.value} on` : first.row.solved ? "finished" : "played"} today's ${SHORT[first.game]}`);
      }
    };
    const t = window.setInterval(() => void check(), CHECK_MS);
    return () => { stop = true; window.clearInterval(t); };
  }, [initial, day]);

  async function nudge(game: PulseGame, to: string, name: string) {
    if (nudged.has(to)) return;
    setNudged((s) => new Set(s).add(to));
    const r = await fetch("/api/daily/nudge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, game }) }).catch(() => null);
    if (!r || (!r.ok && r.status !== 409)) {
      setNudged((s) => { const n = new Set(s); n.delete(to); return n; });
      toast.error("That didn't send. Try again.");
      return;
    }
    track(EVENTS.homeSectionClicked, { to: `nudge-${game}`, from: "home-today" });
    setSaid(`Sent ${name} a nudge`);
  }

  return (
    <TodayCtx.Provider value={{ live, day, fresh, nudged, nudge: (g, to, name) => void nudge(g, to, name), say: setSaid }}>
      {children}
      <p className="sr-only" role="status" aria-live="polite">{said}</p>
    </TodayCtx.Provider>
  );
}

// ─── Today: the slides, or the done strip and Next for you ───────────────────

export function TodayLive({ games, weekly, streak, streakFrom, picks, race, resetAt, eye }: {
  games: TodayGame[];
  weekly: { line: string; action: string } | null;
  streak: number;
  streakFrom: number | null;
  /** The three picks once every daily is done. */
  picks: Pick[];
  /** Your invite link to each daily (Race a friend). */
  race: Partial<Record<PulseGame, string>>;
  /** Midnight Pacific, when new dailies come. */
  resetAt: string;
  /** "On my profile" for the daily streaks: under the slides, or in the done strip's head. */
  eye?: ReactNode;
}) {
  const toast = useToast();
  const ctx = useToday();
  const live = ctx?.live ?? null;
  const day = ctx?.day ?? "";
  const nudged = ctx?.nudged ?? new Set<string>();
  const nudge = (g: PulseGame, to: string, name: string) => ctx?.nudge(g, to, name);
  const { start, window: startWindow } = useQuickStart("home-today");

  // Stamps: a finished daily pops the first time this browser sees it today.
  const [popping, setPopping] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    let seen: string[] = [];
    try { seen = (localStorage.getItem(STAMP_KEY) ?? "").split(",").filter((x) => x.startsWith(`${day}:`)); } catch { /* private mode */ }
    const done = games.filter((g) => g.done && !seen.includes(`${day}:${g.id}`)).map((g) => g.id);
    if (!done.length) return;
    try { localStorage.setItem(STAMP_KEY, [...seen, ...done.map((id) => `${day}:${id}`)].join(",")); } catch { /* private mode */ }
    const t = window.setTimeout(() => setPopping(new Set(done)), 0);
    return () => window.clearTimeout(t);
  }, [games, day]);

  async function raceFriend(game: PulseGame) {
    const link = race[game];
    if (!link) return;
    const text = `Race me on today's ${SHORT[game]} on GameShuffle. Same puzzle for both of us.`;
    track(EVENTS.homeSectionClicked, { to: `race-${game}`, from: "home-today" });
    try { if (navigator.share) { await navigator.share({ text, url: link }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(`${text}\n${link}`); toast.success("Link copied. Send it to a friend."); }
    catch { toast.error(`Couldn't copy. Your link is ${link}`); }
  }

  const allDone = games.length > 0 && games.every((g) => g.done);
  const ordered = [...games.filter((g) => !g.done), ...games.filter((g) => g.done)];
  const best = games.reduce<TodayGame | null>((b, g) => (g.streak > (b?.streak ?? 0) ? g : b), null);
  const left = games.filter((g) => !g.done).length;

  const slide = (g: TodayGame, k: number) => {
    const pulse = live?.pulse[g.id];
    // Your people's rows live on the board below; the slide shows them only when there's no board (you follow nobody).
    const mine = live && live.following === 0 ? live.people[g.id].filter((r) => !r.you).slice(0, 2) : [];
    const waiting = live?.waiting[g.id].find((w) => !nudged.has(w.userId));
    const place = live?.you[g.id];
    const state = g.done ? "done" : pulse && pulse.total > 0 ? "open" : "fresh";
    const primary = g.done ? "See your result" : state === "fresh" ? "Be first" : g.action === "Play" ? "Your turn" : g.action;
    return (
      <div className={`room-day room-day--${g.id} room-day--${state}${g.picture ? " room-day--art" : ""}`}>
        {g.picture ? <TrainerArt picture={g.picture} shape="banner" className="room-day__art" /> : <IconField category={FIELD[g.id]} seed={`${g.id}-${day}`} opacity={0.09} className="room-day__field" />}
        <span className="room-day__top">
          <span className="room-day__kick">{k === 0 ? (left ? `Today · ${left} to play` : "Today · all played") : "Today"}</span>
          {g.streak >= 2 && (
            <span className={`room-day__streak${g.streak >= 3 ? " room-streak--hot" : ""}`}>
              <IconFlame size={18} stroke={2} aria-hidden="true" />
              <span>{best?.id === g.id ? <RollNum value={streak} from={streakFrom} /> : g.streak}-day streak</span>
            </span>
          )}
        </span>
        <span className="room-day__body">
          <b className="room-day__name">{g.name}</b>
          {state === "fresh" && (
            <>
              <span className="room-day__big">Nobody&apos;s played yet</span>
              <span className="room-day__line">Solve it first and you lead the day.</span>
            </>
          )}
          {state === "open" && pulse && (
            <>
              <span className="room-day__big"><RollNum value={pulse.total} from={null} /> played</span>
              {pulse.top && <TopChip game={g.id} top={pulse.top} />}
              {mine.length > 0 && (
                <ul className="room-day__ppl" aria-label="Your people on it">
                  {mine.map((r) => (
                    <li key={r.userId}>{face(r.name, r.avatar)}<span className="room-day__who">{r.name}</span>{r.squares && <Squares marks={r.squares} small />}<b>{r.value}</b></li>
                  ))}
                </ul>
              )}
              {!mine.length && !pulse.top && <span className="room-day__line">{g.line}</span>}
            </>
          )}
          {state === "done" && (
            <>
              {g.squares && <Squares marks={g.squares} />}
              <span className="room-day__line">{g.line}</span>
              {place && <span className="room-day__place">{ordinal(place.place)} of {place.total.toLocaleString("en-US")} today</span>}
              {pulse?.top && <TopChip game={g.id} top={pulse.top} />}
            </>
          )}
        </span>
        <span className="room-day__acts">
          <Link href={g.href} className="room-day__act">{primary}<span className="sr-only">: {g.name}</span></Link>
          {state === "fresh" && race[g.id] && (
            <button type="button" className="room-day__alt" onClick={() => void raceFriend(g.id)}><IconSend size={16} stroke={2} aria-hidden="true" />Race a friend</button>
          )}
          {state === "done" && waiting && (
            <button type="button" className="room-day__alt" onClick={() => void nudge(g.id, waiting.userId, waiting.name)}><IconSend size={16} stroke={2} aria-hidden="true" />Challenge {waiting.name}</button>
          )}
        </span>
        {g.done && <span className={`room-day__stamp${popping.has(g.id) ? " room-day__stamp--pop" : ""}`} aria-hidden="true"><IconCheck size={28} stroke={3} /></span>}
      </div>
    );
  };

  if (allDone) {
    return (
      <>
        <DoneStrip games={games} streak={streak} resetAt={resetAt} popping={popping} eye={eye} />
        {picks.length > 0 && <NextForYou picks={picks} onStart={start} />}
        {startWindow}
      </>
    );
  }
  return (
    <div className="room-today">
      <LabeledCarousel label="Today's daily games" wrapperClassName="room-today__carousel" slidesToShow={{ mobile: 1, tablet: 2, desktop: 2 }} gap={16} showArrows showDots arrowPosition="bottom" loop>
        {ordered.map((g, k) => <CarouselItem key={g.id}>{slide(g, k)}</CarouselItem>)}
        {weekly ? [
          <CarouselItem key="weekly">
            <Link href="/weekly" className="room-day room-day--weekly room-day--link">
              <IconField category="weekly" seed={`weekly-${day}`} opacity={0.09} className="room-day__field" />
              <span className="room-day__top"><span className="room-day__kick">This week</span></span>
              <span className="room-day__body">
                <b className="room-day__name">Weekly Challenge</b>
                <span className="room-day__line">{weekly.line.replace(/^Weekly Challenge · /, "")}</span>
              </span>
              <span className="room-day__acts"><span className="room-day__act">{weekly.action}</span></span>
            </Link>
          </CarouselItem>,
        ] : []}
      </LabeledCarousel>
      {eye}
      {startWindow}
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n.toLocaleString("en-US")}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/** The day's best on a slide: the fastest, the top score or the leader, with a crown. */
function TopChip({ game, top }: { game: PulseGame; top: NonNullable<Live["pulse"][PulseGame]["top"]> }) {
  const what = game === "fire" ? "Top score" : game === "duel" ? "Leading" : "Fastest";
  return (
    <span className="room-day__crown">
      <IconCrown size={16} stroke={2} aria-hidden="true" />
      {face(top.you ? "You" : top.name, top.avatar)}
      <span>{what} {top.value}, {top.you ? "you" : top.name}</span>
    </span>
  );
}

/**
 * "Today's board" in the people rail: the people you follow on each daily by time, you included, the fastest crowned;
 * friends who haven't played get Nudge. Only when you follow someone (the slides show the day's best otherwise).
 */
export function TodayBoard({ games }: { games: PulseGame[] }) {
  const ctx = useToday();
  const live = ctx?.live;
  if (!ctx || !live || live.following === 0) return null;
  const { fresh, nudged, nudge } = ctx;
  const first = games.find((g) => live.people[g].length > 1) ?? games.find((g) => live.people[g].length) ?? games[0];
  const tabs = games.map((g) => {
    const rows = live.people[g];
    const waiting = live.waiting[g];
    return {
      id: g,
      label: SHORT[g],
      content: (
        <div className="ptoday__list">
          {rows.length === 0 && waiting.length === 0 && <p className="ptoday__empty">Nobody you follow has played today&apos;s {SHORT[g]} yet.</p>}
          {rows.length > 0 && (
            <ol className="ptoday__rows">
              {rows.map((r, i) => (
                <li key={r.userId} className={`ptoday__row${r.you ? " ptoday__row--you" : ""}${fresh === `${g}:${r.userId}` ? " ptoday__row--fresh" : ""}`}>
                  <span className="ptoday__place">{i + 1}</span>
                  {face(r.name, r.avatar, "small")}
                  <span className="ptoday__name">
                    {r.profile && !r.you ? <Link href={r.profile}>{r.name}</Link> : r.name}
                    {fresh === `${g}:${r.userId}` && <span className="ptoday__just">Just now</span>}
                  </span>
                  {r.squares && <Squares marks={r.squares} small />}
                  <span className={`ptoday__value${r.crown ? " ptoday__value--crown" : ""}`}>
                    {r.crown && <><IconCrown size={16} stroke={2} aria-hidden="true" /><span className="sr-only">Fastest of your people: </span></>}
                    {r.value}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {waiting.length > 0 && (
            <ul className="ptoday__rows ptoday__rows--waiting" aria-label="Not played yet">
              {waiting.map((w) => (
                <li key={w.userId} className="ptoday__row">
                  <span className="ptoday__place" aria-hidden="true">·</span>
                  {face(w.name, w.avatar, "small")}
                  <span className="ptoday__name">{w.name}<span className="ptoday__not">not yet</span></span>
                  {nudged.has(w.userId)
                    ? <span className="ptoday__sent"><IconCheck size={16} stroke={2.5} aria-hidden="true" />Nudged</span>
                    : <Button variant="ghost" size="small" iconBefore={IconBell} onClick={() => nudge(g, w.userId, w.name)}>Nudge<span className="sr-only"> {w.name}</span></Button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      ),
    };
  });
  return (
    <section className="room-tile room-rail__block ptoday" aria-labelledby="ptoday-title">
      <div className="room-tile__head">
        <h2 id="ptoday-title">Today&apos;s board</h2>
      </div>
      <Tabs tabs={tabs} variant="pills" defaultActiveTab={first} className="ptoday__tabs" />
    </section>
  );
}

/** "Shuffle in 3", "Fire Round 1,240", "Duel in 9 turns": a stamp's words (the full line is read out). */
function stampText(g: TodayGame): string {
  const solved = g.line.match(/^Solved in (\d+)/);
  if (solved) return `${SHORT[g.id]} in ${solved[1]}`;
  const won = g.line.match(/^Won in (\d+ turns?)/);
  if (won) return `${SHORT[g.id]} in ${won[1]}`;
  if (g.id === "fire") return `${SHORT[g.id]} ${g.line.split(" · ")[0]}`;
  return `${SHORT[g.id]}: ${g.line}`;
}

/** All done (context picks 3A): one quiet strip, your results in each daily's color and when new ones come. */
function DoneStrip({ games, streak, resetAt, popping, eye }: { games: TodayGame[]; streak: number; resetAt: string; popping: Set<string>; eye?: ReactNode }) {
  const [left, setLeft] = useState(() => untilText(resetAt));
  useEffect(() => {
    const t = window.setInterval(() => setLeft(untilText(resetAt)), 60_000);
    return () => window.clearInterval(t);
  }, [resetAt]);
  return (
    <section className="room-tile room-strip" aria-labelledby="room-done-title">
      <div className="room-strip__head">
        <h2 id="room-done-title">Done for today</h2>
        {streak >= 2 && <span className="room-strip__streak"><IconFlame size={18} stroke={2} aria-hidden="true" />{streak}-day streak</span>}
      </div>
      <ul className="room-strip__stamps" aria-label="Today's results">
        {games.map((g) => {
          const Glyph = GLYPH[g.id];
          return (
            <li key={g.id} className={`room-stamp room-stamp--${g.id}${popping.has(g.id) ? " room-stamp--pop" : ""}`}>
              <Glyph size={16} stroke={2} aria-hidden="true" />
              <span aria-hidden="true">{stampText(g)}</span>
              <span className="sr-only">{g.name}: {g.line}</span>
            </li>
          );
        })}
      </ul>
      <span className="room-strip__foot">
        <span className="room-strip__next"><IconClock size={16} stroke={2} aria-hidden="true" />New dailies in {left}</span>
        {eye}
      </span>
    </section>
  );
}

/** "Next for you": three picture cards by what you play, a row of their own with nothing behind them (3A). */
function NextForYou({ picks, onStart }: { picks: Pick[]; onStart: (g: NonNullable<Pick["start"]>) => void }) {
  return (
    <section className="room-next" aria-labelledby="room-next-title">
      <div className="room-next__head">
        <h2 id="room-next-title">Next for you</h2>
        <span>By what you play</span>
      </div>
      <ul className={`room-next__row room-next__row--${picks.length}`}>
        {picks.map((p, k) => (
          <li key={p.id}><HappeningCard h={p} from="home-done" k={k} track="next" onPress={p.start ? () => onStart(p.start!) : undefined} /></li>
        ))}
      </ul>
    </section>
  );
}

function untilText(iso: string): string {
  const ms = Math.max(0, Date.parse(iso) - Date.now());
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000);
  return h ? `${h}h ${m}m` : `${m}m`;
}
