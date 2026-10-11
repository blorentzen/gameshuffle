"use client";

/**
 * Chat Brain on stream, 1v1 and Teams: the start form's side fields and the
 * host console. Players say their answers out loud; whoever runs the console
 * (the streamer, or a Full mod) types them in. Hidden answers stay hidden here
 * too, because the streamer is often one of the players. Engine:
 * src/lib/chatbrain/streamVersus.ts, through /api/chat-brain/stream.
 */

import { useState, type FormEvent } from "react";
import { Badge, Button, Input } from "@empac/cascadeds";
import type { StreamGameView } from "@/lib/chatbrain/streamGame";
import { TEAM_SIZE } from "@/lib/chatbrain/streamRules";

export type VersusAction = "answer" | "trust" | "control" | "undo" | "next" | "lock" | "end";

const secsUntil = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 1000));
const pct = (share: number) => `${Math.round(share * 100)}%`;

// ─── setup ───────────────────────────────────────────────────────────────────

export interface SidesDraft { names: [string, string]; players: [string, string] }
export const EMPTY_SIDES: SidesDraft = { names: ["", ""], players: ["", ""] };

/** The sides as the API takes them: 1v1 = one player a side; Teams = a name and comma-separated players. */
export function sidesPayload(mode: "versus" | "teams", d: SidesDraft) {
  return [0, 1].map((i) => mode === "versus"
    ? { name: d.players[i].trim(), members: [d.players[i].trim()] }
    : { name: d.names[i].trim(), members: d.players[i].split(",").map((p) => p.trim()).filter(Boolean) });
}

export function sidesReady(mode: "versus" | "teams", d: SidesDraft): boolean {
  const sides = sidesPayload(mode, d);
  if (mode === "versus") return sides.every((s) => s.name) && sides[0].name.toLowerCase() !== sides[1].name.toLowerCase();
  return sides.every((s) => s.members.length >= TEAM_SIZE.min && s.members.length <= TEAM_SIZE.max);
}

export function VersusSidesFields({ mode, value, onChange }: { mode: "versus" | "teams"; value: SidesDraft; onChange: (d: SidesDraft) => void }) {
  const set = (key: "names" | "players", i: number, v: string) => {
    const next = [...value[key]] as [string, string];
    next[i] = v;
    onChange({ ...value, [key]: next });
  };
  if (mode === "versus") {
    return (
      <div className="cb-versus__sides">
        {[0, 1].map((i) => (
          <Input key={i} id={`cb-p${i}`} floatingLabel={`Player ${i + 1}`} value={value.players[i]} maxLength={24} onChange={(e) => set("players", i, e.target.value)} />
        ))}
      </div>
    );
  }
  return (
    <div className="cb-versus__sides">
      {[0, 1].map((i) => (
        <div key={i} className="cb-versus__side-fields">
          <Input id={`cb-t${i}`} floatingLabel={`Team ${i + 1} name`} value={value.names[i]} maxLength={24} onChange={(e) => set("names", i, e.target.value)} />
          <Input id={`cb-tp${i}`} floatingLabel={`Team ${i + 1} players (comma-separated, ${TEAM_SIZE.min} to ${TEAM_SIZE.max})`} value={value.players[i]} maxLength={140} onChange={(e) => set("players", i, e.target.value)} />
        </div>
      ))}
    </div>
  );
}

// ─── the console ─────────────────────────────────────────────────────────────

