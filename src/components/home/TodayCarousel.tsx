"use client";

/**
 * Today on the signed-in home (dailies + explore picks 2026-11-05, all A; context + rooms picks the same day, 3A and
 * 4A, https://claude.ai/artifact/APK5x7mRj9Ldvt7a8J7g4T).
 *
 * Each daily is a small tile in its own colors over its glyph field, all in view at once with the Weekly across the
 * foot (home cleanup picks 2026-11-07, 6A: no carousel). One line says where the day stands: nobody's played yet, how
 * many have, or your place today. Tap a tile to play. Two to a row on phones, one row from tablets up.
 * "Today's board" (your people on each daily by time, the fastest crowned, Nudge for friends who haven't played) sits
 * in the people rail (`TodayBoard`). Once every daily is done the spot becomes a quiet strip (your results in each
 * daily's color, when new ones come) and "Next for you" becomes a row of its own: three picture cards by what you
 * play, nothing behind them.
 *
 * Both read one `TodayLiveProvider`: it asks for fresh numbers every 3 minutes while the page is on screen; a friend
 * who just finished shows once ("Just now"), and screen readers hear it.
 */

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Avatar, Button, Tabs } from "@empac/cascadeds";
import { IconArrowsShuffle, IconBell, IconCheck, IconClock, IconCrown, IconFlame, IconPokeball, IconSwords, type Icon } from "@tabler/icons-react";
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

export function TodayLive({ games, weekly, streak, streakFrom, picks, resetAt }: {
  games: TodayGame[];
  weekly: { line: string; action: string } | null;
  streak: number;
  streakFrom: number | null;
  /** The three picks once every daily is done. */
  picks: Pick[];
  /** Midnight Pacific, when new dailies come. */
  resetAt: string;
}) {
  const ctx = useToday();
  const live = ctx?.live ?? null;
  const day = ctx?.day ?? "";
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

  const allDone = games.length > 0 && games.every((g) => g.done);
  const ordered = [...games.filter((g) => !g.done), ...games.filter((g) => g.done)];
  const best = games.reduce<TodayGame | null>((b, g) => (g.streak > (b?.streak ?? 0) ? g : b), null);
  const left = games.filter((g) => !g.done).length;

  // A small tile per daily (home cleanup picks 2026-11-07, 6A): its colors, its name and one line; the tile is the link.
  const tile = (g: TodayGame, k: number) => {
    const pulse = live?.pulse[g.id];
    const place = live?.you[g.id];
    const state = g.done ? "done" : pulse && pulse.total > 0 ? "open" : "fresh";
    const line = g.done
      ? (place ? `${ordinal(place.place)} of ${place.total.toLocaleString("en-US")} today` : g.line)
      : state === "open" && pulse ? `${pulse.total.toLocaleString("en-US")} played` : "Nobody's played yet";
    // On phones the dailies go two to a row; an odd one out takes the row.
    const odd = games.length % 2 === 1 && k === games.length - 1;
    return (
      <li key={g.id} className={odd ? "room-today__odd" : undefined}>
        <Link href={g.href} className={`room-day room-day--tile room-day--${g.id} room-day--${state}${g.picture ? " room-day--art" : ""}`}>
          {g.picture ? <TrainerArt picture={g.picture} shape="banner" className="room-day__art" /> : <IconField category={FIELD[g.id]} seed={`${g.id}-${day}`} opacity={0.09} className="room-day__field" />}
          <span className="room-day__kick">{k === 0 && left ? `Today · ${left} to play` : "Today"}</span>
          <span className="room-day__body">
            <b className="room-day__name">{g.name}</b>
            <span className="room-day__big">{line}</span>
            {g.streak >= 2 && (
              <span className={`room-day__streak${g.streak >= 3 ? " room-streak--hot" : ""}`}>
                <IconFlame size={16} stroke={2} aria-hidden="true" />
                <span>{best?.id === g.id ? <RollNum value={streak} from={streakFrom} /> : g.streak}-day streak</span>
              </span>
            )}
          </span>
          {g.done && <span className={`room-day__stamp${popping.has(g.id) ? " room-day__stamp--pop" : ""}`} aria-hidden="true"><IconCheck size={20} stroke={3} /></span>}
        </Link>
      </li>
    );
  };

  if (allDone) {
    return (
      <>
        <DoneStrip games={games} streak={streak} resetAt={resetAt} popping={popping} />
        {picks.length > 0 && <NextForYou picks={picks} onStart={start} />}
        {startWindow}
      </>
    );
  }
  return (
    <div className="room-today">
      <ul className="room-today__tiles" aria-label="Today's daily games" style={{ "--n": games.length } as CSSProperties}>
        {ordered.map(tile)}
        {weekly && (
          <li className="room-today__week">
            <Link href="/weekly" className="room-day room-day--tile room-day--row room-day--weekly">
              <IconField category="weekly" seed={`weekly-${day}`} opacity={0.09} className="room-day__field" />
              <span className="room-day__kick">This week</span>
              <b className="room-day__name">Weekly Challenge</b>
              <span className="room-day__line">{weekly.line.replace(/^Weekly Challenge · /, "")}</span>
            </Link>
          </li>
        )}
      </ul>
      {startWindow}
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n.toLocaleString("en-US")}${s[(v - 20) % 10] || s[v] || s[0]}`;
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
                  <span className="ptoday__place" aria-hidden="true" />
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
function DoneStrip({ games, streak, resetAt, popping }: { games: TodayGame[]; streak: number; resetAt: string; popping: Set<string> }) {
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
      </span>
    </section>
  );
}

/** "Next for you": three picture cards by what you play, a row of their own with nothing behind them (3A). */
function NextForYou({ picks, onStart, title = "Next for you", sub = "By what you play" }: { picks: Pick[]; onStart: (g: NonNullable<Pick["start"]>) => void; title?: string; sub?: string | null }) {
  return (
    <section className="room-next" aria-labelledby="room-next-title">
      <div className="room-next__head">
        <h2 id="room-next-title">{title}</h2>
        {sub && <span>{sub}</span>}
      </div>
      <ul className={`room-next__row room-next__row--${picks.length}`}>
        {picks.map((p, k) => (
          <li key={p.id}><HappeningCard h={p} from="home-done" k={k} track="next" onPress={p.start ? () => onStart(p.start!) : undefined} /></li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Play next (Home in five blocks, picks 2026-11-09): two picks, never more. One from what you play and one new thing
 * when both exist (the picks come as own, friends, new), else the first two.
 */
export function PlayNext({ picks }: { picks: Pick[] }) {
  const { start, window: startWindow } = useQuickStart("home-next");
  const fresh = picks.find((p) => p.kicker === "Something new");
  const yours = picks.find((p) => p !== fresh);
  const two = yours && fresh ? [yours, fresh] : picks.slice(0, 2);
  if (!two.length) return null;
  return (
    <>
      <NextForYou picks={two} onStart={start} title="Play next" sub={null} />
      {startWindow}
    </>
  );
}

function untilText(iso: string): string {
  const ms = Math.max(0, Date.parse(iso) - Date.now());
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000);
  return h ? `${h}h ${m}m` : `${m}m`;
}
