"use client";

/**
 * Fire Round, the page (Britton's picks, 2026-10-19,
 * https://claude.ai/artifact/N8ZZzJUvEkJcBf3J3eEeDT, and beside the dailies
 * the same day, https://claude.ai/artifact/WhFgrMQv8oVHQ4e5cvfXRx). Three screens:
 *   start    Today's Fire Round in the dailies' Start card (the one boxed
 *            thing), then More rounds sitting flat (category and length chips,
 *            Start), your bests and today's leaderboard.
 *   play     FirePlay: a 3, 2, 1 first, then the questions.
 *   results  the score, four numbers, a new best or what today's round earned,
 *            Copy my score, the leaderboard, and what to play next.
 * The server (/api/fire-round) holds the clock and judges every answer. Guests
 * play as the browser's daily guest id and join the boards with a name. Today's
 * round reports itself to the dailies' today bar like the puzzles do.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, Chip } from "@empac/cascadeds";
import { IconCalendarEvent, IconFlameFilled, IconTrophy } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { DailyBoard, DailyBoardJoin, guestRequestId, storedGuestId, useDailyBoards } from "@/components/originals/DailyBoard";
import { DailiesNextButton, DailiesShare, DailiesYours } from "@/components/originals/Dailies";
import { ShareButton } from "@/components/share/ShareButton";
import { DailyStartCard } from "@/components/originals/DailyStart";
import { DailySteps } from "@/components/originals/DailyParade";
import { EVENTS, track } from "@/lib/analytics/events";
import { ordinal } from "@/lib/daily/boardRules";
import type { BoardView } from "@/lib/daily/boardTypes";
import { reportDaily, type DailiesEntry } from "@/lib/originals/dailies";
import { CHOICE_POINTS, LENGTH_ORDER, LENGTHS, MIXED, TYPED_POINTS, fireShareText, type FireLength } from "@/lib/originals/fireRound";
import type { FireHome, FireOutcome, FireRunView } from "@/lib/fireRound/store";
import { FirePlay, type FireMove } from "./FirePlay";
import { FireGlyph } from "./fireIcons";

type Home = FireHome & { signedIn: boolean };

const SHARE_URL = "https://www.gameshuffle.co/fire";

/** Today's round for the dailies' today bar, Next up, combined share and streak card. */
function fireEntry(h: Home): DailiesEntry {
  return {
    day: h.day,
    number: h.number,
    state: h.today ? "done" : h.current?.mode === "daily" ? "playing" : "fresh",
    fire: h.today ? { score: h.today.score, right: h.today.right } : null,
    stats: { played: h.history.played, won: h.history.played, streak: h.history.streak, best: h.history.best, top: h.history.top },
    recent: h.history.recent,
  };
}

/** Fetch with this browser's guest id (made when a round starts, read-only otherwise). */
function fireFetch(path: string, init: RequestInit & { makeGuest?: boolean } = {}) {
  const { makeGuest, ...rest } = init;
  const id = makeGuest ? guestRequestId() : storedGuestId();
  return fetch(path, { ...rest, headers: { ...(rest.headers ?? {}), ...(id ? { "x-daily-guest": id } : {}), ...(rest.body ? { "Content-Type": "application/json" } : {}) } });
}

