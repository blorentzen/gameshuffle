"use client";

/**
 * The Daily leaderboards on the page (Britton's picks, 2026-10-16,
 * https://claude.ai/artifact/3vjmzwXFmUaGTVdQnuut7r): today, this week and
 * this month for one game (src/lib/daily/boards.ts), with you pinned in view;
 * the points and tokens a finished game earned; and, for guests, a name to go
 * on the boards with the tokens held for an account.
 *
 * Guests: the browser keeps a random id (localStorage gs-daily-guest) sent as
 * x-daily-guest; signing in later claims everything once (useDailyBoards).
 * Inside the Discord Activity players are their Discord identity, so there's
 * no guest step. Nothing shows until supabase/daily-boards-m1.sql has run.
 */

import { useCallback, useEffect, useState } from "react";
import { Avatar, Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tabs } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { OriginalsLink, useOriginalsHost } from "@/components/originals/OriginalsHost";
import { ordinal, PERIOD_LABEL, tidyName, type BoardGame, type BoardPeriod } from "@/lib/daily/boardRules";
import type { BoardRow, BoardView, ScoreResult } from "@/lib/daily/boardTypes";

const GUEST_KEY = "gs-daily-guest";
const SENT_KEY = "gs-daily-guest-sent";

function readGuestId(): string | null {
  try { return (JSON.parse(localStorage.getItem(GUEST_KEY) ?? "null") as { id?: string } | null)?.id ?? null; } catch { return null; }
}
function newGuestId(): string {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "") : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  try { localStorage.setItem(GUEST_KEY, JSON.stringify({ id })); } catch { /* this visit only */ }
  return id;
}
/** This browser's guest id for a request (made the first time): referrals use it too. */
export function guestRequestId(): string {
  return readGuestId() ?? newGuestId();
}
/** Which games' results this browser already sent for a day, so a reload doesn't send them again. */
function sentFor(game: BoardGame, day: string): boolean {
  try { return (JSON.parse(localStorage.getItem(SENT_KEY) ?? "{}") as Record<string, string>)[game] === day; } catch { return false; }
}
function markSent(game: BoardGame, day: string) {
  try {
    const all = JSON.parse(localStorage.getItem(SENT_KEY) ?? "{}") as Record<string, string>;
    localStorage.setItem(SENT_KEY, JSON.stringify({ ...all, [game]: day }));
  } catch { /* fine */ }
}

export interface GuestState { onBoard: boolean; name?: string; tokens?: number; expires?: string | null; claimed?: boolean }

/**
 * Guest and claim handling for one game's page. Signed in: claims a guest
 * this browser played as, once. Signed out: knows whether the guest is on the
 * boards and sends their finished games.
 */
export function useDailyBoards(game: BoardGame, signedIn: boolean | null) {
  const toast = useToast();
  const { api, activity } = useOriginalsHost();
  const [guestId, setGuestId] = useState<string | null>(null);
  const [guest, setGuest] = useState<GuestState | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (activity || signedIn === null) return;
    const id = readGuestId();
    void Promise.resolve().then(() => setGuestId(id));
    if (!id) { void Promise.resolve().then(() => setGuest({ onBoard: false })); return; }
    let alive = true;
    void api("/api/daily/guest", { headers: { "x-daily-guest": id } }).then((r) => (r.ok ? r.json() : null)).then(async (g: GuestState | null) => {
      if (!alive || !g) return;
      if (signedIn && g.onBoard && !g.claimed) {
        // Signed in now: everything earned as a guest moves to the account, once.
        const res = await api("/api/daily/guest", { method: "POST", headers: { "Content-Type": "application/json", "x-daily-guest": id }, body: JSON.stringify({ action: "claim" }) }).catch(() => null);
        const done = res?.ok ? ((await res.json()) as { tokens: number; days: number }) : null;
        if (done) {
          if (done.tokens > 0 || done.days > 0) toast.success(done.tokens > 0 ? `Your guest games moved to your account, with ${done.tokens.toLocaleString("en-US")} tokens` : "Your guest games moved to your account");
          try { localStorage.removeItem(GUEST_KEY); } catch { /* fine */ }
          if (alive) { setGuestId(null); setGuest({ onBoard: false }); setRefresh((n) => n + 1); }
        }
        return;
      }
      setGuest(g);
    }).catch(() => { /* the boards still show */ });
    return () => { alive = false; };
  }, [api, activity, signedIn, toast]);

  /** A guest on the boards finished a game: send it once. */
  const sendGuestResult = useCallback(async (day: string, guesses: string[]): Promise<ScoreResult | null> => {
    if (!guestId || !guest?.onBoard || sentFor(game, day)) return null;
    const res = await api("/api/daily/guest", { method: "POST", headers: { "Content-Type": "application/json", "x-daily-guest": guestId }, body: JSON.stringify({ action: "result", game, day, guesses }) }).catch(() => null);
    if (!res?.ok) return null;
    markSent(game, day);
    const body = (await res.json()) as { score: ScoreResult | null; tokens?: number; expires?: string | null };
    setGuest((g) => (g ? { ...g, tokens: body.tokens ?? g.tokens, expires: body.expires ?? g.expires } : g));
    setRefresh((n) => n + 1);
    return body.score;
  }, [api, game, guest?.onBoard, guestId]);

  /** Puts this browser on the boards with a name; returns an error message or null. */
  const join = useCallback(async (name: string, turnstileToken: string | null): Promise<string | null> => {
    const id = guestId ?? newGuestId();
    if (!guestId) setGuestId(id);
    const res = await api("/api/daily/guest", { method: "POST", headers: { "Content-Type": "application/json", "x-daily-guest": id }, body: JSON.stringify({ action: "join", name, turnstileToken }) }).catch(() => null);
    if (!res) return "Couldn't reach GameShuffle. Try again in a moment.";
    const body = (await res.json().catch(() => ({}))) as { name?: string; error?: string; message?: string };
    if (!res.ok) {
      if (body.error === "captcha") return "Please finish the quick check first.";
      if (body.error === "too_many") return "Too many new names from this network today. Try again tomorrow, or make a free account.";
      if (body.error === "not_ready") return "The leaderboards aren't open yet.";
      return body.message ?? "Couldn't add you to the board. Try again.";
    }
    setGuest((g) => ({ ...(g ?? {}), onBoard: true, name: body.name }));
    return null;
  }, [api, guestId]);

  return { guestId, guest, sendGuestResult, join, refresh, bump: () => setRefresh((n) => n + 1) };
}

