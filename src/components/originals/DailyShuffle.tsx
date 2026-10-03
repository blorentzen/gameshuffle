"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Accordion, Badge, Button, Combobox } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { MAX_GUESSES, answerFor, dayKey, hintFor, puzzleFor, puzzleNumber, shareText, type DailyStats, type GuessHint } from "@/lib/originals/daily";

/**
 * The Daily Shuffle (a GameShuffle Original): guess today's character in six
 * tries. The game rotates by weekday (Mario Kart 8 Deluxe, Mario Kart World,
 * Mario Party; see ROTATION). Signed in, results are saved to the account
 * (/api/daily) and streaks follow you across devices; signed out, they live in
 * this browser.
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
interface Account { signedIn: boolean; stats?: DailyStats | null; today?: { puzzle: string; guesses: number; solved: boolean } | null }

async function saveResult(day: string, guesses: string[]): Promise<Account | null> {
  try {
    const res = await fetch("/api/daily", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ day, guesses }) });
    if (!res.ok) return null;
    return { signedIn: true, ...(await res.json()) } as Account;
  } catch { return null; }
}

function yesterday(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
}

export function DailyShuffle() {
  const toast = useToast();
  const [day] = useState(() => dayKey());
  const puzzle = useMemo(() => puzzleFor(day), [day]);
  const answer = useMemo(() => answerFor(day), [day]);
  const tomorrow = useMemo(() => puzzleFor(new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)), [day]);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [pick, setPick] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);

  useEffect(() => {
    let alive = true;
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
    void fetch("/api/daily").then((r) => (r.ok ? r.json() : null)).then(async (a: Account | null) => {
      if (!alive || !a) return;
      // Finished here before signing in (or before the save landed): send it up once.
      const local = sameGame && s ? s.guesses : [];
      const localDone = local.length >= MAX_GUESSES || local.includes(answerFor(day).name);
      if (a.signedIn && !a.today && localDone) a = (await saveResult(day, local)) ?? a;
      if (alive) setAccount(a);
    }).catch(() => { /* browser streaks still work */ });
    return () => { alive = false; };
  }, [day]);

  const hints = guesses.map((g) => hintFor(g, answer, puzzle)).filter((h): h is GuessHint => !!h);
  // Played today on another device: the account has the result but this browser has no guesses.
  // (Only for today's puzzle: on the day the rotation shipped, a morning result may be for another game.)
  const elsewhere = hints.length === 0 && account?.today?.puzzle === puzzle.id ? account.today : null;
  const solved = hints.some((h) => h.correct) || !!elsewhere?.solved;
  const over = solved || hints.length >= MAX_GUESSES || !!elsewhere;
  const shown = account?.signedIn && account.stats ? account.stats : stats;
  const options = puzzle.characters.filter((c) => !guesses.includes(c.name)).map((c) => ({ value: c.name, label: c.name }));

  const guess = () => {
    if (!pick || over || guesses.includes(pick) || !puzzle.characters.some((c) => c.name === pick)) return;
    const next = [...guesses, pick];
    setGuesses(next);
    setPick("");
    const won = pick === answer.name;
    const done = won || next.length >= MAX_GUESSES;
    let s = stats;
    if (done && stats.lastDay !== day) {
      const streak = won ? (stats.lastDay === yesterday(day) ? stats.streak + 1 : 1) : 0;
      const dist = [...stats.dist];
      if (won) dist[next.length - 1] += 1;
      s = { played: stats.played + 1, won: stats.won + (won ? 1 : 0), streak, best: Math.max(stats.best, streak), dist, lastDay: day };
      setStats(s);
    }
    write({ day, puzzle: puzzle.id, guesses: next, stats: s });
    if (done && account?.signedIn) {
      void saveResult(day, next).then((a) => {
        if (a) setAccount(a);
        else toast.error("Couldn't save today's result to your account");
      });
    }
  };

  const copy = () => navigator.clipboard.writeText(shareText(day, hints, solved)).then(() => toast.success("Result copied"), () => toast.error("Couldn't copy the result"));

  return (
    <div className="daily">
      <div className="daily__meta">
        <Badge variant="info" size="small">Puzzle #{puzzleNumber(day)}</Badge>
        <Badge variant="default" size="small">{puzzle.game}</Badge>
        <span className="party-muted">{Math.min(hints.length, MAX_GUESSES)} of {MAX_GUESSES} guesses</span>
      </div>

      {!over && loaded && (
        <div className="daily__guess">
          <Combobox value={pick} onChange={setPick} options={options} placeholder="Type a character" />
          <Button variant="primary" disabled={!pick || !options.some((o) => o.value === pick)} onClick={guess}>Guess</Button>
        </div>
      )}

      {hints.length > 0 && (
        <ol className="daily__rows">
          {hints.map((h) => {
            const c = puzzle.characters.find((x) => x.name === h.name)!;
            return (
              <li key={h.name} className={`daily__row${h.correct ? " daily__row--win" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.img} alt="" className="daily__img" />
                <span className="daily__name">{h.name}</span>
                <span className="daily__hints">
                  {c.traits.map((t, i) => (
                    <Badge key={puzzle.traits[i]} variant={h.traits[i] ? "success" : "default"} size="small">{t}{h.traits[i] ? " ✓" : ""}</Badge>
                  ))}
                  {!h.correct && <Badge variant="info" size="small">{h.alpha === "earlier" ? "Answer is earlier in A to Z" : "Answer is later in A to Z"}</Badge>}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {over && (
        <div className="daily__done">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={answer.img} alt="" className="daily__answer-img" />
          <p className="oddone__verdict">{solved ? `Got it in ${elsewhere ? elsewhere.guesses : hints.length}!` : "Not today."} It was <strong>{answer.name}</strong>.</p>
          {elsewhere && <p className="party-muted">You played today on another device.</p>}
          <p className="party-muted">A new character at midnight UTC. Tomorrow&apos;s game: {tomorrow.game}.</p>
          {hints.length > 0 && (
            <span className="party-row">
              <Button variant="primary" onClick={copy}>Copy my result</Button>
            </span>
          )}
          <ul className="daily__stats">
            <li><strong>{shown.played}</strong><span>Played</span></li>
            <li><strong>{shown.played ? Math.round((shown.won / shown.played) * 100) : 0}%</strong><span>Won</span></li>
            <li><strong>{shown.streak}</strong><span>Streak</span></li>
            <li><strong>{shown.best}</strong><span>Best</span></li>
          </ul>
          {account && !account.signedIn && (
            <p className="party-muted"><Link href="/login?redirect=/daily">Sign in</Link> to keep your streak on every device and show it on your profile.</p>
          )}
        </div>
      )}

      <Accordion variant="bordered" items={[{
        id: "how",
        title: "How it works",
        content: (
          <>
            <p>Guess today&apos;s {puzzle.game} character. After each guess you see whether the {puzzle.traits.map((t) => t.toLowerCase()).join(" and the ")} match the answer, and whether the answer comes earlier or later in A to Z. Six guesses, one character a day, the same for everyone.</p>
            <p>The game changes by day of the week: Mario Kart 8 Deluxe on Sunday, Monday and Thursday, Mario Kart World on Tuesday and Friday, and Mario Party on Wednesday and Saturday. Your streak counts every day you solve, whatever the game.</p>
          </>
        ),
      }]} />
    </div>
  );
}
