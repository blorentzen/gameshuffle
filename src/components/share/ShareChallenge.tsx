"use client";

/**
 * A shared result's challenge (Britton's picks, 2026-10-20, all as recommended): a friend's link
 * (/r/<code>) opens today's game itself under their result, so the game's own pieces need to
 * know whose link this is. This context carries it: the leaderboard marks their row "shared this"
 * (DailyBoard asks the server with the code, so no player key reaches the page), the end screen
 * shows You vs them (ChallengeVersus), and the Share button says "Send yours to Nova". Only a
 * result from today gets the head-to-head: an older one was a different puzzle.
 */

import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { Avatar, Badge } from "@empac/cascadeds";
import { IconShare } from "@tabler/icons-react";
import { IconTile } from "@/components/ui/IconTile";
import { gsDay } from "@/lib/time/gsClock";
import { shareTime, type DuelPart, type FirePart, type PuzzlePart, type ShareCell, type SharePart } from "@/lib/share/types";

export interface ShareChallengeInfo {
  /** The share's code, for the leaderboard's "shared this". */
  code: string;
  /** Their name, or null for a guest card with no name. */
  name: string | null;
  avatar: string | null;
  /** The Pacific day they played. */
  day: string;
  parts: SharePart[];
}

type ChallengeGame = "shuffle" | "dex" | "fire" | "duel";
const isChallengeGame = (g: string): g is ChallengeGame => g === "shuffle" || g === "dex" || g === "fire" || g === "duel";

const Ctx = createContext<ShareChallengeInfo | null>(null);

