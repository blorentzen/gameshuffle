"use client";

/**
 * LiveBingoCard: the viewer face of Stream Bingo on /live. Three steps, said
 * the same way as on stream: grab a card while the doors are open, mark the
 * numbers as they're called, call bingo (checked against the numbers actually
 * called). Shows the pattern (drawn when it has a shape), the doors countdown
 * and the latest call. Marks stay in this browser. Hidden when no game is
 * running. Light interval refresh, like the poll card.
 */

import { useEffect, useState } from "react";
import { Badge, Button } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { FREE, LETTERS, PATTERNS, letterFor } from "@/lib/originals/bingo";
import { BingoShape } from "@/components/overlay/NumberBingoOverlay";
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
  const [now, setNow] = useState(() => Date.now());
  const closesAt = game?.doorsCloseAt ? Date.parse(game.doorsCloseAt) : 0;
  const doorsOpen = game?.status === "open" && closesAt > now;
  const hasDoors = !!game?.doorsCloseAt;

  // The doors countdown, once a second while they're open.
  useEffect(() => {
    if (!doorsOpen) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [doorsOpen]);

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
    } else toast.error(d?.error === "not_open" ? "This game has ended." : d?.error === "doors_closed" ? "The doors just closed for this game. Catch the next one!" : "Couldn't get you a card. Try again.");
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
  const blurb = game.pattern === "custom" ? "The squares shown, drawn by the streamer" : PATTERNS.find((p) => p.id === game.pattern)?.blurb;
  const prize = [game.prizeTokens ? `${game.prizeTokens} tokens` : null, game.prizeText].filter(Boolean).join(" + ");
  const recent = game.called.slice(-6, -1).reverse();
  const lockedOut = open && !card && hasDoors && !doorsOpen;
  const left = Math.max(0, Math.ceil((closesAt - now) / 1000));
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  // Where this viewer is in the three steps.
  const step = !card ? 1 : doorsOpen || game.called.length === 0 ? 2 : 3;
  const steps = [
    { title: "Grab a card", text: hasDoors ? "Free, while the doors are open." : "Free, right here." },
    { title: "Mark the numbers", text: game.callInterval ? `They're called on stream every ${game.callInterval} seconds.` : "Tap each one as it's called on stream." },
    { title: "Call bingo", text: `First real ${game.patternLabel} wins${prize ? ` ${prize}` : ""}.` },
  ];

  return (
    <section className="live-poll live-bingo" aria-label="Stream Bingo">
      <div className="live-poll__head">
        <span className="live-poll__eyebrow">Stream Bingo{game.seriesStep ? ` · game ${game.seriesStep} of the series` : ""}</span>
        <div className="live-bingo__goal">
          {game.shape && <BingoShape cells={game.shape} />}
          <div>
            <h2 className="live-poll__question">To win: {game.patternLabel}</h2>
            {blurb && <p className="live-bingo__blurb">{blurb}{prize ? `. Prize: ${prize}` : ""}</p>}
          </div>
        </div>
      </div>

      {open && (
        <ol className="bingo-steps" aria-label="How to play">
          {steps.map((st, i) => (
            <li key={st.title} className={i + 1 === step ? "is-now" : i + 1 < step ? "is-done" : ""} aria-current={i + 1 === step ? "step" : undefined}>
              <span className="bingo-steps__n" aria-hidden="true">{i + 1}</span>
              <span><strong>{st.title}</strong> {st.text}</span>
            </li>
          ))}
        </ol>
      )}

      {doorsOpen && (
        <p className="live-bingo__doors" aria-live="polite"><strong>Doors close in {clock}</strong> · numbers start after that</p>
      )}
      {lockedOut && <p className="live-bingo__doors">The doors are closed for this game. Catch the next one!</p>}

      {game.status === "won" && <p className="live-bingo__verdict"><strong>{game.winnerName ?? "Someone"}</strong> got bingo after {game.called.length} calls!</p>}
      {game.status === "closed" && <p className="live-bingo__verdict">This game ended with no winner.</p>}

      {open && !doorsOpen && (
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
        {open && !card && !lockedOut && <Button variant="primary" disabled={busy} onClick={() => void takeCard()}>Grab a card</Button>}
        {open && card && <Button variant="primary" size="large" disabled={busy || doorsOpen} onClick={() => void claim()}>Bingo!</Button>}
        <Badge variant="default" size="small">{game.players} playing</Badge>
      </div>
      {open && card && <p className="live-poll__foot">Tap a square to mark it when its number is called. Marks stay in this browser.</p>}

      <AuthPromptModal isOpen={authOpen} onClose={() => setAuthOpen(false)} streamerSlug={streamerSlug} actionLabel="get a bingo card" />
    </section>
  );
}
