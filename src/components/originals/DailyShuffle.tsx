"use client";

import { useEffect, useMemo, useState } from "react";
import { Accordion, Alert, Badge, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { ChatBrainAsk } from "@/components/chatbrain/ChatBrainAsk";
import { LabeledCombobox } from "@/components/ui/LabeledCombobox";
import { OriginalsLink, useArtSrc, useOriginalsHost, type OriginalsHost } from "@/components/originals/OriginalsHost";
import { EVENTS, track } from "@/lib/analytics/events";
import {
  CLUE_AFTER, DEFAULT_ARROW_NOTE, DEFAULT_CLOSE_NOTE, MAX_GUESSES, SILHOUETTE_AFTER, answerFor, dayKey, hintFor, previewPuzzle, puzzleFor, puzzleNumber, rotationFor, PUZZLES, shareText, starterFor,
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

interface Stats { played: number; won: number; streak: number; best: number; dist: number[]; lastDay: string | null }
/** `puzzle` is missing on saves from before the rotation; those were all Mario Kart 8 Deluxe. */
interface Saved { day: string; puzzle?: string; guesses: string[]; stats: Stats }

const EMPTY_STATS: Stats = { played: 0, won: 0, streak: 0, best: 0, dist: Array(MAX_GUESSES).fill(0), lastDay: null };

function read(): Saved | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null; } catch { return null; }
}
function write(s: Saved) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* still playable this visit */ }
}
interface Account { signedIn: boolean; stats?: DailyStats | null; today?: { puzzle: string; guesses: number; solved: boolean } | null; progress?: string[] | null }

async function saveResult(api: OriginalsHost["api"], day: string, guesses: string[]): Promise<Account | null> {
  try {
    const res = await api("/api/daily", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ day, guesses }) });
    if (!res.ok) return null;
    return { signedIn: true, ...(await res.json()) } as Account;
  } catch { return null; }
}