export function ShareChallengeProvider({ value, children }: { value: ShareChallengeInfo; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShareChallenge(): ShareChallengeInfo | null {
  return useContext(Ctx);
}

/** Their result in this game when they played it today (today's round, for Fire Round; the official duel, for the Daily Duel), else null. */
export function useChallengePart(game: string): PuzzlePart | FirePart | DuelPart | null {
  const c = useShareChallenge();
  if (!c || !isChallengeGame(game) || c.day !== gsDay()) return null;
  const p = c.parts.find((x) => x.kind === game);
  if (!p || (p.kind === "fire" && !p.daily) || (p.kind === "duel" && p.practice)) return null;
  return p as PuzzlePart | FirePart | DuelPart;
}

/** The end screen's Share button when you came from their link today. */
export function useChallengeShareLabel(game: string): string | undefined {
  const c = useShareChallenge();
  const p = useChallengePart(game);
  if (!c || !p) return undefined;
  return c.name ? `Send yours to ${c.name}` : "Send yours back";
}

/** A result's squares, a row per guess (decorative: the words around them say the result). */
export function ShareSquares({ rows, size = "large" }: { rows: ShareCell[][]; size?: "large" | "small" }) {
  if (!rows.length) return null;
  // The squares share their space's width, so they need the column count.
  return (
    <span className={`share-squares share-squares--${size}`} style={{ "--share-cols": Math.max(1, rows[0].length) } as CSSProperties} aria-hidden="true">
      {rows.map((r, i) => (
        <span key={i} className="share-squares__row">
          {r.map((c, j) => <span key={j} className={`share-squares__cell share-squares__cell--${c}`} />)}
        </span>
      ))}
    </span>
  );
}

export type ChallengeMine =
  | { kind: "puzzle"; guesses: number; solved: boolean; saved: boolean; seconds: number | null; rows: ShareCell[][]; main: number }
  | { kind: "fire"; score: number; right: number }
  | { kind: "duel"; won: boolean; turns: number; seconds: number | null; standing: boolean[]; knocked: number; team: number };

/** A Daily Duel's six as squares: green still standing, red knocked out (decorative, like ShareSquares). */
export function DuelSquares({ standing, size = "large" }: { standing: boolean[]; size?: "large" | "small" }) {
  if (!standing.length) return null;
  return (
    <span className={`share-squares share-squares--${size}`} style={{ "--share-cols": standing.length } as CSSProperties} aria-hidden="true">
      <span className="share-squares__row">
        {standing.map((up, i) => <span key={i} className={`share-squares__cell share-squares__cell--${up ? "match" : "ko"}`} />)}
      </span>
    </span>
  );
}

/** A duel's order: a win beats a loss; then fewer turns, more cards left and the faster win; two losses, more knocked out. */
const duelScore = (d: { won: boolean; turns: number; standing: boolean[]; seconds: number | null; knocked: number }) =>
  d.won ? [1, -d.turns, d.standing.filter(Boolean).length, -(d.seconds ?? 1e9)] : [0, d.knocked, 0, 0];
const duelWords = (d: { won: boolean; turns: number; seconds: number | null; knocked: number; team: number }) =>
  d.won ? `Won in ${d.turns} turns${d.seconds != null ? ` · ${shareTime(d.seconds)}` : ""}` : `Lost · ${d.knocked} of ${d.team} out`;

/** Lower is better: guesses when solved, then a last-chance save, then a miss. */
const puzzleRank = (solved: boolean, saved: boolean, guesses: number, main: number) => (!solved ? main + 2 : saved ? main + 1 : guesses);

const puzzleWords = (solved: boolean, saved: boolean, guesses: number) =>
  !solved ? "Missed it" : saved ? "Last chance" : `${guesses} ${guesses === 1 ? "guess" : "guesses"}`;

/** The end screen's You vs them, under the result, when you came from their link today. */
export function ChallengeVersus({ game, mine }: { game: ChallengeGame; mine: ChallengeMine }) {
  const c = useShareChallenge();
  const theirs = useChallengePart(game);
  if (!c || !theirs) return null;
  // A card with no name is "the shared result", never a stand-in person.
  const who = c.name ?? "the shared result";

  let outcome: number;
  let mineLine: string;
  let theirLine: string;
  if (mine.kind === "puzzle" && (theirs.kind === "shuffle" || theirs.kind === "dex")) {
    const a = puzzleRank(mine.solved, mine.saved, mine.guesses, mine.main);
    const b = puzzleRank(theirs.solved, theirs.saved, theirs.guesses, theirs.main);
    outcome = a !== b ? Math.sign(b - a) : mine.seconds != null && theirs.seconds != null && mine.solved ? Math.sign(theirs.seconds - mine.seconds) : 0;
    mineLine = `${puzzleWords(mine.solved, mine.saved, mine.guesses)}${mine.solved && mine.seconds != null ? ` · ${shareTime(mine.seconds)}` : ""}`;
    theirLine = `${puzzleWords(theirs.solved, theirs.saved, theirs.guesses)}${theirs.solved && theirs.seconds != null ? ` · ${shareTime(theirs.seconds)}` : ""}`;
  } else if (mine.kind === "fire" && theirs.kind === "fire") {
    outcome = mine.score !== theirs.score ? Math.sign(mine.score - theirs.score) : Math.sign(mine.right - theirs.right);
    mineLine = `${mine.score.toLocaleString("en-US")} · ${mine.right} right`;
    theirLine = `${theirs.score.toLocaleString("en-US")} · ${theirs.right} right`;
  } else if (mine.kind === "duel" && theirs.kind === "duel") {
    const a = duelScore(mine);
    const b = duelScore(theirs);
    const k = a.findIndex((x, i) => x !== b[i]);
    outcome = k < 0 ? 0 : Math.sign(a[k] - b[k]);
    mineLine = duelWords(mine);
    theirLine = duelWords(theirs);
  } else {
    return null;
  }
  const verdict = outcome > 0 ? `You beat ${who} today.` : outcome < 0 ? `${c.name ?? "The shared result"} takes this one.` : `A tie with ${who}.`;

  return (
    <section className="share-vs" aria-label={`You and ${who}`}>
      <p className="share-vs__verdict">{verdict}</p>
      <div className="share-vs__sides">
        <div className="share-vs__side">
          <Avatar size="large" initials="Y" alt="" color="primary" />
          <strong>You{outcome > 0 && <> <Badge variant="success" size="small">Wins</Badge></>}</strong>
          <span className="share-vs__line">{mineLine}</span>
          {mine.kind === "puzzle" && <ShareSquares rows={mine.rows} size="small" />}
          {mine.kind === "duel" && <DuelSquares standing={mine.standing} size="small" />}
        </div>
        <span className="share-vs__mid" aria-hidden="true">vs</span>
        <div className="share-vs__side">
          {c.name ? <Avatar size="large" src={c.avatar ?? undefined} initials={c.name.slice(0, 1).toUpperCase()} alt="" color="neutral" /> : <IconTile icon={IconShare} tone="blue" />}
          <strong>{c.name ?? "Shared result"}{outcome < 0 && <> <Badge variant="success" size="small">Wins</Badge></>}</strong>
          <span className="share-vs__line">{theirLine}</span>
          {(theirs.kind === "shuffle" || theirs.kind === "dex") && <ShareSquares rows={theirs.rows} size="small" />}
          {theirs.kind === "duel" && <DuelSquares standing={theirs.standing} size="small" />}
        </div>
      </div>
    </section>
  );
}
