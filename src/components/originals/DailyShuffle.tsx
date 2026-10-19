"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Accordion, Alert, Badge, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { DailyParade, DailySteps } from "@/components/originals/DailyParade";
import { DailyBoard, DailyBoardJoin, DailyScoreChips, guestRequestId, useDailyBoards } from "@/components/originals/DailyBoard";
import { SupportNudge } from "@/components/support/SupportNudge";
import { DailyHelpPanel, HelpWord, useDailyHelp } from "@/components/originals/DailyHelp";
import { NO_HELP, type HelpCounts } from "@/lib/originals/dailyHelp";
import { DailiesInvite, DailiesNextButton, DailiesShare, DailiesYours, sendReferralFinish, useDailies } from "@/components/originals/Dailies";
import { withReferral } from "@/lib/originals/referral";
import { reportDaily, type DailiesEntry } from "@/lib/originals/dailies";
import type { BoardRow, BoardView, ScoreResult, SolveTimes } from "@/lib/daily/boardTypes";
import { DailySolveTime, DailyStartCard, pickTimes, useDailyStart } from "@/components/originals/DailyStart";
import { ChatBrainAsk } from "@/components/chatbrain/ChatBrainAsk";
import { LabeledCombobox } from "@/components/ui/LabeledCombobox";
import { FIRE_ROUND_PUBLIC } from "@/lib/games-visibility";
import { OriginalsLink, useArtSrc, useOriginalsHost, type OriginalsHost } from "@/components/originals/OriginalsHost";
import { EVENTS, track } from "@/lib/analytics/events";
import {
  CLUE_AFTER, DEFAULT_CLOSE_NOTE, MAX_GUESSES, answerFor, dayKey, guessFeedback, guessLimits, hintFor, ladderShown, playTraits, previewPuzzle, puzzleFor, puzzleLabel, puzzleNumber, rotationFor, PUZZLES, shareText, silhouetteAfter, starterFor, WRITTEN_CLUE,
  type DailyStats, type GuessHint, type TraitCell, type TraitDef,
} from "@/lib/originals/daily";

/**
 * The Daily Shuffle (a GameShuffle Original): guess today's character in six
 * tries. The game rotates by weekday (Mario Kart 8 Deluxe, Mario Kart World,
 * Mario Party; see ROTATION). Signed in, results are saved to the account
 * (/api/daily) and streaks follow you across devices; signed out, they live in
 * this browser. Inside the Discord Activity (OriginalsHost) results are saved
 * to the player's Discord identity, guesses are saved as they go so a game
 * picks up where it left off, and the result can be shared to a channel.
 */

const KEY = "gs-daily-shuffle";

interface Stats { played: number; won: number; streak: number; best: number; dist: number[]; lastDay: string | null; /** Last chance saves: kept the streak, not a win. */ saved?: number }
/** `puzzle` is missing on saves from before the rotation; those were all Mario Kart 8 Deluxe. */
/** `help`: letters and guesses bought today, kept here too so a reload never ends a game early. */
interface Saved { day: string; puzzle?: string; guesses: string[]; stats: Stats; help?: HelpCounts }

const EMPTY_STATS: Stats = { played: 0, won: 0, streak: 0, best: 0, dist: Array(MAX_GUESSES).fill(0), lastDay: null };

function read(): Saved | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null; } catch { return null; }
}
function write(s: Saved) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* still playable this visit */ }
}
interface Account { signedIn: boolean; stats?: DailyStats | null; today?: { puzzle: string; guesses: number; solved: boolean } | null; progress?: string[] | null; score?: ScoreResult | null; times?: SolveTimes | null }

async function saveResult(api: OriginalsHost["api"], day: string, guesses: string[]): Promise<Account | null> {
  try {
    // The guest id too: a Start pressed before sign-in finished loading was filed under it.
    const res = await api("/api/daily", { method: "POST", headers: { "Content-Type": "application/json", "x-daily-guest": guestRequestId() }, body: JSON.stringify({ day, guesses }) });
    if (!res.ok) return null;
    return { signedIn: true, ...(await res.json()) } as Account;
  } catch { return null; }
}