/** What a finished game earned, under the verdict. */
export function DailyScoreChips({ score, guest, today, week }: { score: ScoreResult | null; guest: boolean; today: BoardRow | null; week: BoardRow | null }) {
  if (!score && !today) return null;
  return (
    <ul className="daily-score" aria-label="Your score">
      {score && <li className="daily-score__chip daily-score__chip--points">+{score.points} {score.points === 1 ? "point" : "points"}</li>}
      {score && score.tokens > 0 && <li className="daily-score__chip daily-score__chip--tokens">{guest ? `${score.tokens} tokens waiting` : `+${score.tokens} tokens`}</li>}
      {today && <li className="daily-score__chip">{ordinal(today.place)} today</li>}
      {week && <li className="daily-score__chip">{ordinal(week.place)} this week</li>}
    </ul>
  );
}

/** For a signed-out player who finished: go on the board with a name. */
export function DailyBoardJoin({ onJoin, onJoined, tokens }: { onJoin: (name: string, token: string | null) => Promise<string | null>; onJoined: () => void; tokens: number }) {
  const [name, setName] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const problem = await onJoin(tidyName(name), token);
    setBusy(false);
    if (problem) setError(problem);
    else onJoined();
  };
  return (
    <form className="daily-join" onSubmit={(e) => void submit(e)}>
      <h3 className="daily-join__title">Put me on the leaderboard</h3>
      <p className="daily-join__text">Pick a name for the boards. {tokens > 0 ? `This game earned ${tokens} tokens: they` : "Tokens you earn"} wait in this browser for 30 days, and move to your wallet when you <OriginalsLink href="/signup?redirect=/daily">make a free account</OriginalsLink>.</p>
      <div className="daily-join__row">
        <Input value={name} onChange={(e) => { setName(e.target.value); setError(null); }} placeholder="A name for the board" aria-label="A name for the board" maxLength={24} />
        <Button type="submit" variant="primary" disabled={busy || tidyName(name).length < 2}>Add me</Button>
      </div>
      <TurnstileWidget onToken={setToken} size="flexible" />
      {error && <p className="daily-join__error" role="alert">{error}</p>}
    </form>
  );
}

/** Dots for a day's result: misses, then the guess that got it (gold on a last chance). */
function ResultDots({ guesses, points, main }: { guesses: number; points: number; main: number }) {
  const solved = points > 0;
  const saved = points === 1;
  const label = !solved ? "Not today" : saved ? "Saved on the last chance" : `Got it in ${guesses}`;
  const dots = Array.from({ length: Math.max(main, guesses) }, (_, i) => (i < guesses - 1 || (!solved && i < guesses) ? "miss" : i === guesses - 1 && solved ? (saved ? "saved" : "win") : "open"));
  return (
    <span className="daily-board__dots" role="img" aria-label={label}>
      {dots.map((d, i) => <span key={i} className={`daily-board__dot daily-board__dot--${d}`} />)}
    </span>
  );
}