/** What a cell says: the guess's value, plus an arrow toward the answer when it isn't a match. */
function cellText(def: TraitDef, c: TraitCell): string {
  const v = c.value === null ? (def.kind === "year" ? "Never" : "?") : String(c.value);
  return c.dir ? `${v} ${c.dir === "up" ? "↑" : "↓"}` : v;
}
function cellLabel(def: TraitDef, c: TraitCell): string {
  const [up, down] = def.dirWords ?? (def.kind === "ordered" ? ["heavier", "lighter"] : ["later", "earlier"]);
  const way = !c.dir ? "" : `, answer is ${c.dir === "up" ? up : down}`;
  return `${def.label}: ${c.value ?? "never"}, ${c.status === "match" ? "match" : c.status === "close" ? "close" : "no match"}${way}`;
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
  const tomorrow = useMemo(() => puzzleFor(new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)), [day]);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [pick, setPick] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);

  useEffect(() => {
    let alive = true;
    if (preview) { void Promise.resolve().then(() => setLoaded(true)); return; }
    const s = read();
    // Guesses only carry over for the same day AND the same puzzle.
    const sameGame = !!s && s.day === day && (s.puzzle ?? "mk8dx-character") === puzzleFor(day).id;
    void Promise.resolve().then(() => {
      if (s) {
        setStats({ ...EMPTY_STATS, ...s.stats });
        if (sameGame) setGuesses(s.guesses);
      }
      setLoaded(true);
    });
    void api("/api/daily").then((r) => (r.ok ? r.json() : null)).then(async (a: Account | null) => {
      if (!alive || !a) return;
      // Finished here before signing in (or before the save landed): send it up once.
      const local = sameGame && s ? s.guesses : [];
      const localDone = local.length >= MAX_GUESSES || local.includes(answerFor(day).name);
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
  const over = solved || hints.length >= MAX_GUESSES || !!elsewhere;
  const shown = account?.signedIn && account.stats ? account.stats : stats;
  const noun = puzzle.noun ?? "character";
  const blur = puzzle.reveal === "blur";
  const options = puzzle.characters.filter((c) => !guesses.includes(c.name)).map((c) => ({ value: c.name, label: c.name }));

  const guess = () => {
    if (!pick || over || guesses.includes(pick) || !puzzle.characters.some((c) => c.name === pick)) return;
    const next = [...guesses, pick];
    setGuesses(next);
    setPick("");
    const won = pick === answer.name;
    const done = won || next.length >= MAX_GUESSES;
    if (guesses.length === 0) track(EVENTS.dailyStarted, { puzzle: puzzle.id });
    if (done) track(EVENTS.dailyFinished, { puzzle: puzzle.id, won, guesses: next.length });
    else if (next.length === CLUE_AFTER && answer.clue) track(EVENTS.dailyClueRevealed, { puzzle: puzzle.id });
    let s = stats;
    if (done && stats.lastDay !== day) {
      const streak = won ? (stats.lastDay === yesterday(day) ? stats.streak + 1 : 1) : 0;
      const dist = [...stats.dist];
      if (won) dist[next.length - 1] += 1;
      s = { played: stats.played + 1, won: stats.won + (won ? 1 : 0), streak, best: Math.max(stats.best, streak), dist, lastDay: day };
      setStats(s);
    }
    if (preview) return;
    write({ day, puzzle: puzzle.id, guesses: next, stats: s });
    if (done && account?.signedIn) {
      void saveResult(api, day, next).then((a) => {
        if (a) setAccount(a);
        else toast.error(activity ? "Couldn't save today's result" : "Couldn't save today's result to your account");
      });
    } else if (activity) {
      void api("/api/daily", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ day, guesses: next }) }).catch(() => { /* the next guess tries again */ });
    }
  };

  const copy = () => navigator.clipboard.writeText(shareText(day, hints, solved)).then(() => { track(EVENTS.dailyShared, { puzzle: puzzle.id }); toast.success("Result copied"); }, () => toast.error("Couldn't copy the result"));
  const shareToDiscord = async () => {
    if (!activity?.share) return;
    if (await activity.share(shareText(day, hints, solved))) { track(EVENTS.dailyShared, { puzzle: puzzle.id }); toast.success("Shared"); }
  };

  return (
    <div className="daily">
      <div className="daily__meta">
        <Badge variant="info" size="small">Puzzle #{puzzleNumber(day)}</Badge>
        <Badge variant="default" size="small">{puzzle.game}</Badge>
        <span className="party-muted">{elsewhere ? elsewhere.guesses : Math.min(hints.length, MAX_GUESSES)} of {MAX_GUESSES} guesses</span>
      </div>

      {!over && loaded && (
        <div className="daily__guess">
          <LabeledCombobox label={`Guess today's ${noun}`} value={pick} onChange={setPick} options={options} placeholder={`Type a ${noun}`} />
          <Button variant="primary" disabled={!pick || !options.some((o) => o.value === pick)} onClick={guess}>Guess</Button>
        </div>
      )}

      {!over && hints.length >= CLUE_AFTER && answer.clue && (
        <Alert variant="info" title="Clue">{answer.clue}</Alert>
      )}
      {!over && hints.length >= SILHOUETTE_AFTER && (
        <div className={`daily__silhouette${blur ? " daily__silhouette--blur" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={art(answer.img)} alt={blur ? `Today's ${noun}, blurred` : `Today's ${noun}, as a silhouette`} />
          <span className="party-muted">{blur ? "Last chances: here's a blurry look." : "Last chances: here's their silhouette."}</span>
        </div>
      )}

      {loaded && starter && !over && hints.length === 0 && (
        <p className="daily__starter"><strong>Starter clue:</strong> {starter.sentence}</p>
      )}

      {loaded && (hints.length > 0 || (starter && !elsewhere)) && <p className="daily__scroll-hint" aria-hidden>Swipe the grid for every column →</p>}
      {loaded && (hints.length > 0 || (starter && !elsewhere)) && (
        <div className="daily__grid" tabIndex={0} role="region" aria-label="Your guesses so far">
          <Table dense>
            <TableHeader>
              <TableRow>
                <TableHead align="center">Guess</TableHead>
                {puzzle.traits.map((t) => <TableHead key={t.label} align="center" title={t.label}>{t.short}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {starter && (
                <TableRow className="daily__row--starter">
                  <TableCell><span className="daily__who-name">Starter clue</span></TableCell>
                  {puzzle.traits.map((t, i) => (
                    <TableCell key={t.label}>
                      {i === starter.trait
                        ? <span className="daily__cell daily__cell--match" aria-label={`${t.label}: ${starter.value}, given free`}>{starter.value}</span>
                        : <span className="daily__cell daily__cell--blank" aria-label={`${t.label}: unknown`}>?</span>}
                    </TableCell>
                  ))}
                </TableRow>
              )}
              {hints.map((h) => {
                const c = puzzle.characters.find((x) => x.name === h.name)!;
                return (
                  <TableRow key={h.name} className={h.correct ? "daily__row--win" : undefined}>
                    <TableCell>
                      <span className="daily__who">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={art(c.img)} alt="" className="daily__img" />
                        <span className="daily__who-name">{h.name}</span>
                      </span>
                    </TableCell>
                    {h.cells.map((cell, i) => (
                      <TableCell key={puzzle.traits[i].label}>
                        <span className={`daily__cell daily__cell--${cell.status}`} aria-label={cellLabel(puzzle.traits[i], cell)}>{cellText(puzzle.traits[i], cell)}</span>
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="daily__legend">Green: match · Yellow: {puzzle.closeNote ?? DEFAULT_CLOSE_NOTE} · {puzzle.arrowNote ?? DEFAULT_ARROW_NOTE}</p>
        </div>
      )}

      {over && (
        <div className="daily__done">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={art(answer.img)} alt="" className="daily__answer-img" />
          <p className="oddone__verdict">{solved ? `Got it in ${elsewhere ? elsewhere.guesses : hints.length}!` : "Not today."} It was <strong>{answer.name}</strong>{answer.name.endsWith(".") ? "" : "."}</p>
          {elsewhere && <p className="party-muted">{activity ? "You played today's puzzle on GameShuffle." : "You played today on another device."}</p>}
          <p className="party-muted">A new puzzle at midnight Pacific time. Tomorrow&apos;s game: {tomorrow.game}.</p>
          {hints.length > 0 && (
            <span className="party-row">
              {activity?.share
                ? <Button variant="primary" onClick={() => void shareToDiscord()}>Share my result</Button>
                : <Button variant="primary" onClick={copy}>Copy my result</Button>}
            </span>
          )}
          <ul className="daily__stats">
            <li><strong>{shown.played}</strong><span>Played</span></li>
            <li><strong>{shown.played ? Math.round((shown.won / shown.played) * 100) : 0}%</strong><span>Won</span></li>
            <li><strong>{shown.streak}</strong><span>Streak</span></li>
            <li><strong>{shown.best}</strong><span>Best</span></li>
          </ul>
          {account && !account.signedIn && (
            <p className="party-muted"><OriginalsLink href="/login?redirect=/daily">Sign in</OriginalsLink> to keep your streak on every device and show it on your profile.</p>
          )}
        </div>
      )}

      {over && (activity
        ? activity.showTab && <Button variant="secondary" onClick={() => activity.showTab?.("brain")}>Answer a Chat Brain question</Button>
        : <ChatBrainAsk source="daily" />)}

      <Accordion variant="bordered" items={[{
        id: "how",
        title: "How it works",
        content: (
          <>
            <p>Guess today&apos;s {puzzle.game} {noun}. Each guess fills a row: {puzzle.traits.map((t) => t.label.toLowerCase()).join(", ")}. Green is a match, yellow is close ({puzzle.closeNote ?? DEFAULT_CLOSE_NOTE}), and arrows point the way ({(puzzle.arrowNote ?? DEFAULT_ARROW_NOTE).replace(/[↑↓] /g, "")}). After {CLUE_AFTER} guesses you get a clue, and on your last two guesses {blur ? "a blurry look at them" : "their silhouette"}. Before your first guess you get one column free, the starter clue. Six guesses, one {noun} a day, the same for everyone.</p>
            <p>The game changes by day of the week: {rotationText(day)}. Your streak counts every day you solve, whatever the game.</p>
          </>
        ),
      }]} />
    </div>
  );
}
