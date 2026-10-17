"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Accordion, Alert, Badge, Button, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { DailySteps } from "@/components/originals/DailyParade";
import { DexParade } from "@/components/originals/DexParade";
import { DailyBoard, DailyBoardJoin, DailyScoreChips, useDailyBoards } from "@/components/originals/DailyBoard";
import { SupportNudge } from "@/components/support/SupportNudge";
import { DailiesInvite, DailiesNext, DailiesShare, DailiesYours, sendReferralFinish, useDailies } from "@/components/originals/Dailies";
import { withReferral } from "@/lib/originals/referral";
import { DexCardOfDay } from "@/components/originals/DexCardOfDay";
import { DailyHelpPanel, HelpWord, useDailyHelp } from "@/components/originals/DailyHelp";
import { NO_HELP, type HelpCounts } from "@/lib/originals/dailyHelp";
import { reportDaily, type DailiesEntry } from "@/lib/originals/dailies";
import type { BoardRow, BoardView, ScoreResult, SolveTimes } from "@/lib/daily/boardTypes";
import { DailySolveTime, DailyStartCard, pickTimes, useDailyStart } from "@/components/originals/DailyStart";
import { ChatBrainAsk } from "@/components/chatbrain/ChatBrainAsk";
import { LabeledCombobox } from "@/components/ui/LabeledCombobox";
import { OriginalsLink, useOriginalsHost, type OriginalsHost } from "@/components/originals/OriginalsHost";
import { TypeCard, TypeTile } from "@/components/pokemon/TypeCard";
import { EVENTS, track } from "@/lib/analytics/events";
import { MAX_GUESSES, dayKey, guessFeedback, guessLimits, hintFor, ladderShown, playTraits, shareText, stillFit, type DailyStats, type GuessHint, type TraitCell, type TraitDef } from "@/lib/originals/daily";
import { DEX, DEX_PUZZLE, dexAnswer, dexNumber, dexSearchValue, letterCount } from "@/lib/originals/dailyDex";

/**
 * The Daily Dex (a GameShuffle Original): guess today's Pokémon from all
 * 1,025. Same shape as the Daily Shuffle (DailyShuffle.tsx) on its own
 * calendar and its own streak: a nod before the first guess and a new hint
 * after each miss, five guesses, then a last chance with the name's first
 * letter and length. Pokémon never get art here (the Pokémon imagery rule):
 * guesses wear their type's color and our own icon. Signed in, results save
 * to the account (/api/daily?game=dex); signed out, they live in this browser.
 */

const KEY = "gs-daily-dex";
const API = "/api/daily?game=dex";

interface Stats { played: number; won: number; streak: number; best: number; dist: number[]; lastDay: string | null; saved?: number }
/** `help`: letters and guesses bought today, kept here too so a reload never ends a game early. */
interface Saved { day: string; guesses: string[]; stats: Stats; help?: HelpCounts }
interface Account { signedIn: boolean; stats?: DailyStats | null; today?: { puzzle: string; guesses: number; solved: boolean } | null; progress?: string[] | null; score?: ScoreResult | null; times?: SolveTimes | null }

const EMPTY_STATS: Stats = { played: 0, won: 0, streak: 0, best: 0, dist: Array(MAX_GUESSES).fill(0), lastDay: null };

function read(): Saved | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null; } catch { return null; }
}
function write(s: Saved) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* still playable this visit */ }
}
async function saveResult(api: OriginalsHost["api"], day: string, guesses: string[]): Promise<Account | null> {
  try {
    const res = await api(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ day, guesses }) });
    if (!res.ok) return null;
    return { signedIn: true, ...(await res.json()) } as Account;
  } catch { return null; }
}

const show = (def: TraitDef, v: TraitCell["value"]) => (v === null ? "?" : def.format ? def.format(v) : String(v));
/** The cell: the guess's value, with an arrow toward the answer on the number columns. */
function cellText(def: TraitDef, c: TraitCell): string {
  return `${show(def, c.value)}${c.dir && c.status !== "match" ? (c.dir === "up" ? " ↑" : " ↓") : ""}`;
}
function cellLabel(def: TraitDef, c: TraitCell): string {
  const status = c.status === "match" ? "match" : c.status === "close" ? "close" : "no match";
  const way = c.dir && c.status !== "match" && def.dirWords ? `, the answer is ${c.dir === "up" ? def.dirWords[0] : def.dirWords[1]}` : "";
  return `${def.label}: ${show(def, c.value)}, ${status}${way}`;
}
/** A name's letters only, upper case ("Mr. Mime" → "MRMIME"). */
const lettersOf = (name: string) => [...name].filter((ch) => /\p{L}/u.test(ch)).join("").toUpperCase();

