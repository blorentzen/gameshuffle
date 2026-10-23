"use client";

/**
 * The Daily Duel on its page (picks 2026-10-21, https://claude.ai/artifact/5fdauqQ8MPof41oWXYcuPk).
 * Three screens:
 *   start   today's trainer, both sides' cards and Start (DuelStart), then the leaderboard.
 *   duel    the arena (DuelArena): today's Energy starts on your card on the field, so a move,
 *           Wait or a swap is one tap; the card picker when a card is needed; a running clock on
 *           the official duel.
 *   result  DuelEnd: the result, Share, Practice, Next up, streak, the board, today's cards.
 * The server (/api/daily-duel) holds every duel and checks each step with the engine; this page
 * only draws what it sends back, playing the difference one hit at a time (duelBeats.ts: your
 * move, their next card, their reply, then the new turn). A tap on the arena, or Escape, skips to
 * the end of the beats. Guests play as the dailies' guest id (x-daily-guest) and
 * join the boards with a name, like Fire Round. The official duel reports itself to the dailies'
 * today bar, Next up and streak cards.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast/ToastProvider";
import { DailyBoard, DailyBoardJoin, guestRequestId, storedGuestId, useDailyBoards } from "@/components/originals/DailyBoard";
import { EVENTS, track } from "@/lib/analytics/events";
import type { BoardView } from "@/lib/daily/boardTypes";
import { reportDaily, type DailiesEntry } from "@/lib/originals/dailies";
import type { DuelAct, DuelStep } from "@/lib/originals/duel/types";
import type { DuelCardView, DuelHome, DuelRunView } from "@/lib/originals/duel/view";
import { DuelArena } from "./DuelArena";
import { framesBetween, type Frame } from "./duelBeats";
import { DuelEnd } from "./DuelEnd";
import { DuelStart } from "./DuelStart";
import { DuelZoom } from "./DuelZoom";
import { setDuelCredit } from "./DuelPictureCredit";
import { reducedMotion } from "./duelLook";

/** How long the final picture holds before the result shows. */
const OVER_MS = 1400;

/** Today's official duel for the dailies' today bar, Next up, combined share and streak card. */
function duelEntry(h: DuelHome): DailiesEntry {
  const o = h.official;
  const done = o?.status === "done";
  return {
    day: h.day,
    number: h.number,
    state: done ? "done" : o ? "playing" : "fresh",
    duel: done && o?.result ? { won: o.result === "won", turns: o.turns, par: h.par, seconds: o.seconds } : null,
    stats: { played: h.history.played, won: h.history.won, streak: h.history.streak, best: h.history.best, fastest: h.history.fastest },
    recent: h.history.recent,
  };
}

/** Fetch with this browser's guest id (made when a duel starts, read-only otherwise). */
function duelFetch(path: string, init: RequestInit & { makeGuest?: boolean } = {}) {
  const { makeGuest, ...rest } = init;
  const id = makeGuest ? guestRequestId() : storedGuestId();
  // Development previews: /daily-duel?day=2026-11-20 plays that day's duel.
  const day = process.env.NODE_ENV === "development" && typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("day") : null;
  return fetch(path, { ...rest, headers: { ...(rest.headers ?? {}), ...(id ? { "x-daily-guest": id } : {}), ...(day ? { "x-duel-day": day } : {}), ...(rest.body ? { "Content-Type": "application/json" } : {}) } });
}

