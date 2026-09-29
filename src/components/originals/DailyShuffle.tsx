"use client";

import { useEffect, useMemo, useState } from "react";
import { Accordion, Badge, Button, Combobox } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { DAILY_CHARACTERS, MAX_GUESSES, answerFor, dayKey, hintFor, puzzleNumber, shareText, type GuessHint } from "@/lib/originals/daily";

/**
 * The Daily Shuffle (a GameShuffle Original): guess today's Mario Kart 8
 * Deluxe character in six tries. Progress and streaks live in this browser for
 * now; account streaks come with their own table.
 */

const KEY = "gs-daily-shuffle";

interface Stats { played: number; won: number; streak: number; best: number; dist: number[]; lastDay: string | null }
interface Saved { day: string; guesses: string[]; stats: Stats }

const EMPTY_STATS: Stats = { played: 0, won: 0, streak: 0, best: 0, dist: Array(MAX_GUESSES).fill(0), lastDay: null };

function read(): Saved | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null; } catch { return null; }
}
function write(s: Saved) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* still playable this visit */ }
}
function yesterday(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
}

export function DailyShuffle() {
  const toast = useToast();
  const [day] = useState(() => dayKey());
  const answer = useMemo(() => answerFor(day), [day]);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [pick, setPick] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void Promise.resolve().then(() => {
      const s = read();
      if (s) {
        setStats({ ...EMPTY_STATS, ...s.stats });
        if (s.day === day) setGuesses(s.guesses);
      }
      setLoaded(true);
    });
  }, [day]);

  const hints = guesses.map((g) => hintFor(g, answer)).filter((h): h is GuessHint => !!h);
  const solved = hints.some((h) => h.correct);
  const over = solved || hints.length >= MAX_GUESSES;
  const options = DAILY_CHARACTERS.filter((c) => !guesses.includes(c.name)).map((c) => ({ value: c.name, label: c.name }));

  const guess = () => {
    if (!pick || over || guesses.includes(pick) || !DAILY_CHARACTERS.some((c) => c.name === pick)) return;
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
    write({ day, guesses: next, stats: s });
  };

  const copy = () => navigator.clipboard.writeText(shareText(day, hints, solved)).then(() => toast.success("Result copied"), () => toast.error("Couldn't copy the result"));

  return (
    <div className="daily">
      <div className="daily__meta">
        <Badge variant="info" size="small">Puzzle #{puzzleNumber(day)}</Badge>
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
            const c = DAILY_CHARACTERS.find((x) => x.name === h.name)!;
            return (
              <li key={h.name} className={`daily__row${h.correct ? " daily__row--win" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.img} alt="" className="daily__img" />
                <span className="daily__name">{h.name}</span>
                <span className="daily__hints">
                  <Badge variant={h.weight ? "success" : "default"} size="small">{c.weight}{h.weight ? " ✓" : ""}</Badge>
                  <Badge variant={h.group ? "success" : "default"} size="small">{c.group}{h.group ? " ✓" : ""}</Badge>
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
          <p className="oddone__verdict">{solved ? `Got it in ${hints.length}!` : "Not today."} It was <strong>{answer.name}</strong>.</p>
          <p className="party-muted">A new character at midnight UTC.</p>
          <span className="party-row">
            <Button variant="primary" onClick={copy}>Copy my result</Button>
          </span>
          <ul className="daily__stats">
            <li><strong>{stats.played}</strong><span>Played</span></li>
            <li><strong>{stats.played ? Math.round((stats.won / stats.played) * 100) : 0}%</strong><span>Won</span></li>
            <li><strong>{stats.streak}</strong><span>Streak</span></li>
            <li><strong>{stats.best}</strong><span>Best</span></li>
          </ul>
        </div>
      )}

      <Accordion variant="bordered" items={[{
        id: "how",
        title: "How it works",
        content: <p>Guess today&apos;s Mario Kart 8 Deluxe character. After each guess you see whether the weight class and the group match the answer, and whether the answer comes earlier or later in A to Z. Six guesses, one character a day, the same for everyone.</p>,
      }]} />
    </div>
  );
}
