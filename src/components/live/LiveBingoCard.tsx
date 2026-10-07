"use client";

/**
 * LiveBingoCard: the viewer face of Stream Bingo on /live. Shows the
 * community's current game (pattern, prize, the latest call); a signed-in
 * viewer takes a card, marks it (marks stay in this browser) and calls Bingo!,
 * which the server checks against the numbers actually called. Hidden when no
 * game is running. Light interval refresh, like the poll card.
 */

import { useEffect, useState } from "react";
import { Badge, Button } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { FREE, LETTERS, PATTERNS, letterFor } from "@/lib/originals/bingo";
import type { StreamBingoView } from "@/lib/bingo/stream";
import { EVENTS, track } from "@/lib/analytics/events";
import { AuthPromptModal } from "./AuthPromptModal";

const CLAIM_ERRORS: Record<string, string> = {
  not_yet: "Not a bingo yet: the pattern isn't complete with the numbers called so far.",
  too_late: "Someone got there first. Better luck next game!",
  no_card: "Take a card first.",
  not_open: "This game has ended.",
};

function marksKey(gameId: string) { return `gs-stream-bingo:${gameId}`; }
function readMarks(gameId: string): number[] {
  try { return JSON.parse(localStorage.getItem(marksKey(gameId)) ?? "[]") as number[]; } catch { return []; }
}

export function LiveBingoCard({ communityId, streamerSlug }: { communityId: string | null; streamerSlug: string }) {
  const toast = useToast();
  const [game, setGame] = useState<StreamBingoView | null>(null);
  const [card, setCard] = useState<number[] | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [marks, setMarks] = useState<{ gameId: string; squares: number[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    if (!communityId) return;
    let active = true;
    const load = async () => {
      const d = await fetch(`/api/bingo/community/${communityId}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (!active || !d?.ok) return;
      setGame(d.game ?? null);
      setCard(d.myCard ?? null);
      setSignedIn(!!d.signedIn);
    };
    void load();
    const iv = window.setInterval(load, 3000);
    return () => { active = false; window.clearInterval(iv); };
  }, [communityId]);

  if (!game) return null;

  const squares = marks?.gameId === game.id ? marks.squares : readMarks(game.id);
  const toggle = (i: number) => {
    // Functional update: two quick taps land before a re-render, and a
    // render-time list would drop the first one. (The storage write repeats the
    // same value if React replays the updater, so it's safe here.)
    setMarks((prev) => {
      const cur = prev?.gameId === game.id ? prev.squares : readMarks(game.id);
      const next = cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i];
      try { localStorage.setItem(marksKey(game.id), JSON.stringify(next)); } catch { /* marks still work this visit */ }
      return { gameId: game.id, squares: next };
    });
  };

  const takeCard = async () => {
    if (!signedIn) { setAuthOpen(true); return; }
    setBusy(true);
    const d = await fetch(`/api/bingo/${game.id}/card`, { method: "POST" }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) {
      setCard(d.card as number[]);
      track(EVENTS.bingoCardTaken);
    } else toast.error(d?.error === "not_open" ? "This game has ended." : "Couldn't get you a card. Try again.");
  };

  const claim = async () => {
    setBusy(true);
    const d = await fetch(`/api/bingo/${game.id}/claim`, { method: "POST" }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) {
      setGame(d.game as StreamBingoView);
      track(EVENTS.bingoClaimed, { won: true });
      toast.success(d.tokens ? `Bingo! You won ${d.tokens} tokens.` : "Bingo! You won.");
    } else {
      // A claim the server checked and turned down still counts as a claim.
      if (d?.error === "not_yet" || d?.error === "too_late") track(EVENTS.bingoClaimed, { won: false });
      toast.error(CLAIM_ERRORS[d?.error as string] ?? "Couldn't check your card. Try again.");
    }
  };

  const open = game.status === "open";
  const blurb = PATTERNS.find((p) => p.id === game.pattern)?.blurb;
  const prize = [game.prizeTokens ? `${game.prizeTokens} tokens` : null, game.prizeText].filter(Boolean).join(" + ");
  const recent = game.called.slice(-6, -1).reverse();

  return (
    <section className="live-poll live-bingo" aria-label="Stream Bingo">
      <div className="live-poll__head">
        <span className="live-poll__eyebrow">Stream Bingo{game.seriesStep ? ` · game ${game.seriesStep} of the series` : ""}</span>
        <h2 className="live-poll__question">To win: {game.patternLabel}</h2>
        {blurb && <p className="live-bingo__blurb">{blurb}{prize ? `. Prize: ${prize}` : ""}</p>}
      </div>

      {game.status === "won" && <p className="live-bingo__verdict"><strong>{game.winnerName ?? "Someone"}</strong> got bingo after {game.called.length} calls!</p>}
      {game.status === "closed" && <p className="live-bingo__verdict">This game ended with no winner.</p>}

      {open && (
        <div className="live-bingo__call" aria-live="polite">
          {game.last !== null ? (
            <>
              <span className="live-bingo__num">{letterFor(game.last)} {game.last}</span>
              <span className="live-bingo__meta">
                {game.called.length} of 75 called
                {recent.length > 0 && <> · before that {recent.map((n) => `${letterFor(n)}${n}`).join(", ")}</>}
              </span>
            </>
          ) : (
            <span className="live-bingo__meta">No numbers called yet{game.callInterval ? `. One comes every ${game.callInterval}s.` : "."}</span>
          )}
        </div>
      )}

      {card && (
        <div className="bingo-card bingo-card--numbers bingo-live__card">
          <div className="bingo-card__header" aria-hidden="true">{LETTERS.map((l) => <span key={l} className="bingo-card__letter">{l}</span>)}</div>
          <div className="bingo-card__grid">
            {card.map((n, i) => {
              const free = n === FREE;
              const marked = free || squares.includes(i);
              return (
                <button key={i} type="button" disabled={free || !open} aria-pressed={marked}
                  aria-label={free ? "Free square" : `${letterFor(n)} ${n}${marked ? ", marked" : ""}`}
                  className={`bingo-cell${free ? " bingo-cell--free" : ""}${marked ? " is-marked" : ""}`}
                  onClick={() => toggle(i)}>
                  <span className="bingo-cell__text">{free ? "Free" : n}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="live-bingo__actions">
        {open && !card && <Button variant="primary" disabled={busy} onClick={() => void takeCard()}>Get a card</Button>}
        {open && card && <Button variant="primary" size="large" disabled={busy} onClick={() => void claim()}>Bingo!</Button>}
        <Badge variant="default" size="small">{game.players} playing</Badge>
      </div>
      {open && card && <p className="live-poll__foot">Tap a square to mark it when its number is called. Marks stay in this browser.</p>}

      <AuthPromptModal isOpen={authOpen} onClose={() => setAuthOpen(false)} streamerSlug={streamerSlug} actionLabel="get a bingo card" />
    </section>
  );
}