/** What a cell says: the guess's value. No arrows since 2026-10-14 (they made the Daily too easy). */
function cellText(def: TraitDef, c: TraitCell): string {
  return c.value === null ? (def.kind === "year" ? "Never" : "?") : String(c.value);
}
function cellLabel(def: TraitDef, c: TraitCell): string {
  return `${def.label}: ${c.value ?? "never"}, ${c.status === "match" ? "match" : c.status === "close" ? "close" : "no match"}`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const andList = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
/** "Mario Kart 8 Deluxe on Sunday and Monday, ..." for the rotation in effect that day. */
function rotationText(day: string): string {
  const days = rotationFor(day);
  const order = [...new Set(days)];
  return andList(order.map((id) => `${PUZZLES[id].game} on ${andList(WEEKDAYS.filter((_, i) => days[i] === id))}`));
}

function yesterday(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
}

export function DailyShuffle() {
  const toast = useToast();
  const { api, activity } = useOriginalsHost();
  const art = useArtSrc();
  // Dev only: ?day=YYYY-MM-DD previews another day's puzzle, ?puzzle=<id> plays one
  // that isn't scheduled yet (both ignored in production). A preview saves nothing.
  const [preview] = useState(() => process.env.NODE_ENV !== "production" && typeof window !== "undefined"
    && previewPuzzle(new URLSearchParams(window.location.search).get("puzzle")));
  const [day] = useState(() => {
    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
      const q = new URLSearchParams(window.location.search).get("day");
      if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
    }
    return dayKey();
  });
  const puzzle = useMemo(() => puzzleFor(day), [day]);
  const answer = useMemo(() => answerFor(day), [day]);
  const starter = useMemo(() => starterFor(day), [day]);
  const traits = useMemo(() => playTraits(puzzle), [puzzle]);
  const tomorrow = useMemo(() => puzzleFor(new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)), [day]);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [pick, setPick] = useState("");
  /** The guess just made: its row lights up and scrolls into view for a moment. */
  const [flash, setFlash] = useState<string | null>(null);
  /** Help bought with tokens today (the browser's copy; the server's wins when larger). */
  const [localHelp, setLocalHelp] = useState<HelpCounts>(NO_HELP);
  const { info: helpInfo, help, reload: reloadHelp } = useDailyHelp("shuffle", localHelp);
  const [loaded, setLoaded] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  // The leaderboards: what this game earned, and where you sit today and this week.
  const boards = useDailyBoards("shuffle", account ? account.signedIn : null);
  const [score, setScore] = useState<ScoreResult | null>(null);
  const [mine, setMine] = useState<{ day: BoardRow | null; week: BoardRow | null }>({ day: null, week: null });
  const onViews = useCallback((d: BoardView | null, w: BoardView | null) => setMine({ day: d?.you ?? null, week: w?.you ?? null }), []);
  // The Start button: the first hint shows and the solve clock starts (Britton's pick, 2026-10-16).
  const clock = useDailyStart("shuffle", day, !preview && day === dayKey());

  useEffect(() => {
    let alive = true;
    if (preview) { void Promise.resolve().then(() => setLoaded(true)); return; }
    const s = read();
    // Guesses only carry over for the same day AND the same puzzle.
    const sameGame = !!s && s.day === day && (s.puzzle ?? "mk8dx-character") === puzzleFor(day).id;
    void Promise.resolve().then(() => {
      if (s) {
        setStats({ ...EMPTY_STATS, ...s.stats });
        if (sameGame) { setGuesses(s.guesses); setLocalHelp(s.help ?? NO_HELP); }
      }
      setLoaded(true);
    });
    void api("/api/daily").then((r) => (r.ok ? r.json() : null)).then(async (a: Account | null) => {
      if (!alive || !a) return;
      // Finished here before signing in (or before the save landed): send it up once.
      const local = sameGame && s ? s.guesses : [];
      const localDone = local.length >= guessLimits(puzzleFor(day)).total || local.includes(answerFor(day).name);
      if (a.signedIn && !a.today && localDone) a = (await saveResult(api, day, local)) ?? a;
      // Guesses saved on the server (the Discord Activity) pick the game back up.
      if (a.progress?.length && !local.length) setGuesses(a.progress);
      if (alive) setAccount(a);
    }).catch(() => { /* browser streaks still work */ });
    return () => { alive = false; };
  }, [day, preview, api]);

  const hints = guesses.map((g) => hintFor(g, answer, puzzle)).filter((h): h is GuessHint => !!h);
  // Played today on another device: the account has the result but this browser has no guesses.
  // (Only for today's puzzle: on the day the rotation shipped, a morning result may be for another game.)
  const elsewhere = hints.length === 0 && account?.today?.puzzle === puzzle.id ? account.today : null;
  const solved = hints.some((h) => h.correct) || !!elsewhere?.solved;
  // Extra guesses bought with tokens on the last chance add to the total.
  const { main, total: baseTotal } = guessLimits(puzzle);
  const total = baseTotal + help.guesses;
  const over = solved || hints.length >= total || !!elsewhere;
  // All-Stars: five guesses make the main game, then one Last chance with the silhouette.
  const inLastChance = !!puzzle.lastChance && !over && hints.length >= main;
  const savedIt = solved && (elsewhere ? elsewhere.guesses : hints.length) > main;
  const label = puzzleLabel(puzzle);
  // Started: tapped Start today, or already guessing (a game from before the button), or done.
  const started = !!clock.startedAt || hints.length > 0 || over;
  const shownHints = over || !started ? [] : ladderShown(answer, hints.length);
  const moreHints = !over && !inLastChance && (answer.ladder ?? []).some((h) => h.after > hints.length);
  const shown = account?.signedIn && account.stats ? account.stats : stats;
  const noun = puzzle.noun ?? "character";
  // Before the first guess: the characters drift past and three steps say how to play.
  const fresh = loaded && !over && hints.length === 0 && !elsewhere;
  const times = pickTimes(account?.times, clock.local, score?.seconds);
  const steps = puzzle.lastChance
    ? [
      { icon: "hint" as const, title: "Read the hint", text: "A nod to today's character, with a new one after each miss." },
      { icon: "guess" as const, title: "Guess anyone", text: `Pick from ${puzzle.characters.length} characters across Nintendo and Smash's guests.` },
      { icon: "colors" as const, title: "Follow the colors", text: `Green matches, yellow is close. ${main} guesses, then a last chance.` },
    ]
    : [
      { icon: "guess" as const, title: "Guess anyone", text: `Pick from ${puzzle.characters.length} ${label ? `${label} ` : ""}${noun}s.` },
      { icon: "hint" as const, title: "Read the row", text: "Each guess shows its facts beside today's answer." },
      { icon: "colors" as const, title: "Follow the colors", text: `Green matches, yellow is close. ${main} guesses to find them.` },
    ];
  const blur = puzzle.reveal === "blur";
  const { sendGuestResult, bump } = boards;
  const guestOnBoard = !!boards.guest?.onBoard;

  // A guest on the boards: their finished game goes up once (also after a reload, or right after joining).
  useEffect(() => {
    if (preview || activity || !over || !guestOnBoard || !guesses.length) return;
    void sendGuestResult(day, guesses).then((sc) => { if (sc) setScore(sc); });
  }, [preview, activity, over, guestOnBoard, guesses, day, sendGuestResult]);
  // The new row: into view, then the highlight fades.
  useEffect(() => {
    if (!flash) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const raf = requestAnimationFrame(() => document.querySelector(".daily__row--new")?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" }));
    const t = window.setTimeout(() => setFlash(null), 2400);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(t); };
  }, [flash]);
  // A to Z in the guess list (the roster's own order drives the answers, so it never changes).
  const options = useMemo(() => puzzle.characters.filter((c) => !guesses.includes(c.name)).map((c) => ({ value: c.name, label: c.name }))
    .sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" })), [puzzle, guesses]);

  // The today bar, Next up and the streak cards on every daily's page learn where this game stands.
  const report = loaded && !preview && day === dayKey() ? JSON.stringify({
    day, number: puzzleNumber(day), state: over ? "done" : hints.length ? "playing" : "fresh",
    result: over ? { guesses: elsewhere ? elsewhere.guesses : hints.length, main, solved, saved: savedIt, seconds: times.seconds } : null,
    stats: { played: shown.played, won: shown.won, streak: shown.streak, best: shown.best, saved: shown.saved ?? 0, fastest: times.fastest },
  } satisfies DailiesEntry) : "";
  useEffect(() => { if (report) reportDaily("shuffle", JSON.parse(report) as DailiesEntry); }, [report]);
  // Came from a friend's link: a finished game counts for them once (the server checks it's real).
  const { referral } = useDailies("shuffle");
  const finishedHere = over && !elsewhere && guesses.length > 0;
  useEffect(() => {
    if (finishedHere && !preview && !activity && day === dayKey()) sendReferralFinish(api, "shuffle", day, guesses);
  }, [finishedHere, preview, activity, day, api, guesses]);

  const guess = () => {
    if (!pick || over || guesses.includes(pick) || !puzzle.characters.some((c) => c.name === pick)) return;
    const next = [...guesses, pick];
    setGuesses(next);
    setPick("");
    const right = pick === answer.name;
    const done = right || next.length >= total;
    // Say what the guess did (Britton's pick, 2026-10-16), and light up its row.
    const made = hintFor(pick, answer, puzzle);
    if (made) {
      const fb = guessFeedback(made, next.length, puzzle, ladderShown(answer, next.length).length > ladderShown(answer, guesses.length).length, help.guesses);
      toast[fb.tone](fb.text);
    }
    if (!done) setFlash(pick);
    // A Last chance save keeps the streak going but isn't a win.
    const save = right && next.length > main;
    const won = right && !save;
    if (guesses.length === 0) track(EVENTS.dailyStarted, { puzzle: puzzle.id });
    if (done) clock.finish(right);
    if (done) track(EVENTS.dailyFinished, { puzzle: puzzle.id, won, guesses: next.length, ...(save ? { saved: true } : {}) });
    else if (WRITTEN_CLUE && next.length === CLUE_AFTER && answer.clue) track(EVENTS.dailyClueRevealed, { puzzle: puzzle.id });
    let s = stats;
    if (done && stats.lastDay !== day) {
      const streak = right ? (stats.lastDay === yesterday(day) ? stats.streak + 1 : 1) : 0;
      const dist = [...stats.dist];
      if (won) dist[next.length - 1] += 1;
      s = { played: stats.played + 1, won: stats.won + (won ? 1 : 0), streak, best: Math.max(stats.best, streak), dist, lastDay: day, saved: (stats.saved ?? 0) + (save ? 1 : 0) };
      setStats(s);
    }
    if (preview) return;
    write({ day, puzzle: puzzle.id, guesses: next, stats: s, help });
    if (done && account?.signedIn) {
      void saveResult(api, day, next).then((a) => {
        if (a) { setAccount(a); if (a.score) setScore(a.score); bump(); }
        else toast.error(activity ? "Couldn't save today's result" : "Couldn't save today's result to your account");
      });
    } else if (activity) {
      void api("/api/daily", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ day, guesses: next }) }).catch(() => { /* the next guess tries again */ });
    }
  };

  const copy = () => navigator.clipboard.writeText(withReferral(shareText(day, hints, solved, undefined, help, times.seconds), referral?.code)).then(() => { track(EVENTS.dailyShared, { puzzle: puzzle.id }); toast.success("Result copied"); }, () => toast.error("Couldn't copy the result"));
  const shareToDiscord = async () => {
    if (!activity?.share) return;
    if (await activity.share(shareText(day, hints, solved, undefined, help, times.seconds))) { track(EVENTS.dailyShared, { puzzle: puzzle.id }); toast.success("Shared"); }
  };

  return (
    <div className="daily">
      <div className="daily__meta">
        <Badge variant="info" size="small">Puzzle #{puzzleNumber(day)}</Badge>
        {label && <Badge variant="default" size="small">{label}</Badge>}
        <span className="party-muted">{elsewhere ? Math.min(elsewhere.guesses, main) : Math.min(hints.length, main)} of {main} guesses{inLastChance || savedIt ? " · last chance" : ""}</span>
      </div>

      {!over && loaded && !started && <DailyStartCard onStart={clock.start}>{fresh && <DailySteps steps={steps} />}</DailyStartCard>}
      {!over && loaded && started && (
        <div className="daily__guess">
          <LabeledCombobox label={`Guess today's ${noun}`} value={pick} onChange={setPick} options={options} placeholder={`Type a ${noun}`} allowCreate={false} />
          <Button variant="primary" disabled={!pick || !options.some((o) => o.value === pick)} onClick={guess}>{inLastChance ? "Take my last chance" : "Guess"}</Button>
        </div>
      )}

      {WRITTEN_CLUE && !over && hints.length >= CLUE_AFTER && answer.clue && (
        <Alert variant="info" title="Clue">{answer.clue}</Alert>
      )}
      {shownHints.length > 0 && (
        <Alert variant="info" title={shownHints.length === 1 ? "Hint" : "Hints"}>
          <ol className="daily__ladder">{shownHints.map((h) => <li key={h.after}>{h.text}</li>)}</ol>
        </Alert>
      )}
      {moreHints && hints.length > 0 && <p className="party-muted daily__next-hint">A new hint after each miss.</p>}
      {inLastChance && (
        <Alert variant="warning" title="Last chance">
          {`${main} guesses down. One more try, just for fun: it keeps your streak going but won't count as a win.`}
        </Alert>
      )}
      {!over && hints.length >= silhouetteAfter(puzzle) && (
        <div className={`daily__silhouette${blur ? " daily__silhouette--blur" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={art(answer.img)} alt={blur ? `Today's ${noun}, blurred` : `Today's ${noun}, as a silhouette`} />
          <span className="party-muted">{blur ? "Last chance: here's a blurry look." : "Last chance: here's their silhouette."}</span>
        </div>
      )}
      {inLastChance && help.letters > 0 && (
        <HelpWord name={answer.name} free={0} bought={help.letters} note="The letters you bought, and a square for every letter." />
      )}
      {inLastChance && !preview && (
        <DailyHelpPanel game="shuffle" info={helpInfo} help={help} signupPath="/daily"
          onBought={(h) => { setLocalHelp(h); write({ day, puzzle: puzzle.id, guesses, stats, help: h }); void reloadHelp(); }} />
      )}

      {fresh && <DailyParade characters={puzzle.characters} art={art} />}

      {loaded && started && starter && !over && hints.length === 0 && (
        <p className="daily__starter"><strong>Starter clue:</strong> {starter.sentence}</p>
      )}

      {loaded && (hints.length > 0 || (started && starter && !elsewhere)) && <p className="daily__scroll-hint" aria-hidden>Swipe the grid for every column →</p>}
      {loaded && (hints.length > 0 || (started && starter && !elsewhere)) && (
        <div className="daily__grid" tabIndex={0} role="region" aria-label="Your guesses so far">
          <Table dense>
            <TableHeader>
              <TableRow>
                <TableHead align="center">Guess</TableHead>
                {traits.map((t) => <TableHead key={t.label} align="center" title={t.label}>{t.short}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {starter && (
                <TableRow className="daily__row--starter">
                  <TableCell><span className="daily__who-name">Starter clue</span></TableCell>
                  {traits.map((t) => (
                    <TableCell key={t.label}>
                      {t === puzzle.traits[starter.trait]
                        ? <span className="daily__cell daily__cell--match" aria-label={`${t.label}: ${starter.value}, given free`}>{starter.value}</span>
                        : <span className="daily__cell daily__cell--blank" aria-label={`${t.label}: unknown`}>?</span>}
                    </TableCell>
                  ))}
                </TableRow>
              )}
              {hints.map((h) => {
                const c = puzzle.characters.find((x) => x.name === h.name)!;
                return (
                  <TableRow key={h.name} className={[h.correct ? "daily__row--win" : "", h.name === flash ? "daily__row--new" : ""].filter(Boolean).join(" ") || undefined}>
                    <TableCell>
                      <span className="daily__who">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={art(c.img)} alt="" className="daily__img" />
                        <span className="daily__who-name">{h.name}</span>
                      </span>
                    </TableCell>
                    {h.cells.map((cell, i) => (
                      <TableCell key={traits[i].label}>
                        <span className={`daily__cell daily__cell--${cell.status}`} aria-label={cellLabel(traits[i], cell)}>{cellText(traits[i], cell)}</span>
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="daily__legend">Green: match · Yellow: close, {puzzle.closeNote ?? DEFAULT_CLOSE_NOTE}</p>
        </div>
      )}

      {over && (
        <div className="daily__done">
          <div className="daily-result">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={art(answer.img)} alt="" className="daily__answer-img" />
            <div className="daily-result__text">
              <p className="oddone__verdict">{savedIt ? "Saved it on the last chance." : solved ? `Got it in ${elsewhere ? elsewhere.guesses : hints.length}!` : "Not today."} It was <strong>{answer.name}</strong>{answer.name.endsWith(".") ? "" : "."}</p>
              <DailySolveTime times={times} solved={solved} />
              <DailyScoreChips score={score} guest={!activity && !account?.signedIn} today={mine.day} week={mine.week} />
              {elsewhere && <p className="party-muted">{activity ? "You played today's puzzle on GameShuffle." : "You played today on another device."}</p>}
              <p className="party-muted daily-result__next">A new puzzle at midnight Pacific time.{puzzleLabel(tomorrow) ? ` Tomorrow's game: ${puzzleLabel(tomorrow)}.` : ""}</p>
            </div>
          </div>
          <div className="daily-actions">
            {hints.length > 0 && (
              <DailiesShare current="shuffle" shareOne={activity?.share ? () => void shareToDiscord() : copy} oneText={activity?.share ? "Share my result" : "Copy my result"} />
            )}
            <DailiesNextButton current="shuffle" onPick={activity?.pickDaily} />
          </div>
          <DailiesYours current="shuffle" only />
          <DailiesInvite current="shuffle" nudge={false} />
          {account && !account.signedIn && (
            <p className="party-muted daily-result__signin">
              <OriginalsLink href="/login?redirect=/daily">Sign in</OriginalsLink>
              {activity ? " to keep your streak on every device and show it on your profile." : " to keep your streak on every device and get an invite link that earns tokens."}
            </p>
          )}
        </div>
      )}

      {!preview && (
        <DailyBoard game="shuffle" main={main} guestId={boards.guestId} refresh={boards.refresh} onViews={onViews}
          join={over && account && !account.signedIn && !activity && boards.guest && !guestOnBoard && hints.length > 0
            ? <DailyBoardJoin onJoin={boards.join} onJoined={() => bump()} tokens={0} />
            : null} />
      )}

      {over && (activity
        ? activity.showTab && <Button variant="secondary" onClick={() => activity.showTab?.("brain")}>Answer a Chat Brain question</Button>
        : <ChatBrainAsk source="daily" eyebrow={null} flat />)}

      <Accordion variant="flush" className="daily-accordion" items={[{
        id: "how",
        title: "How it works",
        content: (
          <>
            {puzzle.lastChance ? (
              <>
                <p>Guess today&apos;s {noun} from {puzzle.characters.length} characters across Nintendo, plus Smash&apos;s guests. Each guess fills a row: {traits.map((t) => t.label.toLowerCase()).join(", ")}. Green is a match and yellow is close ({puzzle.closeNote ?? DEFAULT_CLOSE_NOTE}).</p>
                <p>A hint shows when you tap Start and a new one after each miss, each a little more specific. You have {main} guesses. Miss them all and you get a last chance with their {blur ? "blurry picture" : "silhouette"}: get it then and your streak keeps going, though it doesn&apos;t count as a win. One {noun} a day, the same for everyone.</p>
              </>
            ) : (
              <>
                <p>Guess today&apos;s {label ? `${label} ` : ""}{noun}. Each guess fills a row: {traits.map((t) => t.label.toLowerCase()).join(", ")}. Green is a match and yellow is close ({puzzle.closeNote ?? DEFAULT_CLOSE_NOTE}). {WRITTEN_CLUE ? `After ${CLUE_AFTER} guesses you get a clue, and on` : "On"} your last guess {blur ? "a blurry look at them" : "their silhouette"}. {main} guesses, one {noun} a day, the same for everyone.</p>
                <p>The game changes by day of the week: {rotationText(day)}. Your streak counts every day you solve, whatever the game.</p>
              </>
            )}
            <p>Your time runs from Start to your last guess. On today&apos;s leaderboard, players level on points are ranked by time, fastest first. Points and tokens don&apos;t depend on time.</p>
            {!activity && FIRE_ROUND_PUBLIC && <p>Done for today? <OriginalsLink href="/daily-trivia">Today&apos;s Fire Round</OriginalsLink> is 60 seconds of daily trivia, the same questions for everyone.</p>}
          </>
        ),
      }]} />
      {over && <SupportNudge from="daily" />}
    </div>
  );
}