export function DailyDuel() {
  const toast = useToast();
  const [home, setHome] = useState<DuelHome | null>(null);
  const [failed, setFailed] = useState(false);
  /** The duel on screen (playing, just finished, or a practice result). */
  const [run, setRun] = useState<DuelRunView | null>(null);
  /** Today's finished official duel, for its result screen. */
  const [officialRun, setOfficialRun] = useState<DuelRunView | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  /** The arena holds on the final frame for a moment before the result shows. */
  const [holding, setHolding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [staging, setStaging] = useState(false);
  const [offset, setOffset] = useState(0);
  const [zoom, setZoom] = useState<{ card: DuelCardView; owner: string } | null>(null);
  const [boardRefresh, setBoardRefresh] = useState(0);
  const [today, setToday] = useState<BoardView | null>(null);
  const timers = useRef<number[]>([]);
  /** The beats still to play (cleared by a skip) and what runs once they're done. */
  const beatTimers = useRef<number[]>([]);
  const beatsLeft = useRef<{ last: Frame; done: () => void } | null>(null);
  const nonce = useRef(1);
  const frameRef = useRef<Frame | null>(null);
  useEffect(() => { frameRef.current = frame; }, [frame]);
  /** Duels already counted as finished (a refetch of a finished duel doesn't count it twice). */
  const finished = useRef(new Set<string>());

  useEffect(() => () => { for (const t of [...timers.current, ...beatTimers.current]) window.clearTimeout(t); }, []);
  const later = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); };

  /** Jumps to the end of the beats (a tap on the arena, or the last beat's time). */
  const endBeats = useCallback(() => {
    for (const t of beatTimers.current) window.clearTimeout(t);
    beatTimers.current = [];
    const left = beatsLeft.current;
    beatsLeft.current = null;
    if (!left) return;
    setFrame(left.last);
    setStaging(false);
    left.done();
  }, []);

  /** Plays an exchange's pictures: the first now, each after the one before has held its time. */
  const playFrames = useCallback((frames: Frame[], done: () => void) => {
    for (const t of beatTimers.current) window.clearTimeout(t);
    beatTimers.current = [];
    beatsLeft.current = null;
    setFrame(frames[0]);
    if (frames.length === 1) { setStaging(false); done(); return; }
    setStaging(true);
    beatsLeft.current = { last: frames[frames.length - 1], done };
    let at = 0;
    frames.slice(0, -1).forEach((f, i) => {
      at += f.ms;
      const next = frames[i + 1];
      beatTimers.current.push(window.setTimeout(i + 1 === frames.length - 1 ? endBeats : () => setFrame(next), at));
    });
  }, [endBeats]);

  const loadOfficial = useCallback(async (id: string) => {
    const res = await duelFetch(`/api/daily-duel/${id}`).catch(() => null);
    if (res?.ok) setOfficialRun(((await res.json()) as { run: DuelRunView }).run);
  }, []);

  const loadHome = useCallback(async (opts: { resume?: boolean } = {}) => {
    const res = await duelFetch("/api/daily-duel").catch(() => null);
    if (!res?.ok) { setFailed(true); return null; }
    const h = (await res.json()) as DuelHome;
    setHome(h);
    setDuelCredit(h.trainer?.picture?.credit ?? null);
    if (h.ready && h.trainer) reportDaily("duel", duelEntry(h));
    if (h.official?.status === "done") void loadOfficial(h.official.id);
    // A duel still in progress picks back up where it was.
    if (opts.resume && h.current) {
      setRun(h.current);
      setOffset(Date.parse(h.current.serverNow) - Date.now());
      setFrame(framesBetween(null, h.current.play, nonce.current++)[0]);
      setStaging(false);
    }
    return h;
  }, [loadOfficial]);
  useEffect(() => { void Promise.resolve().then(() => loadHome({ resume: true })); }, [loadHome]);

  const boards = useDailyBoards("duel", home ? home.signedIn : null);

  /** Takes the server's copy of the duel and plays the difference. */
  const take = useCallback((r: DuelRunView, opts: { fresh?: boolean; quiet?: boolean } = {}) => {
    const prev = opts.fresh ? null : frameRef.current?.play ?? null;
    setRun(r);
    setOffset(Date.parse(r.serverNow) - Date.now());
    const frames = framesBetween(prev, r.play, nonce.current, { quiet: opts.quiet });
    nonce.current += frames.length + 1;
    let done = () => {};
    if (r.status === "done" && !finished.current.has(r.id)) {
      finished.current.add(r.id);
      track(EVENTS.duelFinished, { won: r.result === "won", turns: r.turns, par: r.par ?? 0, official: r.official });
      setHolding(true);
      // The final picture holds a moment (the knockout, "You beat …"), then the result shows.
      done = () => later(reducedMotion() ? 0 : OVER_MS, () => {
        setHolding(false);
        requestAnimationFrame(() => {
          const el = document.getElementById("duel-result");
          if (!el) return;
          el.focus({ preventScroll: true });
          const top = el.getBoundingClientRect().top + window.scrollY - 88;
          window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? "auto" : "smooth" });
        });
      });
      if (r.official) setOfficialRun(r);
      setBoardRefresh((n) => n + 1);
      void loadHome();
    }
    playFrames(frames, done);
  }, [loadHome, playFrames]);

  const scrollToArena = () => requestAnimationFrame(() => {
    const top = document.querySelector(".duel-page .duel-arena")?.getBoundingClientRect().top;
    if (top !== undefined) window.scrollTo({ top: Math.max(0, window.scrollY + top - 80), behavior: reducedMotion() ? "auto" : "smooth" });
  });

  const start = useCallback(async (mode: "official" | "practice") => {
    if (busy) return;
    setBusy(true);
    const res = await duelFetch("/api/daily-duel", { method: "POST", makeGuest: true, body: JSON.stringify({ action: "start", mode }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const err = ((await res?.json().catch(() => ({}))) as { error?: string } | undefined)?.error;
      toast.error(err === "official_first" ? "Finish today's duel first: practice opens after it." : err === "not_ready" ? "Today's duel isn't ready yet. Try again in a moment." : err === "rate_limited" ? "Slow down a little, then try again." : "Couldn't start the duel. Try again in a moment.");
      return;
    }
    const body = (await res.json()) as { run: DuelRunView };
    if (mode === "official") track(EVENTS.duelStarted, { tier: body.run.trainer.tier });
    else track(EVENTS.duelPracticed, { tier: body.run.trainer.tier });
    setHolding(false);
    take(body.run, { fresh: true });
    scrollToArena();
  }, [busy, take, toast]);

  const send = useCallback(async (step: DuelStep) => {
    if (!run || busy || staging) return;
    setBusy(true);
    const res = await duelFetch(`/api/daily-duel/${run.id}`, { method: "POST", body: JSON.stringify(step) }).catch(() => null);
    if (res?.ok) {
      const body = (await res.json()) as { run: DuelRunView };
      setBusy(false);
      take(body.run);
      return;
    }
    const status = res?.status ?? 0;
    // Out of step with the server (two taps at once, another tab): take the server's copy.
    const fresh = await duelFetch(`/api/daily-duel/${run.id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { run: DuelRunView } | null;
    setBusy(false);
    if (fresh) take(fresh.run, { quiet: true });
    if (status === 422) toast.error("That isn't allowed right now.");
    else if (!fresh) toast.error("Couldn't send that. Check your connection.");
  }, [busy, run, staging, take, toast]);

  const onTurn = useCallback((attach: number, act: DuelAct, use?: number) => void send(use != null ? { attach, act, use } : { attach, act }), [send]);
  const onNext = useCallback((card: number) => void send({ next: card }), [send]);
  const onBring = useCallback((cards: number[]) => void send({ bring: cards }), [send]);
  const onZoom = useCallback((card: DuelCardView, owner: string) => setZoom({ card, owner }), []);

  const joinBoard = useCallback(async (name: string, token: string | null) => {
    const problem = await boards.join(name, token);
    if (problem) return problem;
    // Today's finished duel goes on the board now.
    const res = await duelFetch("/api/daily-duel", { method: "POST", body: JSON.stringify({ action: "board" }) }).catch(() => null);
    const got = res?.ok ? ((await res.json()) as { board: { points: number; tokens: number } | null }).board : null;
    if (got) {
      setOfficialRun((r) => (r ? { ...r, board: got } : r));
      setRun((r) => (r && r.official ? { ...r, board: got } : r));
    }
    setBoardRefresh((n) => n + 1);
    return null;
  }, [boards]);
  const onViews = useCallback((day: BoardView | null) => setToday(day), []);

  const zoomer = <DuelZoom card={zoom?.card ?? null} owner={zoom?.owner ?? ""} onClose={() => setZoom(null)} />;

  if (failed) return <p className="duel-note">The Daily Duel couldn&apos;t load. Refresh the page to try again.</p>;
  if (!home) return <p className="duel-note" aria-live="polite">Loading today&apos;s duel…</p>;
  if (!home.ready || !home.trainer) return <p className="duel-note">Today&apos;s duel is still being set up. Try the <Link href="/daily">Daily Shuffle</Link> meanwhile.</p>;

  const signedIn = home.signedIn;
  const guestOff = !signedIn && boards.guest && !boards.guest.onBoard;
  const officialOver = home.official?.status === "done";
  const board = (
    <DailyBoard
      game="duel"
      main={0}
      guestId={boards.guestId ?? storedGuestId()}
      refresh={boardRefresh + boards.refresh}
      onViews={onViews}
      join={guestOff && officialOver ? <DailyBoardJoin onJoin={joinBoard} onJoined={() => setBoardRefresh((n) => n + 1)} tokens={0} /> : undefined}
    />
  );

  // The arena: a duel being played, or one that just ended (holding its last frame a moment).
  if (run && frame && (run.status === "playing" || holding)) {
    return (
      <>
        <DuelArena run={run} play={frame.play} motion={frame.motion} busy={busy || staging || run.status !== "playing"} staging={staging} offset={offset} onNext={onNext} onBring={onBring} onTurn={onTurn} onZoom={onZoom} onSkip={endBeats} />
        {zoomer}
      </>
    );
  }

  const shown = run && run.status === "done" ? run : officialOver ? officialRun : null;
  if (shown) {
    return (
      <>
        <DuelEnd
          run={shown}
          place={shown.official ? today?.you?.place ?? null : null}
          players={today?.total ?? 0}
          signedIn={signedIn}
          board={board}
          onPractice={() => void start("practice")}
          onToday={!shown.official ? () => setRun(null) : undefined}
          onZoom={onZoom}
        />
        {zoomer}
      </>
    );
  }
  if (officialOver) return <p className="duel-note" aria-live="polite">Loading your result…</p>;

  return (
    <div className="duel-home">
      <DuelStart home={home} busy={busy} onStart={() => void start("official")} onZoom={onZoom} />
      {board}
      {zoomer}
    </div>
  );
}