/** `pictures`: off inside the Discord Activity, which only loads images from our own site. */
function BoardTable({ view, main, pictures }: { view: BoardView; main: number; pictures: boolean }) {
  const day = view.period === "day";
  const shown = view.rows;
  const pinned = view.you && !shown.some((r) => r.you) ? view.you : null;
  if (!shown.length) {
    return <p className="party-muted daily-board__empty">{day ? "Nobody's on the board yet today. Finish today's puzzle to be first." : "Nobody's on this board yet."}</p>;
  }
  const row = (r: BoardRow, key: string) => (
    <TableRow key={key} className={r.you ? "daily-board__you" : undefined}>
      <TableCell><strong>{r.place}</strong></TableCell>
      <TableCell>
        <span className="daily-board__who">
          <Avatar size="xsmall" src={pictures ? r.avatar ?? undefined : undefined} initials={r.name.slice(0, 1).toUpperCase()} alt="" color="primary" />
          {r.profile ? <OriginalsLink href={r.profile}>{r.you ? "You" : r.name}</OriginalsLink> : <span>{r.you ? "You" : r.name}</span>}
          {r.tag === "guest" && <span className="daily-board__tag daily-board__tag--guest">Guest</span>}
          {r.tag === "discord" && <span className="daily-board__tag daily-board__tag--discord">Discord</span>}
        </span>
      </TableCell>
      <TableCell>{day ? <ResultDots guesses={r.guesses} points={r.points} main={main} /> : `${r.days} ${r.days === 1 ? "day" : "days"}`}</TableCell>
      <TableCell align="right"><strong>{r.points}</strong></TableCell>
      {!day && <TableCell align="right">{r.prize ? <span className="daily-board__prize">{r.prize.toLocaleString("en-US")}</span> : ""}</TableCell>}
    </TableRow>
  );
  return (
    <div className="daily-board__table" tabIndex={0} role="region" aria-label={`${PERIOD_LABEL[view.period]} leaderboard`}>
      <Table dense>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Player</TableHead>
            <TableHead>{day ? "Result" : "Played"}</TableHead>
            <TableHead align="right">Points</TableHead>
            {!day && <TableHead align="right">Prize</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((r, i) => row(r, `${r.place}-${i}`))}
          {pinned && row(pinned, "you")}
        </TableBody>
      </Table>
    </div>
  );
}

const settleText = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

/** The leaderboards for one game: Today, This week, This month. */
export function DailyBoard({ game, main, guestId, refresh, onViews }: { game: BoardGame; main: number; guestId: string | null; refresh: number; onViews?: (day: BoardView | null, week: BoardView | null) => void }) {
  const { api, activity } = useOriginalsHost();
  const [period, setPeriod] = useState<BoardPeriod>("day");
  const [views, setViews] = useState<Partial<Record<BoardPeriod, BoardView>>>({});

  useEffect(() => {
    let alive = true;
    const load = (p: BoardPeriod) => api(`/api/daily/board?game=${game}&period=${p}`, { headers: guestId ? { "x-daily-guest": guestId } : {} })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<BoardView | null>;
    void Promise.all([load("day"), load("week"), load("month")]).then(([d, w, m]) => {
      if (!alive) return;
      setViews({ ...(d ? { day: d } : {}), ...(w ? { week: w } : {}), ...(m ? { month: m } : {}) });
      onViews?.(d, w);
      // A link straight to the board (the homepage's "Leaderboards") lands before it has loaded.
      if (d?.ready && typeof window !== "undefined" && window.location.hash === `#daily-board-${game}`) {
        requestAnimationFrame(() => document.getElementById(`daily-board-${game}`)?.scrollIntoView({ block: "start" }));
      }
    });
    return () => { alive = false; };
  }, [api, game, guestId, refresh, onViews]);

  const current = views[period];
  if (!views.day?.ready) return null;
  return (
    <section className="daily-board" aria-labelledby={`daily-board-${game}`}>
      <h2 id={`daily-board-${game}`} className="daily-board__title">Leaderboard</h2>
      <Tabs
        variant="underline"
        size="small"
        activeTab={period}
        onChange={(id) => setPeriod(id as BoardPeriod)}
        tabs={(["day", "week", "month"] as BoardPeriod[]).map((p) => ({ id: p, label: PERIOD_LABEL[p], content: null }))}
        className="daily-board__tabs"
      />
      {current && <BoardTable view={current} main={main} pictures={!activity} />}
      {current && (
        <p className="daily-board__foot">
          {current.total.toLocaleString("en-US")} {current.total === 1 ? "player" : "players"} · ties share a place · 10 points for guess 1, then 8, 6, 4, 2, and 1 for a last chance
          {current.settles ? ` · prizes land ${settleText(current.settles)}` : ""}
        </p>
      )}
    </section>
  );
}
