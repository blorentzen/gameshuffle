"use client";

/**
 * Chat Brain co-stream on the dashboard: pick the streamer to invite, the
 * lobby while they decide, an invite you've been sent, and the running game
 * (the host runs it; the guest watches the same board and can leave). Data
 * and actions go through /api/chat-brain/stream like the rest of the tab.
 */

import { useEffect, useState } from "react";
import { Badge, Button, Input } from "@empac/cascadeds";
import type { StreamGameView } from "@/lib/chatbrain/streamGame";

const secsUntil = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 1000));

export interface StreamerHit { id: string; name: string; username: string | null; twitch: string | null; avatar: string | null }
export interface CostreamLobby { gameId: string; guest: { name: string; state: "invited" | "joined" | "declined" | "left" } | null; rounds: number; seconds: number }
export interface CostreamInvite { gameId: string; host: string; rounds: number; seconds: number; invitedAt: string }
export interface CostreamState { lobby: CostreamLobby | null; invites: CostreamInvite[]; guest: StreamGameView | null }

/** Search GameShuffle streamers (Twitch connected) and pick one to invite. */
export function CostreamGuestPicker({ value, onChange }: { value: StreamerHit | null; onChange: (s: StreamerHit | null) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<StreamerHit[]>([]);
  const term = q.trim();
  useEffect(() => {
    if (term.length < 2) return;
    let active = true;
    const t = window.setTimeout(async () => {
      const d = await fetch(`/api/chat-brain/stream?search=${encodeURIComponent(term)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (active) setHits((d?.streamers ?? []) as StreamerHit[]);
    }, 300);
    return () => { active = false; window.clearTimeout(t); };
  }, [term]);
  const shown = term.length >= 2 ? hits : [];

  if (value) {
    return (
      <div className="cb-costream__picked">
        <span>Inviting <strong>{value.name}</strong>{value.twitch ? ` (twitch.tv/${value.twitch})` : ""}</span>
        <Button variant="ghost" size="small" onClick={() => onChange(null)}>Change</Button>
      </div>
    );
  }
  return (
    <div className="cb-costream__search">
      <Input id="cb-costream-search" floatingLabel="Streamer to invite" fullWidth value={q} maxLength={40} autoComplete="off" onChange={(e) => setQ(e.target.value)} />
      {term.length >= 2 && (
        shown.length ? (
          <ul className="cb-costream__hits" aria-label="Streamers">
            {shown.map((s) => (
              <li key={s.id}>
                <Button variant="secondary" size="small" onClick={() => { onChange(s); setQ(""); }}>
                  {s.name}{s.twitch ? ` · twitch.tv/${s.twitch}` : ""}
                </Button>
              </li>
            ))}
          </ul>
        ) : <p className="dbot-muted">No streamers on GameShuffle with Twitch connected match that.</p>
      )}
      <p className="dbot-muted">They need a GameShuffle account with Twitch connected and our bot in their chat.</p>
    </div>
  );
}

/** The host's lobby: waiting for the guest, ready to start, or turned down. */
export function CostreamLobbyCard({ lobby, busy, onStart, onCancel }: { lobby: CostreamLobby; busy: boolean; onStart: () => void; onCancel: () => void }) {
  const g = lobby.guest;
  const state = g?.state ?? "invited";
  return (
    <div className="account-card">
      <div className="poll-head">
        <h2 className="account-card__title">Co-stream with {g?.name ?? "your guest"}</h2>
        <Badge variant={state === "joined" ? "success" : state === "declined" ? "default" : "warning"} size="small">
          {state === "joined" ? "Ready" : state === "declined" ? "Turned down" : "Invite sent"}
        </Badge>
      </div>
      <p className="dbot-muted">
        {state === "joined" ? `${g?.name} joined. ${lobby.rounds} rounds, ${lobby.seconds} seconds an answer. Start when you're both live and ready.`
          : state === "declined" ? `${g?.name} can't play this time. Cancel this one to invite someone else.`
          : `Waiting for ${g?.name ?? "them"} to accept on their Chat Brain tab. They got a notification.`}
      </p>
      <div className="party-row">
        {state === "joined" && <Button variant="primary" size="small" disabled={busy} onClick={onStart}>Start the co-stream</Button>}
        <Button variant="ghost" size="small" disabled={busy} onClick={onCancel}>{state === "joined" ? "Cancel" : "Cancel the invite"}</Button>
      </div>
    </div>
  );
}

const RESPOND_ERRORS: Record<string, string> = {
  no_twitch: "Connect Twitch in Streaming ▸ Setup first, so your chat can play.",
  no_bot: "Our bot isn't reading your chat yet. Reconnect Twitch in Streaming ▸ Setup, then accept.",
  busy: "Finish the Chat Brain game you're running first.",
  not_found: "That invite isn't open any more.",
};
export const respondError = (code: string | undefined) => RESPOND_ERRORS[code ?? ""] ?? "That didn't work. Try again.";

/** Invites someone sent you. */
export function CostreamInvites({ invites, busy, respond }: { invites: CostreamInvite[]; busy: boolean; respond: (gameId: string, accept: boolean) => void }) {
  if (!invites.length) return null;
  return (
    <div className="account-card">
      <h2 className="account-card__title">Co-stream invite{invites.length === 1 ? "" : "s"}</h2>
      {invites.map((i) => (
        <div key={i.gameId} className="cb-costream__invite">
          <p>
            <strong>{i.host}</strong> wants your chat to play theirs in Chat Brain: {i.rounds} rounds, {i.seconds} seconds an answer.
            Your chat answers with <code>!a</code>{" "}in your channel; {i.host} runs the game.
          </p>
          <div className="party-row">
            <Button variant="primary" size="small" disabled={busy} onClick={() => respond(i.gameId, true)}>Accept</Button>
            <Button variant="ghost" size="small" disabled={busy} onClick={() => respond(i.gameId, false)}>Decline</Button>
          </div>
        </div>
      ))}
      <p className="dbot-muted">Add the Chat Brain piece in Overlay ▸ Layout so your viewers see the board.</p>
    </div>
  );
}

export type CostreamAction = "lock" | "next" | "end" | "control" | "leave";

/** The running co-stream: the host steers it; the guest sees the same board and can leave. */
export function CostreamConsole({ game, busy, act, guest = false }: { game: StreamGameView; busy: boolean; act: (action: CostreamAction, extra?: Record<string, unknown>) => void; guest?: boolean }) {
  const v = game.versus;
  if (!v) return null;
  const t = v.turn;
  const playing = game.status === "playing";
  const [a, b] = v.sides;

  let prompt: string;
  if (!playing) prompt = v.winner === 0 ? `It's a tie at ${a.score}!` : `${(v.winner === 1 ? a : b).name}'s chat wins, ${Math.max(a.score, b.score)} to ${Math.min(a.score, b.score)}.`;
  else if (v.phase === "round_done") prompt = "Round over.";
  else if (v.phase === "pick_control") prompt = guest ? "Nobody found an answer in three face-offs. The host is picking who plays." : "Nobody found an answer in three face-offs. Who plays this round?";
  else if (v.phase === "faceoff") prompt = `Face-off: both chats answer with !a. The higher answer wins control.${t?.attempt && t.attempt > 1 ? ` (try ${t.attempt} of 3)` : ""}`;
  else if (v.phase === "control") prompt = `${v.sides.find((s) => s.inControl)?.name ?? "A"}'s chat is in control.`;
  else if (v.phase === "steal") prompt = `${t?.side ?? "The other"}'s chat can steal with one answer.`;
  else prompt = "";

  const clock = !t ? null : t.state === "pause" ? `Next answer opens in ${secsUntil(t.opensAt)}s.` : `${t.guesses} in, ${secsUntil(t.closesAt)}s left.`;

  return (
    <div className="account-card">
      <div className="poll-head">
        <h2 className="account-card__title">Co-stream · Round {v.round + 1} of {v.rounds}</h2>
        <span className="cb-versus__badges">
          {v.double && playing && <Badge variant="warning" size="small">Double points</Badge>}
          <Badge variant={playing ? "success" : "default"} size="small">{playing ? "Live" : "Game over"}</Badge>
        </span>
      </div>
      <div className="cb-versus__scores">
        {v.sides.map((s) => (
          <div key={s.team} className={`cb-versus__side cb-versus__side--${s.team}${s.inControl ? " is-control" : ""}`}>
            <span className="cb-versus__name">{s.name}&apos;s chat</span>
            <span className="cb-versus__score">{s.score}</span>
            {s.inControl && playing && (v.phase === "control" || v.phase === "steal") && (
              <span className="cb-versus__strikes" aria-label={`${s.strikes} of 3 strikes`}>
                {[0, 1, 2].map((i) => <span key={i} className={i < s.strikes ? "is-on" : ""}>✕</span>)}
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="cb-stream__q">{game.question}</p>
      <ol className="cb-stream__board">
        {game.slots.map((s) => (
          <li key={s.rank} className={`${s.label ? (s.found ? "is-found" : "is-revealed") : ""}${s.by ? ` is-by-${s.by}` : ""}`}>
            <span className="cb-stream__rank">{s.rank}</span>
            <span className="cb-stream__label">{s.label ?? "Hidden"}{s.by ? <small className="cb-stream__finder">{v.sides.find((x) => x.team === s.by)?.name}</small> : null}</span>
            <span className="cb-stream__pts">{s.points ?? ""}</span>
          </li>
        ))}
      </ol>
      <p className="cb-stream__meta"><strong>{v.pot} points in play</strong>{v.double ? " (doubled when banked)" : ""}{clock && playing ? ` · ${clock}` : ""}</p>
      {prompt && <p className="cb-versus__prompt">{prompt}</p>}
      {playing && game.leaning.length > 0 && <p className="dbot-muted">{t?.side}&apos;s chat is leaning: {game.leaning.map((l) => `${l.label} (${Math.round(l.share * 100)}%)`).join(", ")}</p>}
      {v.last && (
        <p className="dbot-muted">
          Last answer: {v.last.who}, {v.last.result === "hit" ? `${v.last.label}, #${v.last.rank} on the board` : v.last.result === "empty" ? "no answer" : `${v.last.label}${v.last.already ? " (already up)" : ", not on the board"}`}
        </p>
      )}
      {game.playalong.length > 0 && <p className="dbot-muted">Top brains in both chats: {game.playalong.map((p) => `${p.name} ${p.points}`).join(", ")}</p>}
      {game.prize > 0 && playing && <p className="dbot-muted">Prize: {game.prize} tokens for the top brains when the game ends.</p>}

      {playing && !guest && v.phase === "pick_control" && (
        <div className="party-row">
          {v.sides.map((s) => <Button key={s.team} variant="secondary" size="small" disabled={busy} onClick={() => act("control", { side: s.team })}>{s.name}&apos;s chat plays</Button>)}
        </div>
      )}
      {playing && !guest && (
        <div className="party-row cb-versus__controls">
          {t?.state === "open" && <Button variant="secondary" size="small" disabled={busy} onClick={() => act("lock")}>Close this answer now</Button>}
          <Button variant={v.phase === "round_done" ? "primary" : "secondary"} size="small" disabled={busy} onClick={() => act("next")}>
            {v.phase === "round_done" ? (v.round + 1 >= v.rounds ? "Finish the game" : "Next round") : "Skip this round"}
          </Button>
          <Button variant="ghost" size="small" disabled={busy} onClick={() => act("end")}>End the co-stream</Button>
        </div>
      )}
      {playing && guest && (
        <div className="party-row">
          <span className="dbot-muted">The host runs the game. Your chat answers with !a in your channel.</span>
          <Button variant="ghost" size="small" disabled={busy} onClick={() => act("leave")}>Leave the co-stream</Button>
        </div>
      )}
    </div>
  );
}