export function VersusConsole({ game, busy, act }: { game: StreamGameView; busy: boolean; act: (action: VersusAction, extra?: Record<string, unknown>) => Promise<boolean> }) {
  const [answer, setAnswer] = useState("");
  const v = game.versus;
  if (!v) return null;
  const t = v.turn;
  const playing = game.status === "playing";
  const [a, b] = v.sides;
  const needsSide = v.phase === "faceoff" && t && t.team === null;
  const canType = playing && t && t.kind !== "last_steal" && (t.state === "pause" || t.state === "open" || t.state === "waiting");

  const send = async (side?: number) => {
    if (!answer.trim()) return;
    if (await act("answer", { answer, side })) setAnswer("");
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!needsSide) void send();
  };

  const chatStatus = !t ? null
    : t.state === "pause" ? `Chat can play along in ${secsUntil(t.opensAt)}s.`
    : t.state === "open" ? `Chat is playing along: ${t.guesses} in, ${secsUntil(t.closesAt)}s left.`
    : t.state === "chat" ? `Chat's last steal: ${t.guesses} in, ${secsUntil(t.closesAt)}s left.`
    : t.state === "waiting" ? "Chat has locked in."
    : null;

  let prompt: string;
  if (!playing) prompt = v.winner === 0 ? `It's a tie at ${a.score}!` : `${(v.winner === 1 ? a : b).name} wins, ${Math.max(a.score, b.score)} to ${Math.min(a.score, b.score)}.`;
  else if (v.phase === "round_done") prompt = "Round over.";
  else if (v.phase === "pick_control") prompt = "Nobody found an answer in three face-offs. Who plays this round?";
  else if (t?.state === "advisor" && t.advisor) prompt = `${t.side} locked in ${t.advisor.side.toUpperCase()}. Chat says ${t.advisor.chat.toUpperCase()} (${pct(t.advisor.share)} of ${t.advisor.total}). Which do they go with?`;
  else if (needsSide) prompt = `Face-off: ${v.faceoff[0]} (${a.name}) vs ${v.faceoff[1]} (${b.name}). Type the first answer, then pick who said it.`;
  else if (v.phase === "faceoff" && t) prompt = `${t.side}'s turn to answer${t.player && game.mode === "teams" ? ` (${t.player})` : ""}. Beat it or take the miss.`;
  else if (v.phase === "control" && t) prompt = `${t.side} is in control${t.player ? `. On the clock: ${t.player}` : ""}.`;
  else if (v.phase === "steal" && t) prompt = `${t.side} can steal with one answer.`;
  else if (v.phase === "last_steal") prompt = "Chat's last steal. Chat answers with !a.";
  else prompt = "";

  return (
    <div className="account-card">
      <div className="poll-head">
        <h2 className="account-card__title">{v.rounds > 1 ? `Round ${v.round + 1} of ${v.rounds}` : "The round"}</h2>
        <span className="cb-versus__badges">
          {v.double && playing && <Badge variant="warning" size="small">Double points</Badge>}
          <Badge variant={playing ? "success" : "default"} size="small">{playing ? "Live" : "Game over"}</Badge>
        </span>
      </div>

      <div className="cb-versus__scores">
        {v.sides.map((s) => (
          <div key={s.team} className={`cb-versus__side cb-versus__side--${s.team}${s.inControl ? " is-control" : ""}`}>
            <span className="cb-versus__name">{s.name}</span>
            <span className="cb-versus__score">{s.score}</span>
            {s.inControl && playing && v.phase !== "round_done" && (
              <span className="cb-versus__strikes" aria-label={`${s.strikes} of 3 strikes`}>
                {[0, 1, 2].map((i) => <span key={i} className={i < s.strikes ? "is-on" : ""}>✕</span>)}
              </span>
            )}
          </div>
        ))}
        {(v.chat.lastSteal || v.chat.score > 0) && (
          <div className="cb-versus__side cb-versus__side--3">
            <span className="cb-versus__name">Chat</span>
            <span className="cb-versus__score">{v.chat.score}</span>
          </div>
        )}
      </div>

      <p className="cb-stream__q">{game.question}</p>
      <ol className="cb-stream__board">
        {game.slots.map((s) => (
          <li key={s.rank} className={`${s.label ? (s.found ? "is-found" : "is-revealed") : ""}${s.by ? ` is-by-${s.by}` : ""}`}>
            <span className="cb-stream__rank">{s.rank}</span>
            <span className="cb-stream__label">{s.label ?? "Hidden"}</span>
            <span className="cb-stream__pts">{s.points ?? ""}</span>
          </li>
        ))}
      </ol>
      <p className="cb-stream__meta">
        <strong>{v.pot} points in play</strong>{v.double ? " (doubled when banked)" : ""}{chatStatus ? ` · ${chatStatus}` : ""}
      </p>

      {prompt && <p className="cb-versus__prompt">{prompt}</p>}

      {canType && (
        <form className="cb-versus__answer" onSubmit={onSubmit}>
          <Input id="cb-answer" floatingLabel="Their answer" fullWidth value={answer} maxLength={40} autoComplete="off" onChange={(e) => setAnswer(e.target.value)} />
          {needsSide ? (
            <>
              <Button type="button" variant="primary" size="small" disabled={busy || !answer.trim()} onClick={() => void send(1)}>{a.name} said it</Button>
              <Button type="button" variant="secondary" size="small" disabled={busy || !answer.trim()} onClick={() => void send(2)}>{b.name} said it</Button>
            </>
          ) : (
            <Button type="submit" variant="primary" size="small" disabled={busy || !answer.trim()}>Enter answer</Button>
          )}
        </form>
      )}

      {playing && t?.state === "advisor" && (
        <div className="party-row">
          <Button variant="secondary" size="small" disabled={busy} onClick={() => void act("trust", { pick: "side" })}>Go with {t.side}</Button>
          <Button variant="primary" size="small" disabled={busy} onClick={() => void act("trust", { pick: "chat" })}>Go with chat</Button>
        </div>
      )}

      {playing && (v.phase === "pick_control" || needsSide) && (
        <div className="party-row">
          {needsSide && <span className="dbot-muted">Or skip the face-off and give control to:</span>}
          {v.sides.map((s) => (
            <Button key={s.team} variant={v.phase === "pick_control" ? "secondary" : "ghost"} size="small" disabled={busy} onClick={() => void act("control", { side: s.team })}>{s.name}</Button>
          ))}
        </div>
      )}

      {playing && t?.state === "chat" && (
        <div className="party-row">
          <Button variant="secondary" size="small" disabled={busy} onClick={() => void act("lock")}>Close chat&apos;s steal now</Button>
        </div>
      )}

      {v.last && (
        <p className="dbot-muted">
          Last answer: {v.last.who}{v.last.trusted === "chat" ? " (went with chat)" : ""},{" "}
          {v.last.result === "hit" ? `${v.last.label}, #${v.last.rank} on the board` : v.last.result === "empty" ? "no answer" : `${v.last.label}${v.last.already ? " (already up)" : ", not on the board"}`}
        </p>
      )}
      {game.playalong.length > 0 && <p className="dbot-muted">Top brains in chat: {game.playalong.map((p) => `${p.name} ${p.points}`).join(", ")}</p>}

      {playing && (
        <div className="party-row cb-versus__controls">
          {v.phase === "round_done" ? (
            <Button variant="primary" size="small" disabled={busy} onClick={() => void act("next")}>{v.round + 1 >= v.rounds ? "Finish the game" : "Next round"}</Button>
          ) : (
            <Button variant="ghost" size="small" disabled={busy} onClick={() => void act("next")}>{v.round + 1 >= v.rounds ? "End this round" : "Skip to the next round"}</Button>
          )}
          {v.canUndo && <Button variant="ghost" size="small" disabled={busy} onClick={() => void act("undo")}>Undo the last answer</Button>}
          <Button variant="ghost" size="small" disabled={busy} onClick={() => void act("end")}>End game</Button>
        </div>
      )}
    </div>
  );
}