function yesterday(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
}

export function DailyDex() {
  const toast = useToast();
  const { api, activity } = useOriginalsHost();
  // Dev only (ignored in production; a preview saves nothing): ?day=YYYY-MM-DD previews another
  // day, ?answer=<name> plays a chosen Pokémon (for screenshots that show no real upcoming answer).
  const [preview] = useState(() => process.env.NODE_ENV !== "production" && typeof window !== "undefined" && !!(new URLSearchParams(window.location.search).get("day") || new URLSearchParams(window.location.search).get("answer")));
  const [forced] = useState(() => (process.env.NODE_ENV !== "production" && typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("answer") : null));
  const [day] = useState(() => {
    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
      const q = new URLSearchParams(window.location.search).get("day");
      if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
    }
    return dayKey();
  });
  const puzzle = DEX_PUZZLE;
  const answer = useMemo(() => (forced && DEX_PUZZLE.characters.find((c) => c.name.toLowerCase() === forced.toLowerCase())) || dexAnswer(day), [day, forced]);
  const traits = useMemo(() => playTraits(puzzle), [puzzle]);
  const byName = useMemo(() => new Map(puzzle.characters.map((c, i) => [c.name, { c, dex: i + 1 }])), [puzzle]);
  const bySearch = useMemo(() => new Map(puzzle.characters.map((c) => [dexSearchValue(c.name), c.name])), [puzzle]);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [pick, setPick] = useState("");
  /** The guess just made: its row lights up and scrolls into view for a moment. */
  const [flash, setFlash] = useState<string | null>(null);
  /** The list normally shrinks to what still fits; this brings back all 1,025. */
  const [showAll, setShowAll] = useState(false);
  /** Help bought with tokens today (the browser's copy; the server's wins when larger). */
  const [localHelp, setLocalHelp] = useState<HelpCounts>(NO_HELP);
  const { info: helpInfo, help, reload: reloadHelp } = useDailyHelp("dex", localHelp);
  const [loaded, setLoaded] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const boards = useDailyBoards("dex", account ? account.signedIn : null);
  const [score, setScore] = useState<ScoreResult | null>(null);
  const [mine, setMine] = useState<{ day: BoardRow | null; week: BoardRow | null }>({ day: null, week: null });
  const onViews = useCallback((d: BoardView | null, w: BoardView | null) => setMine({ day: d?.you ?? null, week: w?.you ?? null }), []);
  // The Start button: the first hint shows and the solve clock starts (Britton's pick, 2026-10-16).
  const clock = useDailyStart("dex", day, !preview && day === dayKey());

  useEffect(() => {
    let alive = true;
    if (preview) { void Promise.resolve().then(() => setLoaded(true)); return; }
    const s = read();
    const sameDay = !!s && s.day === day;
    void Promise.resolve().then(() => {
      if (s) {
        setStats({ ...EMPTY_STATS, ...s.stats });
        if (sameDay) { setGuesses(s.guesses); setLocalHelp(s.help ?? NO_HELP); }
      }
      setLoaded(true);
    });
    void api(API).then((r) => (r.ok ? r.json() : null)).then(async (a: Account | null) => {
      if (!alive || !a) return;
      // Finished here before signing in (or before the save landed): send it up once.
      const local = sameDay && s ? s.guesses : [];
      const localDone = local.length >= guessLimits(puzzle).total || local.includes(dexAnswer(day).name);
      if (a.signedIn && !a.today && localDone) a = (await saveResult(api, day, local)) ?? a;
      // Guesses saved on the server (the Discord Activity) pick the game back up.
      if (a.progress?.length && !local.length) setGuesses(a.progress);
      if (alive) setAccount(a);
    }).catch(() => { /* browser streaks still work */ });
    return () => { alive = false; };
  }, [day, preview, api, puzzle]);

  const hints = guesses.map((g) => hintFor(g, answer, puzzle)).filter((h): h is GuessHint => !!h);
  // Played today on another device: the account has the result but this browser has no guesses.
  const elsewhere = hints.length === 0 && account?.today ? account.today : null;
  const solved = hints.some((h) => h.correct) || !!elsewhere?.solved;
  // Extra guesses bought with tokens on the last chance add to the total.
  const { main, total: baseTotal } = guessLimits(puzzle);
  const total = baseTotal + help.guesses;
  const over = solved || hints.length >= total || !!elsewhere;
  const inLastChance = !over && hints.length >= main;
  const savedIt = solved && (elsewhere ? elsewhere.guesses : hints.length) > main;
  // Started: tapped Start today, or already guessing (a game from before the button), or done.
  const started = !!clock.startedAt || hints.length > 0 || over;
  const shownHints = over || !started ? [] : ladderShown(answer, hints.length);
  const moreHints = !over && !inLastChance && (answer.ladder ?? []).some((h) => h.after > hints.length);
  const shownStats = account?.signedIn && account.stats ? account.stats : stats;
  const fresh = loaded && !over && hints.length === 0 && !elsewhere;
  const times = pickTimes(account?.times, clock.local, score?.seconds);
  // The list only offers Pokémon the clues still allow (Britton's pick, 2026-10-16): generation with its
  // arrow, types, stage and color (height and weight stay for the player: with them the list gave the
  // answer away by the second or third guess), and on the last chance the first letter and length. A to Z.
  const fits = useMemo(() => {
    if (!guesses.length) return null;
    const shown = guesses.map((g) => hintFor(g, answer, puzzle)).filter((h): h is GuessHint => !!h);
    const list = stillFit(puzzle, shown, ["measure"]).filter((c) => !guesses.includes(c.name));
    if (!inLastChance) return list;
    // The last chance shows the length, the first letter and any bought ones: the names must start the same.
    const n = letterCount(answer.name);
    const start = lettersOf(answer.name).slice(0, 1 + help.letters);
    return list.filter((c) => letterCount(c.name) === n && lettersOf(c.name).startsWith(start));
  }, [puzzle, guesses, answer, inLastChance, help.letters]);
  const options = useMemo(() => {
    const pool = !showAll && fits?.length ? fits : puzzle.characters.filter((c) => !guesses.includes(c.name));
    return pool.map((c) => ({ value: dexSearchValue(c.name), label: c.name })).sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
  }, [puzzle, guesses, fits, showAll]);
  const pickedName = bySearch.get(pick) ?? null;

  // The new row: into view, then the highlight fades.
  useEffect(() => {
    if (!flash) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const raf = requestAnimationFrame(() => document.querySelector(".daily__row--new")?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" }));
    const t = window.setTimeout(() => setFlash(null), 2400);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(t); };
  }, [flash]);

  // The today bar, Next up and the streak cards on every daily's page learn where this game stands.
  const report = loaded && !preview && day === dayKey() ? JSON.stringify({
    day, number: dexNumber(day), state: over ? "done" : hints.length ? "playing" : "fresh",
    result: over ? { guesses: elsewhere ? elsewhere.guesses : hints.length, main, solved, saved: savedIt, seconds: times.seconds } : null,
    stats: { played: shownStats.played, won: shownStats.won, streak: shownStats.streak, best: shownStats.best, saved: shownStats.saved ?? 0, fastest: times.fastest },
  } satisfies DailiesEntry) : "";
  useEffect(() => { if (report) reportDaily("dex", JSON.parse(report) as DailiesEntry); }, [report]);
  // Came from a friend's link: a finished game counts for them once (the server checks it's real).
  const { referral } = useDailies("dex");
  const finishedHere = over && !elsewhere && guesses.length > 0;
  useEffect(() => {
    if (finishedHere && !preview && !activity && day === dayKey()) sendReferralFinish(api, "dex", day, guesses);
  }, [finishedHere, preview, activity, day, api, guesses]);
  const { sendGuestResult, bump } = boards;
  const guestOnBoard = !!boards.guest?.onBoard;

  // A guest on the boards: their finished game goes up once (also after a reload, or right after joining).
  useEffect(() => {
    if (preview || activity || !over || !guestOnBoard || !guesses.length) return;
    void sendGuestResult(day, guesses).then((sc) => { if (sc) setScore(sc); });
  }, [preview, activity, over, guestOnBoard, guesses, day, sendGuestResult]);

  const guess = () => {
    const name = pickedName;
    if (!name || over || guesses.includes(name)) return;
    const next = [...guesses, name];
    setGuesses(next);
    setPick("");
    const right = name === answer.name;
    const done = right || next.length >= total;
    // Say what the guess did (Britton's pick, 2026-10-16), and light up its row.
    const made = hintFor(name, answer, puzzle);
    if (made) {
      const fb = guessFeedback(made, next.length, puzzle, ladderShown(answer, next.length).length > ladderShown(answer, guesses.length).length, help.guesses);
      toast[fb.tone](fb.text);
    }
    if (!done) setFlash(name);
    const save = right && next.length > main;
    const won = right && !save;
    if (guesses.length === 0) track(EVENTS.dailyStarted, { puzzle: puzzle.id });
    if (done) clock.finish(right);
    if (done) track(EVENTS.dailyFinished, { puzzle: puzzle.id, won, guesses: next.length, ...(save ? { saved: true } : {}) });
    let s = stats;
    if (done && stats.lastDay !== day) {
      const streak = right ? (stats.lastDay === yesterday(day) ? stats.streak + 1 : 1) : 0;
      const dist = [...stats.dist];
      if (won) dist[next.length - 1] += 1;
      s = { played: stats.played + 1, won: stats.won + (won ? 1 : 0), streak, best: Math.max(stats.best, streak), dist, lastDay: day, saved: (stats.saved ?? 0) + (save ? 1 : 0) };
      setStats(s);
    }
    if (preview) return;
    write({ day, guesses: next, stats: s, help });
    if (done && account?.signedIn) {
      void saveResult(api, day, next).then((a) => {
        if (a) { setAccount(a); if (a.score) setScore(a.score); bump(); }
        else toast.error(activity ? "Couldn't save today's result" : "Couldn't save today's result to your account");
      });
    } else if (activity) {
      // The Activity saves guesses as they go, so reopening it picks the game back up.
      void api(API, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ day, guesses: next }) }).catch(() => { /* the next guess tries again */ });
    }
  };

  const copy = () => navigator.clipboard.writeText(withReferral(shareText(day, hints, solved, DEX, help, times.seconds), referral?.code))
    .then(() => { track(EVENTS.dailyShared, { puzzle: puzzle.id }); toast.success("Result copied"); }, () => toast.error("Couldn't copy the result"));
  const shareToDiscord = async () => {
    if (!activity?.share) return;
    if (await activity.share(shareText(day, hints, solved, DEX, help, times.seconds))) { track(EVENTS.dailyShared, { puzzle: puzzle.id }); toast.success("Shared"); }
  };

  const steps = [
    { icon: "hint" as const, title: "Read the hint", text: "A nod to today's Pokémon, with a new one after each miss." },
    { icon: "guess" as const, title: "Guess any Pokémon", text: "All 1,025 are in. Type a name to guess." },
    { icon: "colors" as const, title: "Follow the colors", text: `Green matches, yellow is close, arrows point the way. ${main} guesses, then a last chance.` },
  ];
  const answerDex = byName.get(answer.name)?.dex ?? 0;

  return (
    <div className="daily">
      <div className="daily__meta">
        {/* After load: a dev ?day= preview differs from the server's day, and before launch the number is below 1. */}
        {loaded && <Badge variant="info" size="small">{dexNumber(day) >= 1 ? `Puzzle #${dexNumber(day)}` : "Preview"}</Badge>}
        <span className="party-muted">{elsewhere ? Math.min(elsewhere.guesses, main) : Math.min(hints.length, main)} of {main} guesses{inLastChance || savedIt ? " · last chance" : ""}</span>
      </div>

      {!over && loaded && !started && <DailyStartCard onStart={clock.start} what="Pokémon" />}
      {!over && loaded && started && (
        <div className="daily__guess">
          <LabeledCombobox label="Guess today's Pokémon" value={pick} onChange={setPick} options={options} placeholder="Type a Pokémon" />
          <Button variant="primary" disabled={!pickedName} onClick={guess}>{inLastChance ? "Take my last chance" : "Guess"}</Button>
        </div>
      )}
      {!over && loaded && fits && (
        <div className="dex-fit">
          <span><strong>{fits.length.toLocaleString("en-US")}</strong> {fits.length === 1 ? "Pokémon still fits" : "Pokémon still fit"} your clues</span>
          <Switch size="small" label="Show all" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
        </div>
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
      {inLastChance && (
        <HelpWord name={answer.name} free={1} bought={help.letters}
          note={help.letters ? "Last chance: the first letter, the letters you bought in gold, and a square for every letter." : "Last chance: its first letter, and a square for every letter."} />
      )}
      {/* A dev preview shows it too (for screenshots); purchases there count for today's real game. */}
      {inLastChance && (
        <DailyHelpPanel game="dex" info={helpInfo} help={help} signupPath="/daily-dex"
          onBought={(h) => { setLocalHelp(h); write({ day, guesses, stats, help: h }); void reloadHelp(); }} />
      )}

      {fresh && <DexParade names={puzzle.characters} />}
      {fresh && <DailySteps steps={steps} />}

      {loaded && hints.length > 0 && <p className="daily__scroll-hint" aria-hidden>Swipe the grid for every column →</p>}
      {loaded && hints.length > 0 && (
        <div className="daily__grid" tabIndex={0} role="region" aria-label="Your guesses so far">
          <Table dense>
            <TableHeader>
              <TableRow>
                <TableHead align="center">Guess</TableHead>
                {traits.map((t) => <TableHead key={t.label} align="center" title={t.label}>{t.short}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {hints.map((h) => {
                const c = byName.get(h.name)?.c;
                return (
                  <TableRow key={h.name} className={[h.correct ? "daily__row--win" : "", h.name === flash ? "daily__row--new" : ""].filter(Boolean).join(" ") || undefined}>
                    <TableCell>
                      <span className="daily__who">
                        <TypeTile types={c?.types ?? []} size="small" />
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
          <p className="daily__legend">Green: match · Yellow: close, {puzzle.closeNote}</p>
          <p className="daily__legend">{puzzle.arrowNote}</p>
        </div>
      )}

      {over && (
        <div className="daily__done">
          <div className="dex-answer"><TypeCard dex={answerDex} name={answer.name} types={answer.types ?? []} /></div>
          <p className="oddone__verdict">{savedIt ? "Saved it on the last chance." : solved ? `Got it in ${elsewhere ? elsewhere.guesses : hints.length}!` : "Not today."} It was <strong>{answer.name}</strong>.</p>
          <DailySolveTime times={times} solved={solved} />
          {!activity && answerDex > 0 && <DexCardOfDay dex={answerDex} signedIn={!!account?.signedIn} />}
          <DailyScoreChips score={score} guest={!activity && !account?.signedIn} today={mine.day} week={mine.week} />
          {elsewhere && <p className="party-muted">{activity ? "You played today's Pokémon on GameShuffle." : "You played today on another device."}</p>}
          <p className="party-muted">A new Pokémon at midnight Pacific time.</p>
          {hints.length > 0 && (
            <DailiesShare current="dex" shareOne={activity?.share ? () => void shareToDiscord() : copy} oneText={activity?.share ? "Share my result" : "Copy my result"} />
          )}
          <div className="dailies-pair">
            <DailiesNext current="dex" onPick={activity?.pickDaily} />
            <DailiesInvite current="dex" />
          </div>
          <DailiesYours current="dex" />
          {account && !account.signedIn && !activity && boards.guest && !guestOnBoard && hints.length > 0 && (
            <DailyBoardJoin onJoin={boards.join} onJoined={() => bump()} tokens={0} />
          )}
          {account && !account.signedIn && (
            <p className="party-muted"><OriginalsLink href="/login?redirect=/daily-dex">Sign in</OriginalsLink> to keep your streak on every device and show it on your profile.</p>
          )}
          <SupportNudge from="dex" />
        </div>
      )}

      {!preview && <DailyBoard game="dex" main={main} guestId={boards.guestId} refresh={boards.refresh} onViews={onViews} />}

      {over && (activity
        ? activity.showTab && <Button variant="secondary" onClick={() => activity.showTab?.("brain")}>Answer a Chat Brain question</Button>
        : <ChatBrainAsk source="daily" />)}

      <Accordion variant="bordered" items={[{
        id: "how",
        title: "How it works",
        content: (
          <>
            <p>Guess today&apos;s Pokémon from all 1,025. Each guess fills a row: {traits.map((t) => t.label.toLowerCase()).join(", ")}. Green is a match and yellow is close ({puzzle.closeNote}). On generation, height and weight an arrow shows which way the answer is.</p>
            <p>A hint shows when you tap Start and a new one after each miss, each a little more specific. You have {main} guesses. Miss them all and you get a last chance with the first letter of its name and a square for every letter: get it then and your streak keeps going, though it doesn&apos;t count as a win. One Pokémon a day, the same for everyone. Evolution stage: First, Middle or Final in its family, or Doesn&apos;t evolve.</p>
            <p>Your time runs from Start to your last guess. On today&apos;s leaderboard, players level on points are ranked by time, fastest first. Points and tokens don&apos;t depend on time.</p>
          </>
        ),
      }]} />
    </div>
  );
}
