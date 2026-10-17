"use client";

/**
 * "Start today's puzzle" (Britton's pick, 2026-10-16): the first hint and the
 * guess box stay hidden until the player starts, and starting is when the
 * solve clock begins. The server stamps the Start (/api/daily/start) so a
 * time can't be made up; this browser also keeps it (localStorage
 * `gs-daily-starts`) to show a time to players who aren't signed in, and the
 * finished time once the game is over.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@empac/cascadeds";
import { IconPlayerPlay, IconStopwatch } from "@tabler/icons-react";
import { formatTime } from "@/lib/originals/dailies";
import type { SolveTimes } from "@/lib/daily/boardTypes";
import { useOriginalsHost } from "@/components/originals/OriginalsHost";
import { guestRequestId } from "@/components/originals/DailyBoard";

const KEY = "gs-daily-starts";
/** Per game: today's Start (`day`, `at` in ms), the finished time, and this browser's best and count of timed solves. */
type Entry = { day: string; at: number; seconds?: number | null; fastest?: number | null; timed?: number };
type Starts = Partial<Record<"shuffle" | "dex", Entry>>;

function read(): Starts {
  try { return (JSON.parse(localStorage.getItem(KEY) ?? "null") as Starts | null) ?? {}; } catch { return {}; }
}
function write(s: Starts) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* this visit only */ }
}

/**
 * Today's Start for a game: `startedAt` (ms, this browser's), `start()` to
 * begin, `finish(solved)` to keep this browser's time when the game ends, and
 * the browser's own times for players the server has no time for.
 */
export function useDailyStart(game: "shuffle" | "dex", day: string, enabled: boolean) {
  const { api } = useOriginalsHost();
  const [entry, setEntry] = useState<Entry | null>(null);

  useEffect(() => {
    const s = read()[game] ?? null;
    void Promise.resolve().then(() => setEntry(s));
  }, [game, day]);

  const start = useCallback(() => {
    const all = read();
    const prev = all[game];
    const next: Entry = { day, at: Date.now(), fastest: prev?.fastest ?? null, timed: prev?.timed ?? 0 };
    all[game] = next;
    write(all);
    setEntry(next);
    if (enabled) {
      void api("/api/daily/start", { method: "POST", headers: { "Content-Type": "application/json", "x-daily-guest": guestRequestId() }, body: JSON.stringify({ game }) }).catch(() => {});
    }
  }, [api, day, enabled, game]);

  /** The game is over: keep this browser's time (and best, when solved). */
  const finish = useCallback((solved: boolean) => {
    const all = read();
    const cur = all[game];
    if (!cur || cur.day !== day || cur.seconds != null) return;
    const seconds = Math.max(0, Math.round((Date.now() - cur.at) / 1000));
    const next: Entry = solved
      ? { ...cur, seconds, fastest: cur.fastest == null ? seconds : Math.min(cur.fastest, seconds), timed: (cur.timed ?? 0) + 1 }
      : { ...cur, seconds };
    all[game] = next;
    write(all);
    setEntry(next);
  }, [day, game]);

  const today = entry && entry.day === day ? entry : null;
  const local: SolveTimes = { seconds: today?.seconds ?? null, fastest: entry?.fastest ?? null, timed: entry?.timed ?? 0 };
  return { startedAt: today?.at ?? null, local, start, finish };
}

/**
 * The times to show: the server's when it timed today's game (accounts, the
 * Activity), else this browser's, else a guest board's score.
 */
export function pickTimes(server: SolveTimes | null | undefined, local: SolveTimes, scoreSeconds?: number | null): SolveTimes {
  if (server && server.seconds != null) return server;
  if (local.seconds != null) return local;
  return { ...local, seconds: scoreSeconds ?? null };
}

/** "Solved in 0:42 · your fastest yet" on the end screen. Nothing for an untimed or unsolved game. */
export function DailySolveTime({ times, solved }: { times: SolveTimes; solved: boolean }) {
  const { seconds, fastest, timed } = times;
  if (!solved || seconds == null) return null;
  const note = timed > 1 && fastest != null && seconds <= fastest
    ? "your fastest yet"
    : fastest != null && fastest < seconds ? `your best is ${formatTime(fastest)}` : null;
  return (
    <p className="daily-time">
      <IconStopwatch size={18} stroke={2} aria-hidden />
      <span>Solved in <strong>{formatTime(seconds)}</strong>{note ? ` · ${note}` : ""}</span>
    </p>
  );
}

/** The Start button, where the guess box goes until the player starts. */
export function DailyStartCard({ onStart, what }: { onStart: () => void; what: string }) {
  return (
    <div className="daily-start">
      <Button variant="primary" size="large" onClick={onStart} iconBefore={IconPlayerPlay}>Start today&apos;s puzzle</Button>
      <p className="daily-start__note">The first hint shows when you start, and your time starts too. Name today&apos;s {what} as fast as you can: a quicker solve breaks ties on today&apos;s leaderboard.</p>
    </div>
  );
}
