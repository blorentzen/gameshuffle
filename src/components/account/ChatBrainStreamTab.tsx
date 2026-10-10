"use client";

/**
 * Chat Brain tab (Community & Chat, GS Pro): run a game of Chat plays on
 * stream. Chat is one team against published Chat Brain boards: start a game,
 * watch the board fill in, and steer it (lock a guess, overrule the last
 * result, next board, end). Chat has the same controls (!cb start / next /
 * lock / accept / reject / end), and the Chat Brain overlay piece shows it.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Input, Select, Switch } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { ProTrialPrompt } from "@/components/billing/ProTrialPrompt";
import { LoadingLines } from "@/components/loading/LoadingLines";
import type { StreamGameView } from "@/lib/chatbrain/streamGame";
import { BOARDS_PER_GAME, DEFAULT_GUESS_SECONDS, GUESS_SECONDS } from "@/lib/chatbrain/streamRules";

interface TabData {
  isPro: boolean;
  hasCommunity: boolean;
  hasTwitch: boolean;
  ready: boolean;
  boards: { familySafe: number; all: number };
  game: StreamGameView | null;
}

const ERRORS: Record<string, string> = {
  pro_required: "Chat Brain games on stream are part of GS Pro.",
  no_community: "Connect Twitch first so chat can play.",
  no_twitch: "Connect Twitch first so chat can play.",
  game_running: "A game is already running.",
  window_open: "A survey is open in your chat. Close it first with !cb lock.",
  no_boards: "There are no boards to play yet.",
  not_ready: "Chat Brain games need a quick update on our side first.",
  no_game: "No game is running.",
  no_window: "No guess is running right now.",
  not_started: "The next guess hasn't started yet.",
  too_late: "Overrules only work on the last result, within 30 seconds.",
  board_over: "That board is already over.",
  already_hit: "That one already counted.",
  not_a_hit: "Only a hit can be taken back.",
  no_match: "That isn't one of the hidden answers.",
  bad_time: "Pick 15, 30, 45 or 60 seconds.",
  busy: "One moment, the last guess is still being scored.",
};

const secsUntil = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 1000));

export function ChatBrainStreamTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<TabData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [boards, setBoards] = useState(String(BOARDS_PER_GAME.default));
  const [seconds, setSeconds] = useState(String(DEFAULT_GUESS_SECONDS));
  const [familySafe, setFamilySafe] = useState(true);
  const [named, setNamed] = useState("");
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    const d = await fetch("/api/chat-brain/stream", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (d?.ok) setData(d as TabData);
    setLoading(false);
  }, []);

  const running = data?.game?.status === "playing";
  useEffect(() => {
    let active = true;
    const run = () => { if (active) void load(); };
    run();
    const iv = window.setInterval(run, running ? 2000 : 8000);
    return () => { active = false; window.clearInterval(iv); };
  }, [load, running]);
  // The countdown between polls.
  useEffect(() => {
    if (!running) return;
    const iv = window.setInterval(() => setTick((n) => n + 1), 500);
    return () => window.clearInterval(iv);
  }, [running]);

  const start = async () => {
    setBusy(true);
    const res = await fetch("/api/chat-brain/stream", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boards: Number(boards), seconds: Number(seconds), familySafe }),
    });
    const d = await res.json().catch(() => null);
    setBusy(false);
    if (d?.ok) { setData((cur) => (cur ? { ...cur, game: d.game } : cur)); toast.success("Game started. The question is in your chat."); }
    else toast.error(ERRORS[d?.error] ?? "Couldn't start the game.");
  };

  const act = async (action: "lock" | "next" | "time" | "accept" | "reject" | "end", extra: Record<string, unknown> = {}) => {
    if (action === "end" && !(await confirm({ title: "End this game?", body: "Chat keeps the points it has. The final score posts in chat.", confirmLabel: "End game", cancelLabel: "Keep playing" }))) return;
    setBusy(true);
    const res = await fetch("/api/chat-brain/stream", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
    const d = await res.json().catch(() => null);
    setBusy(false);
    if (d?.ok) {
      setData((cur) => (cur ? { ...cur, game: d.game } : cur));
      if (action === "accept") setNamed("");
      const done: Record<string, string> = { lock: "Guess closed", next: "On to the next board", time: "Guess time saved", accept: "Counted", reject: "Taken back", end: "Game over" };
      toast.success(done[action]);
    } else toast.error(ERRORS[d?.error] ?? "That didn't work.");
  };

  if (loading) return <div className="account-card"><LoadingLines label="Loading" /></div>;

  if (!data?.isPro) {
    return (
      <div className="account-tab">
        <h2 className="account-tab__heading">Chat Brain</h2>
        <ProTrialPrompt title="Chat Brain games on stream are part of GS Pro" from="chat-brain">
          Chat plays a Chat Brain board as one team: guesses with <code>!a</code>, three strikes per board, and every viewer scores on their own too. Surveys with <code>!cb ask</code> stay free.
        </ProTrialPrompt>
      </div>
    );
  }

  const g = data.game;
  const available = familySafe ? data.boards.familySafe : data.boards.all;

  return (
    <div className="account-tab">
      <h2 className="account-tab__heading">Chat Brain</h2>
      <p className="account-tab__intro">
        Chat plays a Chat Brain board as one team. Each guess, whatever most of chat says with <code>!a</code>{" "}is chat&apos;s answer:
        on the board banks its points, anything else is a strike, and three strikes ends the board. Every viewer also scores on their own
        for answers they find. Add the Chat Brain piece in <Link href="/account/streaming?tab=overlay-layout">Overlay ▸ Layout</Link> to show the board on stream.
      </p>

      {!data.ready && <div className="account-card"><p className="dbot-muted">Chat Brain games need a quick update on our side before they can run.</p></div>}
      {data.ready && (!data.hasCommunity || !data.hasTwitch) && (
        <div className="account-card"><p className="dbot-muted">Connect Twitch on the <Link href="/account/streaming?tab=integrations">Streaming ▸ Setup</Link> so chat can play.</p></div>
      )}

      {g && (
        <div className="account-card">
          <div className="poll-head">
            <h3 className="account-card__title">{g.boardCount > 1 ? `Board ${g.boardIndex + 1} of ${g.boardCount}` : "The board"}</h3>
            <Badge variant={g.status === "playing" ? "success" : "default"} size="small">{g.status === "playing" ? "Live" : "Game over"}</Badge>
          </div>
          <p className="cb-stream__q">{g.question}</p>
          <ol className="cb-stream__board">
            {g.slots.map((s) => (
              <li key={s.rank} className={s.label ? (s.found ? "is-found" : "is-revealed") : ""}>
                <span className="cb-stream__rank">{s.rank}</span>
                <span className="cb-stream__label">{s.label ?? "Hidden"}</span>
                <span className="cb-stream__pts">{s.points ?? ""}</span>
              </li>
            ))}
          </ol>
          <p className="cb-stream__meta">
            <strong>{g.score} points</strong> · {g.strikes} of 3 strikes ·{" "}
            {g.phase === "guessing" && g.window ? `guess open, ${secsUntil(g.window.closesAt)}s left (${g.window.guesses} in)`
              : g.phase === "starting" || g.phase === "pause" ? `next guess in ${g.window ? secsUntil(g.window.opensAt) : 0}s`
              : g.phase === "board_done" ? "board over" : "finished"}
          </p>
          {g.phase === "guessing" && g.leaning.length > 0 && (
            <p className="dbot-muted">Chat is leaning: {g.leaning.map((l) => `${l.label} (${Math.round(l.share * 100)}%)`).join(", ")}</p>
          )}
          {g.last && (
            <p className="dbot-muted">
              Last guess: {g.last.result === "hit" ? `${g.last.label}, #${g.last.rank} on the board` : g.last.result === "empty" ? "nobody answered" : `${g.last.label}${g.last.already ? " (already up)" : ", not on the board"}`}
              {g.last.overruled ? " (overruled)" : ""}
            </p>
          )}
          {g.playalong.length > 0 && <p className="dbot-muted">Top brains: {g.playalong.map((p) => `${p.name} ${p.points}`).join(", ")}</p>}

          {g.status === "playing" && (
            <>
              <div className="party-row">
                {g.phase === "guessing" && <Button variant="secondary" size="small" disabled={busy} onClick={() => void act("lock")}>Close this guess now</Button>}
                <Button variant={g.phase === "board_done" ? "primary" : "secondary"} size="small" disabled={busy} onClick={() => void act("next")}>
                  {g.boardIndex + 1 >= g.boardCount ? (g.phase === "board_done" ? "Finish the game" : "End this board") : g.phase === "board_done" ? "Next board" : "Skip to the next board"}
                </Button>
                <Button variant="ghost" size="small" disabled={busy} onClick={() => void act("end")}>End game</Button>
              </div>
              {g.canOverrule && g.last && (
                <div className="cb-stream__overrule">
                  {g.last.result === "hit" ? (
                    <Button variant="secondary" size="small" disabled={busy} onClick={() => void act("reject")}>Don&apos;t count it</Button>
                  ) : (
                    <>
                      <Input floatingLabel="Answer to count (optional)" value={named} maxLength={40} onChange={(e) => setNamed(e.target.value)} />
                      <Button variant="secondary" size="small" disabled={busy} onClick={() => void act("accept", { answer: named })}>Count it</Button>
                    </>
                  )}
                  <span className="dbot-muted">For 30 seconds after a guess, you can overrule it.</span>
                </div>
              )}
              <div className="cb-stream__time">
                <Select floatingLabel="Time per guess (from the next one)" value={String(g.seconds)} onChange={(v) => void act("time", { seconds: Number(v) })}
                  options={GUESS_SECONDS.map((n) => ({ value: String(n), label: `${n} seconds` }))} />
              </div>
            </>
          )}
        </div>
      )}

      {data.ready && data.hasCommunity && data.hasTwitch && !running && (
        <div className="account-card">
          <h3 className="account-card__title">Start a game</h3>
          {available === 0 ? (
            <p className="dbot-muted">
              There are no {familySafe ? "family-safe " : ""}boards to play yet. Boards come from Chat Brain questions with enough answers: run a survey in chat with <code>!cb ask</code> to help build them.
            </p>
          ) : (
            <p className="dbot-muted">{available} board{available === 1 ? "" : "s"} to draw from. Boards your chat played recently are skipped while there are others.</p>
          )}
          <div className="poll-form">
            <Select floatingLabel="Boards" value={boards} onChange={(v) => setBoards(String(v))}
              options={Array.from({ length: BOARDS_PER_GAME.max }, (_, i) => i + 1).map((n) => ({ value: String(n), label: `${n} board${n === 1 ? "" : "s"}` }))} />
            <Select floatingLabel="Time per guess" value={seconds} onChange={(v) => setSeconds(String(v))}
              options={GUESS_SECONDS.map((n) => ({ value: String(n), label: `${n} seconds${n === DEFAULT_GUESS_SECONDS ? " (default)" : ""}` }))} />
            <p className="dbot-muted">Viewers see the stream a few seconds behind you, so longer guesses give everyone a fair shot. 15 seconds suits low-latency streams.</p>
            <Switch label="Family-safe boards only" checked={familySafe} onChange={(e) => setFamilySafe(e.target.checked)} />
            <div><Button variant="primary" disabled={busy || available === 0} onClick={() => void start()}>Start the game</Button></div>
          </div>
        </div>
      )}

      <div className="account-card">
        <h3 className="account-card__title">From chat</h3>
        <p className="dbot-muted">
          You and your mods: <code>!cb start</code> (or <code>!cb start 3 45</code> for 3 boards and 45-second guesses) · <code>!cb lock</code> closes the guess now · <code>!cb next</code> · <code>!cb time 30</code> · <code>!cb accept [answer]</code> / <code>!cb reject</code> overrule the last result · <code>!cb end</code>.
        </p>
        <p className="dbot-muted">Everyone: <code>!a &lt;answer&gt;</code> to guess (answer again to change it), <code>!cb</code> to see where the game stands. Surveys: <code>!cb ask</code>.</p>
      </div>
    </div>
  );
}
