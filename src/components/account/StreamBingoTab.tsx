"use client";

/**
 * Stream Bingo tab (Community & Chat, GS Pro). Start a number bingo game for
 * your viewers (pattern or series, a token prize and/or your own award), then
 * call numbers by hand or on a timer and watch for the winner. Everything here
 * also works from chat: !bingo start / call / auto / end.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Input, Select } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { PATTERNS, letterFor } from "@/lib/originals/bingo";
import type { StreamBingoView } from "@/lib/bingo/stream";
import { EVENTS, tagged } from "@/lib/analytics/events";
import { LoadingLines } from "@/components/loading/LoadingLines";

const ERRORS: Record<string, string> = {
  already_open: "A game is already running. End it first.",
  pro_required: "Stream Bingo is a GS Pro feature.",
  no_community: "Connect Twitch first so your viewers have somewhere to play.",
  bad_interval: "The timer takes 30 to 600 seconds.",
  all_called: "All 75 numbers are out.",
};

const TIMER_OPTIONS = [
  { value: "0", label: "Off: I'll call numbers myself" },
  { value: "30", label: "Every 30 seconds" },
  { value: "60", label: "Every minute" },
  { value: "120", label: "Every 2 minutes" },
  { value: "300", label: "Every 5 minutes" },
];

export function StreamBingoTab() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [hasCommunity, setHasCommunity] = useState(false);
  const [game, setGame] = useState<StreamBingoView | null>(null);
  const [pattern, setPattern] = useState("line");
  const [timer, setTimer] = useState("0");
  const [tokens, setTokens] = useState("0");
  const [prizeText, setPrizeText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const d = await fetch("/api/bingo", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (!active) return;
      if (d?.ok) {
        setIsPro(!!d.isPro);
        setHasCommunity(!!d.hasCommunity);
        setGame(d.game ?? null);
      }
      setLoading(false);
    };
    void load();
    // Refresh so timer calls, new players and a winner show up while you watch.
    const iv = window.setInterval(load, 4000);
    return () => { active = false; window.clearInterval(iv); };
  }, []);

  async function start() {
    setBusy(true);
    const res = await fetch("/api/bingo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pattern, callInterval: Number(timer) || null, prizeTokens: Number(tokens) || 0, prizeText }),
    });
    const d = await res.json().catch(() => null);
    setBusy(false);
    if (d?.ok) {
      setGame(d.game);
      toast.success("Bingo started");
    } else toast.error(ERRORS[d?.error] ?? "Couldn't start the game.");
  }

  async function act(body: Record<string, unknown>, done: string) {
    if (!game) return;
    setBusy(true);
    const res = await fetch(`/api/bingo/${game.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => null);
    setBusy(false);
    if (d?.ok) {
      setGame(d.game);
      if (done) toast.success(done);
    } else toast.error(ERRORS[d?.error] ?? "Couldn't update the game.");
  }

  if (loading) return <div className="account-card"><LoadingLines label="Loading" /></div>;

  if (!isPro) {
    return (
      <div className="account-tab">
        <h2 className="account-tab__heading">Stream Bingo</h2>
        <div className="account-card dbot-locked">
          <div className="dbot-locked__head">
            <h3 className="account-card__title">Stream Bingo</h3>
            <span className="dbot-lock-badge">GS Pro</span>
          </div>
          <p className="dbot-muted">Number bingo for your viewers: cards on your live page, calls on your overlay, tokens and your own prize for the winner.</p>
          <Link href="/gs-pro?from=bingo" className={tagged(EVENTS.upgradeClicked, { from: "bingo" })}><Button variant="primary" size="small">See GS Pro</Button></Link>
        </div>
      </div>
    );
  }

  const open = game?.status === "open";
  const prize = game ? [game.prizeTokens ? `${game.prizeTokens} tokens` : null, game.prizeText].filter(Boolean).join(" + ") : "";

  return (
    <div className="account-tab">
      <h2 className="account-tab__heading">Stream Bingo</h2>
      <p className="account-tab__intro">
        Viewers take a card on your live page and mark it as numbers are called. The first real bingo for the pattern wins,
        checked against the numbers actually called. Add the Number Bingo piece in <Link href="/account/streamer?tab=overlay-layout">Overlay Layout</Link> to show calls on stream.
      </p>

      {!hasCommunity ? (
        <div className="account-card">
          <p className="dbot-muted">Connect Twitch on the <Link href="/account/streamer?tab=integrations">Integrations tab</Link> to run Stream Bingo.</p>
        </div>
      ) : open && game ? (
        <div className="account-card">
          <div className="poll-head">
            <h3 className="account-card__title">To win: {game.patternLabel}{game.seriesStep ? ` (series game ${game.seriesStep})` : ""}</h3>
            <Badge variant="success" size="small">Live</Badge>
          </div>
          <p className="dbot-muted">{game.players} playing · {game.called.length} of 75 called{prize ? ` · Prize: ${prize}` : ""}</p>
          {game.last !== null && <p className="stream-bingo__last">{letterFor(game.last)} {game.last}</p>}
          <div className="party-row">
            <Button variant="primary" disabled={busy} onClick={() => void act({ action: "call" }, "")}>Call the next number</Button>
            <Select floatingLabel="Timer" options={TIMER_OPTIONS} value={String(game.callInterval ?? 0)}
              onChange={(v) => void act({ action: "auto", seconds: Number(v) || null }, Number(v) ? "Timer on" : "Timer off")} />
            <Button variant="secondary" disabled={busy} onClick={() => void act({ action: "close" }, "Game ended")}>End with no winner</Button>
          </div>
          {game.called.length > 0 && (
            <p className="dbot-muted">Called: {[...game.called].reverse().map((n) => `${letterFor(n)}${n}`).join(", ")}</p>
          )}
        </div>
      ) : (
        <>
          {game?.status === "won" && (
            <div className="account-card">
              <p><strong>{game.winnerName ?? "Someone"}</strong> won the last game after {game.called.length} calls{prize ? ` (${prize})` : ""}.</p>
            </div>
          )}
          <div className="account-card">
            <h3 className="account-card__title">Start a game</h3>
            <div className="poll-form">
              <Select floatingLabel="Pattern to win" value={pattern} onChange={(v) => setPattern(String(v))}
                options={[...PATTERNS.map((p) => ({ value: p.id, label: `${p.label}: ${p.blurb.toLowerCase()}` })), { value: "series", label: "Series: the next pattern each game (line, corners, X, frame, blackout)" }]} />
              <Select floatingLabel="Calls" value={timer} onChange={(v) => setTimer(String(v))} options={TIMER_OPTIONS} />
              <Input floatingLabel="Token prize (from your award allowance)" type="number" min={0} max={100000} value={tokens} onChange={(e) => setTokens(e.target.value)} />
              <Input floatingLabel="Your own prize, e.g. picks the next track (optional)" maxLength={140} value={prizeText} onChange={(e) => setPrizeText(e.target.value)} fullWidth />
              <div>
                <Button variant="primary" disabled={busy} onClick={() => void start()}>Start bingo</Button>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="account-card">
        <h3 className="account-card__title">From chat</h3>
        <p className="dbot-muted">
          <code>!bingo start [pattern] [tokens] [prize]</code> · <code>!bingo call</code> · <code>!bingo auto 60</code> · <code>!bingo end</code> (you and your mods).
          Viewers type <code>!bingocard</code> for the link to your live page.
        </p>
      </div>
    </div>
  );
}