export function FireRound() {
  const toast = useToast();
  const [home, setHome] = useState<Home | null>(null);
  const [failed, setFailed] = useState(false);
  const [run, setRun] = useState<FireRunView | null>(null);
  const [outcome, setOutcome] = useState<FireOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [category, setCategory] = useState(MIXED);
  const [length, setLength] = useState<FireLength>("sprint");
  const [boardRefresh, setBoardRefresh] = useState(0);
  const [today, setToday] = useState<{ day: BoardView | null }>({ day: null });

  const loadHome = useCallback(async () => {
    const res = await fireFetch("/api/fire-round").catch(() => null);
    if (!res?.ok) { setFailed(true); return; }
    const h = (await res.json()) as Home;
    setHome(h);
    if (h.ready) reportDaily("fire", fireEntry(h));
    // A round still running picks back up.
    if (h.current) {
      setRun(h.current);
      setOffset(Date.parse(h.current.serverNow) - Date.now());
    }
  }, []);
  useEffect(() => { void Promise.resolve().then(loadHome); }, [loadHome]);

  // A link from a trivia questions page (?category=mario-kart) picks that category for More rounds, when it has questions.
  const ids = home?.categories.map((c) => c.id).join(",") ?? "";
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get("category");
    if (want && ids.split(",").includes(want)) void Promise.resolve().then(() => setCategory(want));
  }, [ids]);

  const boards = useDailyBoards("fire", home ? home.signedIn : null);

  const take = useCallback((r: FireRunView, o: FireOutcome | null = null) => {
    setRun(r);
    setOutcome(o);
    setOffset(Date.parse(r.serverNow) - Date.now());
    if (r.status === "done") {
      track(EVENTS.fireRoundFinished, { mode: r.mode, length: r.length, category: r.category, score: r.score >= 1000 ? "1000+" : r.score >= 500 ? "500+" : r.score > 0 ? "1+" : "0" });
      setBoardRefresh((n) => n + 1);
      void loadHome();
    }
  }, [loadHome]);

  const start = useCallback((mode: "daily" | "free", pick?: { category: string; length: FireLength }) => {
    const cat = pick?.category ?? category;
    const len = pick?.length ?? length;
    setOutcome(null);
    let n = 3;
    setCountdown(n);
    const tick = window.setInterval(() => {
      n -= 1;
      if (n > 0) { setCountdown(n); return; }
      window.clearInterval(tick);
      void (async () => {
        const res = await fireFetch("/api/fire-round", { method: "POST", makeGuest: true, body: JSON.stringify({ action: "start", mode, category: cat, length: len }) }).catch(() => null);
        setCountdown(null);
        if (!res?.ok) {
          const err = ((await res?.json().catch(() => ({}))) as { error?: string } | undefined)?.error;
          toast.error(err === "no_questions" ? "That category has no questions ready yet. Try another." : err === "rate_limited" ? "Slow down a little, then try again." : "Couldn't start the round. Try again in a moment.");
          return;
        }
        const body = (await res.json()) as { run: FireRunView };
        track(EVENTS.fireRoundStarted, { mode, length: body.run.length, category: body.run.category });
        take(body.run);
        // The round starts at the top of the game, under the nav.
        requestAnimationFrame(() => {
          const top = document.querySelector(".fire-page")?.getBoundingClientRect().top;
          if (top !== undefined) window.scrollTo({ top: Math.max(0, window.scrollY + top - 72), behavior: "smooth" });
        });
      })();
    }, 700);
  }, [category, length, take, toast]);

  const move = useCallback(async (m: FireMove) => {
    if (!run || busy) return;
    setBusy(true);
    const res = await fireFetch(`/api/fire-round/${run.id}`, { method: "POST", body: JSON.stringify(m) }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      const body = (await res.json()) as { run: FireRunView; outcome: FireOutcome | null };
      take(body.run, body.outcome);
      return;
    }
    // Out of step with the server (two taps at once): take the server's copy.
    const fresh = await fireFetch(`/api/fire-round/${run.id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { run: FireRunView } | null;
    if (fresh) take(fresh.run);
    else toast.error("Couldn't send that answer. Check your connection.");
  }, [busy, run, take, toast]);

  const timeUp = useCallback(async () => {
    if (!run) return;
    // A moment past the clock: an answer in flight still lands first.
    await new Promise((r) => setTimeout(r, 600));
    const fresh = await fireFetch(`/api/fire-round/${run.id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { run: FireRunView } | null;
    if (fresh) take(fresh.run);
  }, [run, take]);

  const joinBoard = useCallback(async (name: string, token: string | null) => {
    const problem = await boards.join(name, token);
    if (problem) return problem;
    // Today's finished round goes on the board now.
    await fireFetch("/api/fire-round", { method: "POST", body: JSON.stringify({ action: "board" }) }).catch(() => null);
    setBoardRefresh((n) => n + 1);
    return null;
  }, [boards]);

  const onViews = useCallback((day: BoardView | null) => setToday({ day }), []);

  if (failed) return <p className="fire-note">Fire Round couldn&apos;t load. Refresh the page to try again.</p>;
  if (!home) return <p className="fire-note" aria-live="polite">Loading Fire Round…</p>;
  if (!home.ready) return <p className="fire-note">Fire Round opens soon: the questions are being checked. Try today&apos;s <Link href="/daily">Daily Shuffle</Link> meanwhile.</p>;

  if (countdown !== null) {
    return (
      <div className="fire-countdown" role="status" aria-live="assertive">
        <span className="fire-countdown__label">Get ready</span>
        <span className="fire-countdown__n">{countdown}</span>
      </div>
    );
  }

  const guestOff = !home.signedIn && boards.guest && !boards.guest.onBoard;
  const board = (
    <DailyBoard
      game="fire"
      main={0}
      guestId={boards.guestId ?? storedGuestId()}
      refresh={boardRefresh + boards.refresh}
      onViews={onViews}
      join={guestOff && home.today ? <DailyBoardJoin onJoin={joinBoard} onJoined={() => setBoardRefresh((n) => n + 1)} tokens={0} /> : undefined}
    />
  );

  if (run && run.status === "playing") {
    return <FirePlay run={run} outcome={outcome} busy={busy} offset={offset} onMove={(m) => void move(m)} onTimeUp={() => void timeUp()} />;
  }

  if (run && run.status === "done" && run.result) {
    return (
      <FireResults
        run={run}
        board={board}
        place={run.mode === "daily" && run.counts ? today.day?.you?.place ?? null : null}
        players={today.day?.total ?? 0}
        signedIn={home.signedIn}
        shareFor={(url) => fireShareText(run.result!.totals, { daily: run.mode === "daily", number: run.number, lengthLabel: LENGTHS[run.length].label, categoryLabel: run.categoryLabel, url })}
        onAgain={() => { setRun(null); start("free", { category: run.category, length: run.length }); }}
        onHome={() => setRun(null)}
        onCopy={() => {
          const text = fireShareText(run.result!.totals, { daily: run.mode === "daily", number: run.number, lengthLabel: LENGTHS[run.length].label, categoryLabel: run.categoryLabel, url: SHARE_URL });
          navigator.clipboard.writeText(text).then(
            () => { track(EVENTS.fireRoundShared, { mode: run.mode }); toast.success("Score copied"); },
            () => toast.error("Couldn't copy your score"),
          );
        }}
      />
    );
  }

  return (
    <FireStart
      home={home}
      category={category}
      length={length}
      onCategory={setCategory}
      onLength={setLength}
      onStart={start}
      board={board}
    />
  );
}

function FireStart({ home, category, length, onCategory, onLength, onStart, board }: {
  home: Home; category: string; length: FireLength;
  onCategory: (id: string) => void; onLength: (l: FireLength) => void; onStart: (mode: "daily" | "free") => void; board: React.ReactNode;
}) {
  const played = home.today;
  return (
    <div className="fire-home">
      <section aria-labelledby="fire-today-title">
        <DailyStartCard
          className="daily-start--fire"
          onStart={() => onStart("daily")}
          label={played ? "Practice today's round" : "Play today's round"}
          primary={!played}
          note={played ? "Practice rounds don't change your score on the board. A new round at midnight Pacific." : null}
          head={
            <div className="fire-today__head">
              <span className="fire-tile" aria-hidden><IconCalendarEvent size={22} stroke={2} /></span>
              <h2 id="fire-today-title" className="fire-today__title">Today&apos;s Fire Round{home.number >= 1 ? ` #${home.number}` : ""}</h2>
              <p className="fire-today__sub">60 seconds · mixed · the same questions for everyone</p>
              {played && <p className="fire-today__done"><IconTrophy size={18} aria-hidden /><span>You scored <strong>{played.score.toLocaleString("en-US")}</strong> today with {played.right} right.</span></p>}
              {home.streak > 0 && <p className="fire-today__streak"><IconFlameFilled size={16} aria-hidden /> {home.streak} {home.streak === 1 ? "day" : "days"} in a row</p>}
            </div>
          }
        >
          {!played && (
            <DailySteps steps={[
              { icon: "type", title: `Type it for ${TYPED_POINTS}`, text: `A close answer opens four choices for ${CHOICE_POINTS}.` },
              { icon: "heat", title: "Heat builds", text: "3 right in a row is ×1.5, 6 is ×2." },
              { icon: "board", title: "First try counts", text: "Your first round today goes on the leaderboard." },
            ]} />
          )}
        </DailyStartCard>
      </section>

      <section className="fire-flat" aria-labelledby="fire-free-title">
        <h2 id="fire-free-title" className="fire-flat__title">More rounds, any time</h2>
        <p className="fire-small">Speed trivia by category: 1, 3 or 5 minutes, or until three misses. Rapid fire questions on geography, science, movies, music, sports, game characters, Overwatch heroes and more, with no repeats for 30 days while fresh ones are left.</p>
        <p className="fire-label" id="fire-cat-label">Pick a category</p>
        <div className="fire-chips" role="group" aria-labelledby="fire-cat-label">
          {home.categories.map((c) => (
            <Chip key={c.id} label={c.label} icon={<FireGlyph name={c.icon} size={14} />} clickable selected={category === c.id} aria-pressed={category === c.id} onClick={() => onCategory(c.id)} />
          ))}
        </div>
        <p className="fire-label" id="fire-len-label">How long</p>
        <div className="fire-chips" role="group" aria-labelledby="fire-len-label">
          {LENGTH_ORDER.map((l) => <Chip key={l} label={LENGTHS[l].label} clickable selected={length === l} aria-pressed={length === l} onClick={() => onLength(l)} />)}
        </div>
        <div><Button variant="secondary" onClick={() => onStart("free")}>Start a round</Button></div>
      </section>

      {home.bests.length > 0 && (
        <section className="fire-flat" aria-labelledby="fire-bests-title">
          <h2 id="fire-bests-title" className="fire-flat__title">Your bests</h2>
          <ul className="fire-bests">
            {home.bests.map((b) => (
              <li key={`${b.category}-${b.length}`}><span>{b.categoryLabel} · {LENGTHS[b.length].label.toLowerCase()}</span><strong>{b.score.toLocaleString("en-US")}</strong></li>
            ))}
          </ul>
        </section>
      )}

      {board}
    </div>
  );
}

function FireResults({ run, board, place, players, signedIn, shareFor, onAgain, onHome, onCopy }: {
  run: FireRunView; board: React.ReactNode; place: number | null; players: number; signedIn: boolean;
  /** The score line ending in the link it's given (the card's, else /fire). */
  shareFor: (url: string) => string;
  onAgain: () => void; onHome: () => void; onCopy: () => void;
}) {
  const r = run.result!;
  const t = r.totals;
  const daily = run.mode === "daily";
  const why = run.lives !== null ? (run.lives <= 0 ? "Out of hearts" : "Round over") : "Time!";

  return (
    <div className="fire-results">
      <section className="fire-today fire-today--result" aria-labelledby="fire-result-title">
        <p className="fire-label">{why}</p>
        <h2 id="fire-result-title" className="fire-result__score">{t.score.toLocaleString("en-US")}</h2>
        <p className="fire-result__what">{daily ? `Today's Fire Round${run.number >= 1 ? ` #${run.number}` : ""}${run.counts ? "" : " · practice"}` : `${run.categoryLabel} · ${LENGTHS[run.length].label.toLowerCase()}`}</p>
        <dl className="fire-stats">
          <div><dt>Right</dt><dd>{t.right}</dd></div>
          <div><dt>Missed</dt><dd>{t.missed + t.skipped}</dd></div>
          <div><dt>Best streak</dt><dd>{t.bestStreak}</dd></div>
          <div><dt>With choices</dt><dd>{t.choices}</dd></div>
        </dl>
        {daily && run.counts && r.board && (
          <p className="fire-result__line"><IconTrophy size={18} aria-hidden />+{r.board.points} {r.board.points === 1 ? "point" : "points"} on today&apos;s board{r.board.tokens > 0 ? `, +${r.board.tokens} tokens` : ""}{place ? ` · ${ordinal(place)} of ${players} today` : ""}</p>
        )}
        {daily && run.counts && !r.board && !signedIn && <p className="fire-result__line">Put a name on the board below to see where this lands.</p>}
        {daily && !run.counts && <p className="fire-small">Practice: your first round today is the one on the board.</p>}
        {!daily && r.newBest && <p className="fire-result__line"><IconTrophy size={18} aria-hidden />A new best for {run.categoryLabel.toLowerCase()}, {LENGTHS[run.length].label.toLowerCase()}{r.best !== null ? ` (was ${r.best.toLocaleString("en-US")})` : ""}</p>}
        {!daily && !r.newBest && r.best !== null && <p className="fire-small">Your best here: {r.best.toLocaleString("en-US")}.</p>}
        <div className="fire-today__actions">
          {/* Share with a picture of the round (src/components/share); today's counting round joins the day card. */}
          {daily && run.counts
            ? <DailiesShare current="fire" shareOne={onCopy} oneText="Copy my score" one={{ request: { kind: "fire", fireRun: run.id }, text: shareFor, fallbackUrl: SHARE_URL }} />
            : <ShareButton request={{ kind: "fire", fireRun: run.id }} text={shareFor} game="fire" fallbackUrl={SHARE_URL} title="My Fire Round" />}
          {daily ? <Button variant="secondary" onClick={onHome}>More rounds</Button> : <Button variant="secondary" onClick={onAgain}>Play again</Button>}
        </div>
        {!daily && <Button variant="ghost" size="small" onClick={onHome}>Change category or length</Button>}
      </section>

      {daily && run.counts && <div className="fire-streak"><DailiesYours current="fire" only /></div>}

      {daily && board}

      <section className="fire-flat" aria-labelledby="fire-next-title">
        <h2 id="fire-next-title" className="fire-flat__title">Next up</h2>
        {daily ? (
          <div className="fire-next"><DailiesNextButton current="fire" /></div>
        ) : (
          <p className="fire-next">Try another category, or <Link href="/trivia">host a trivia night</Link> for your group.</p>
        )}
      </section>
    </div>
  );
}
