"use client";

/**
 * Chat Brain tab (Streaming ▸ Live games, GS Pro): run a Chat Brain game on
 * stream. Chat plays = chat is one team against published boards; 1v1 and
 * Teams = two player sides with the host typing their answers, chat playing
 * along and optionally advising ("Trust chat?") and taking the last steal.
 * Start a game, watch the board fill in, and steer it. Chat has the same
 * controls (!cb ...), and the Chat Brain overlay piece shows it.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Input, Select, Switch } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { ProTrialPrompt } from "@/components/billing/ProTrialPrompt";
import { LoadingLines } from "@/components/loading/LoadingLines";
import type { StreamGameView } from "@/lib/chatbrain/streamGame";
import { BOARDS_PER_GAME, DEFAULT_GUESS_SECONDS, GUESS_SECONDS, VERSUS_ROUNDS } from "@/lib/chatbrain/streamRules";
import { EMPTY_SIDES, VersusConsole, VersusSidesFields, sidesPayload, sidesReady, type SidesDraft, type VersusAction } from "./ChatBrainVersus";
import { ChatBrainSurveyCard } from "./ChatBrainSurvey";
import type { SurveyHostView } from "@/lib/chatbrain/survey";

interface TabData {
  isPro: boolean;
  hasCommunity: boolean;
  hasTwitch: boolean;
  ready: boolean;
  boards: { familySafe: number; all: number };
  game: StreamGameView | null;
  survey?: SurveyHostView | null;
  surveyBoard?: { id: string; promptId: string } | null;
  categories?: { slug: string; name: string }[];
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
  busy: "One moment, the last answer is still being scored.",
  bad_sides: "Give both sides a player.",
  same_names: "The two sides need different names.",
  team_size: "Each team needs 2 to 5 players.",
  blocked: "One of those names can't be used.",
  round_over: "This round is over. Start the next one.",
  no_turn: "Nobody is answering right now.",
  chat_turn: "It's chat's last steal: chat answers with !a.",
  choose_first: "Choose first: go with the side's answer or chat's.",
  pick_side: "Pick who said it first.",
  empty_answer: "Type the answer first.",
  no_choice: "There's nothing to choose between right now.",
  has_control: "Someone already has control this round.",
  nothing_to_undo: "There's no answer to take back.",
  use_undo: "Use Undo the last answer instead.",
  no_survey_board: "There's no board from a survey yet.",
};

type Mode = "host" | "versus" | "teams";

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
  const [mode, setMode] = useState<Mode>("host");
  const [sides, setSides] = useState<SidesDraft>(EMPTY_SIDES);
  const [rounds, setRounds] = useState(String(VERSUS_ROUNDS.default));
  const [chatAdvisor, setChatAdvisor] = useState(true);
  const [chatLastSteal, setChatLastSteal] = useState(true);
  // On by default right after a survey makes a board.
  const [fromSurveyChoice, setFromSurvey] = useState<boolean | null>(null);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    const d = await fetch("/api/chat-brain/stream", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (d?.ok) setData(d as TabData);
    setLoading(false);
  }, []);

  const running = data?.game?.status === "playing";
  const surveying = data?.survey?.status === "open";
  const live = running || surveying;
  useEffect(() => {
    let active = true;
    const run = () => { if (active) void load(); };
    run();
    const iv = window.setInterval(run, live ? 2000 : 8000);
    return () => { active = false; window.clearInterval(iv); };
  }, [load, live]);
  // The countdown between polls.
  useEffect(() => {
    if (!live) return;
    const iv = window.setInterval(() => setTick((n) => n + 1), 500);
    return () => window.clearInterval(iv);
  }, [live]);

  const start = async () => {
    setBusy(true);
    const res = await fetch("/api/chat-brain/stream", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "host"
        ? { boards: Number(boards), seconds: Number(seconds), familySafe, fromSurvey }
        : { mode, sides: sidesPayload(mode, sides), rounds: Number(rounds), seconds: Number(seconds), familySafe, chatAdvisor, chatLastSteal, fromSurvey }),
    });
    const d = await res.json().catch(() => null);
    setBusy(false);
    if (d?.ok) { setData((cur) => (cur ? { ...cur, game: d.game } : cur)); toast.success("Game started. The question is in your chat."); }
    else toast.error(ERRORS[d?.error] ?? "Couldn't start the game.");
  };

  const act = async (action: "time" | "accept" | "reject" | VersusAction, extra: Record<string, unknown> = {}): Promise<boolean> => {
    const g = data?.game;
    const versus = g?.mode !== "host";
    if (action === "end" && !(await confirm({ title: "End this game?", body: versus ? "Both sides keep the points they have. The final score posts in chat." : "Chat keeps the points it has. The final score posts in chat.", confirmLabel: "End game", cancelLabel: "Keep playing" }))) return false;
    if (action === "next" && versus && g?.versus?.phase !== "round_done" && !(await confirm({ title: "Skip this round?", body: "Nobody banks this round's points. The rest of the board is revealed.", confirmLabel: "Skip the round", cancelLabel: "Keep playing" }))) return false;
    setBusy(true);
    const res = await fetch("/api/chat-brain/stream", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
    const d = await res.json().catch(() => null);
    setBusy(false);
    if (d?.ok) {
      setData((cur) => (cur ? { ...cur, game: d.game } : cur));
      if (action === "accept") setNamed("");
      const done: Record<string, string> = {
        lock: "Guess closed", next: versus ? "On to the next round" : "On to the next board", time: "Guess time saved", accept: "Counted", reject: "Taken back", end: "Game over",
        answer: d.message === "advisor" ? "Locked in. Trust chat?" : "Answer entered", trust: "Played", control: "Control given", undo: "Taken back. They can answer again.",
      };
      toast.success(done[action]);
      return true;
    }
    toast.error(ERRORS[d?.error] ?? "That didn't work.");
    return false;
  };

  if (loading) return <div className="account-card"><LoadingLines label="Loading" /></div>;

  if (!data?.isPro) {
    return (
      <div className="account-tab">
        <h2 className="account-tab__heading">Chat Brain</h2>
        <ProTrialPrompt title="Chat Brain games on stream are part of GS Pro" from="chat-brain">
          Play Chat Brain boards on stream: chat as one team, or 1v1 and Teams with chat playing along. Guesses with <code>!a</code>, three strikes per board, and every viewer scores on their own too. Surveys with <code>!cb ask</code> stay free.
        </ProTrialPrompt>
      </div>
    );
  }

  const g = data.game;
  const available = familySafe ? data.boards.familySafe : data.boards.all;
  const fromSurvey = !!data.surveyBoard && (fromSurveyChoice ?? !!data.survey?.result?.made);

  return (
    <div className="account-tab">
      <h2 className="account-tab__heading">Chat Brain</h2>
      <p className="account-tab__intro">
        Guess what most people said. In <strong>Chat plays</strong>, chat is one team: whatever most of chat says with <code>!a</code>{" "}is chat&apos;s answer,
        on the board banks its points, anything else is a strike, and three strikes ends the board. In <strong>1v1</strong>{" "}and <strong>Teams</strong>, two sides
        on stream play for control of each board while chat plays along. Every viewer scores on their own for answers they find.
        Add the Chat Brain piece in <Link href="/account/streaming?tab=overlay-layout">Overlay ▸ Layout</Link> to show the board on stream.
      </p>

      {!data.ready && <div className="account-card"><p className="dbot-muted">Chat Brain games need a quick update on our side before they can run.</p></div>}
      {data.ready && (!data.hasCommunity || !data.hasTwitch) && (
        <div className="account-card"><p className="dbot-muted">Connect Twitch on the <Link href="/account/streaming?tab=integrations">Streaming ▸ Setup</Link> so chat can play.</p></div>
      )}

      {g && g.mode !== "host" && (running || !surveying) && <VersusConsole game={g} busy={busy} act={act} />}

      {g && g.mode === "host" && (running || !surveying) && (
        <div className="account-card">
          <div className="poll-head">
            <h2 className="account-card__title">{g.boardCount > 1 ? `Board ${g.boardIndex + 1} of ${g.boardCount}` : "The board"}</h2>
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
        <ChatBrainSurveyCard survey={data.survey ?? null} categories={data.categories ?? []}
          onChange={(survey) => setData((cur) => (cur ? { ...cur, survey } : cur))} />
      )}

      {data.ready && data.hasCommunity && data.hasTwitch && !running && !surveying && (
        <div className="account-card">
          <h2 className="account-card__title">Start a game</h2>
          <div className="cb-stream__mode">
            <Select floatingLabel="Who plays" value={mode} onChange={(v) => setMode(String(v) as Mode)}
              options={[
                { value: "host", label: "Chat plays (chat is one team)" },
                { value: "versus", label: "1v1 (two players, chat plays along)" },
                { value: "teams", label: "Teams (2 to 5 a side, chat plays along)" },
              ]} />
          </div>
          {available === 0 ? (
            <p className="dbot-muted">
              There are no {familySafe ? "family-safe " : ""}boards to play yet. Boards come from Chat Brain questions with enough answers: run a survey in chat with <code>!cb ask</code> to help build them.
            </p>
          ) : (
            <p className="dbot-muted">{available} board{available === 1 ? "" : "s"} to draw from. Boards your chat played recently are skipped while there are others.</p>
          )}
          <div className="poll-form">
            {mode === "host" ? (
              <Select floatingLabel="Boards" value={boards} onChange={(v) => setBoards(String(v))}
                options={Array.from({ length: BOARDS_PER_GAME.max }, (_, i) => i + 1).map((n) => ({ value: String(n), label: `${n} board${n === 1 ? "" : "s"}` }))} />
            ) : (
              <>
                <p className="dbot-muted">
                  {mode === "versus" ? "Two players, say the streamer and a guest." : "Two teams of 2 to 5. Players take turns answering."}{" "}
                  Players say their answers out loud and you type them in. A face-off decides who plays each round; three strikes and the other side can steal. The last round is worth double.
                </p>
                <VersusSidesFields mode={mode} value={sides} onChange={setSides} />
                <Select floatingLabel="Rounds" value={rounds} onChange={(v) => setRounds(String(v))}
                  options={Array.from({ length: VERSUS_ROUNDS.max }, (_, i) => i + 1).map((n) => ({ value: String(n), label: `${n} round${n === 1 ? "" : "s"}${n === VERSUS_ROUNDS.default ? " (default)" : ""}` }))} />
              </>
            )}
            <Select floatingLabel={mode === "host" ? "Time per guess" : "Time for chat to play along each turn"} value={seconds} onChange={(v) => setSeconds(String(v))}
              options={GUESS_SECONDS.map((n) => ({ value: String(n), label: `${n} seconds${n === DEFAULT_GUESS_SECONDS ? " (default)" : ""}` }))} />
            <p className="dbot-muted">Viewers see the stream a few seconds behind you, so longer guesses give everyone a fair shot. 15 seconds suits low-latency streams.</p>
            {mode !== "host" && (
              <>
                <Switch label="Trust chat? On a final guess or a steal, the side can go with chat's answer instead" checked={chatAdvisor} onChange={(e) => setChatAdvisor(e.target.checked)} />
                <Switch label="Chat's last steal: if the steal misses, chat gets one try for the round's points" checked={chatLastSteal} onChange={(e) => setChatLastSteal(e.target.checked)} />
              </>
            )}
            <Switch label="Family-safe boards only" checked={familySafe} onChange={(e) => setFamilySafe(e.target.checked)} />
            {data.surveyBoard && (
              <Switch label="Start with my survey board (the one chat just made)" checked={fromSurvey} onChange={(e) => setFromSurvey(e.target.checked)} />
            )}
            <div><Button variant="primary" disabled={busy || (available === 0 && !fromSurvey) || (mode !== "host" && !sidesReady(mode, sides))} onClick={() => void start()}>Start the game</Button></div>
          </div>
        </div>
      )}

      <div className="account-card">
        <h2 className="account-card__title">From chat</h2>
        <p className="dbot-muted">
          You and your mods: <code>!cb start</code> (or <code>!cb start 3 45</code> for 3 boards and 45-second guesses) · <code>!cb lock</code> closes the guess now · <code>!cb next</code> · <code>!cb time 30</code> · <code>!cb accept [answer]</code> / <code>!cb reject</code> overrule the last result · <code>!cb end</code>.
        </p>
        <p className="dbot-muted">
          1v1 and Teams (start them here): <code>!cb play &lt;answer&gt;</code> enters what the side said (in a face-off, <code>!cb play &lt;side&gt; &lt;answer&gt;</code> for whoever answered first) · <code>!cb trust chat</code> / <code>!cb trust team</code> · <code>!cb control &lt;side&gt;</code> · <code>!cb undo</code>.
        </p>
        <p className="dbot-muted">Everyone: <code>!a &lt;answer&gt;</code> to guess or play along (answer again to change it), <code>!cb</code> to see where the game stands. Surveys: <code>!cb ask</code>.</p>
      </div>
    </div>
  );
}
