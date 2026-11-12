"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Input, Select } from "@empac/cascadeds";
import { useRoster } from "@/lib/game-nights/companion/roster";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { BrainSlots, BrainStrikes } from "@/components/party/BrainTablePanel";
import {
  TABLE_BOARD_CHOICES, TABLE_STRIKES, TEAMS_BOARD_CHOICES, TEAM_NAME_MAX, nextPassBoard, passAnswer, passResult, startPass, tableTarget,
  type PassJudgement, type PassMode, type PassState, type TableSlot,
} from "@/lib/chatbrain/tableRules";
import { EVENTS, track } from "@/lib/analytics/events";
import "@/styles/brain-table.css";

/**
 * Chat Brain on one phone (a GameShuffle Original): the table talks it over
 * and types one answer, as one team against the board or as two teams taking
 * turns (control until three strikes, then the other team steals). The
 * answers stay on the server (/api/chat-brain/table) until a board is over.
 * Staff only until Chat Brain launches; the page checks.
 */

interface Board { id: string; question: string; size: number }
type Found = Record<number, { label: string; points: number }>;

export function ChatBrainTable() {
  const { players: roster } = useRoster();
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<PassMode>("table");
  const [boardsPick, setBoardsPick] = useState("3");
  const [names, setNames] = useState(["", ""]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [game, setGame] = useState<PassState | null>(null);
  const [found, setFound] = useState<Found>({});
  const [all, setAll] = useState<Found | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const played = useRef<string[]>([]);

  const choices: readonly number[] = mode === "table" ? TABLE_BOARD_CHOICES : TEAMS_BOARD_CHOICES;
  const board = game ? boards[game.boardNo] : null;

  const begin = async () => {
    const want = choices.includes(Number(boardsPick)) ? Number(boardsPick) : choices[0];
    setBusy(true);
    const r = await fetch(`/api/chat-brain/table?boards=${want}&skip=${played.current.join(",")}`, { cache: "no-store" }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    setBusy(false);
    const got = (j?.boards ?? []) as Board[];
    if (!r?.ok || !got.length) { toast.error("There are no boards to play right now."); return; }
    // An even count for teams, so each team leads the same number.
    const count = mode === "teams" ? Math.max(2, got.length - (got.length % 2)) : got.length;
    if (mode === "teams" && got.length < 2) { toast.error("Teams need two boards, and there aren't enough right now."); return; }
    const list = got.slice(0, count);
    played.current = [...played.current, ...list.map((b) => b.id)].slice(-200);
    setBoards(list);
    setGame(startPass(mode, list.length, names));
    setFound({});
    setAll(null);
    setText("");
    track(EVENTS.toolUsed, { tool: "chat-brain" });
  };

  const reveal = async (id: string) => {
    const r = await fetch("/api/chat-brain/table", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ board: id, reveal: true }) }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    if (j?.answers) setAll(Object.fromEntries((j.answers as { rank: number; label: string; points: number }[]).map((a) => [a.rank, { label: a.label, points: a.points }])));
  };

  const answer = async () => {
    const guess = text.trim();
    if (!game || !board || !guess || busy) return;
    setBusy(true);
    const r = await fetch("/api/chat-brain/table", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ board: board.id, guess, found: game.found }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    setBusy(false);
    if (!r?.ok || !j) { toast.error("That didn't go through. Try again."); return; }
    const verdict: PassJudgement = { hit: j.hit ?? null, already: !!j.already };
    const next = passAnswer(game, verdict, board.size);
    if (verdict.hit && !verdict.already && !game.found.includes(verdict.hit.rank)) setFound((f) => ({ ...f, [verdict.hit!.rank]: { label: verdict.hit!.label, points: verdict.hit!.points } }));
    setGame(next);
    setText("");
    if (next.phase === "board_done") await reveal(board.id);
  };

  const moveOn = () => {
    if (!game) return;
    const next = nextPassBoard(game);
    setGame(next);
    setAll(null);
    setFound({});
    if (next.phase === "done") {
      const res = passResult(next);
      track(EVENTS.brainTableFinished, { where: "phone", mode: next.mode, won: res.kind === "table" ? res.won : res.winner !== null });
    }
  };

  const playOnPhones = async () => {
    setStarting(true);
    const r = await fetch("/api/party", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameSlug: "chat-brain", config: {}, visibility: "secret", seats: roster.slice(0, 8).map((p) => ({ name: p.name, isCpu: false, character: null })), hostSeat: null }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setStarting(false);
    if (!r?.ok || !j.code) { toast.error("Couldn't start the night. Please try again."); return; }
    track(EVENTS.nightStarted, { format: "classic", source: "chat-brain" });
    router.push(`/party/${j.code}`);
  };

  if (!game || !board) {
    return (
      <div className="account-card brain-pass">
        <div className="brain-pass__setup">
          <p className="bgn-tools__hint">A question from Chat Brain: guess what most people answered. Talk it over, then type one answer.</p>
          <Select floatingLabel="Who plays" value={mode} onChange={(v) => { const m = String(v) as PassMode; setMode(m); setBoardsPick(m === "table" ? "3" : "2"); }}
            options={[{ value: "table", label: "Everyone, as one team" }, { value: "teams", label: "Two teams, taking turns" }]} />
          <Select floatingLabel="Boards" value={boardsPick} onChange={(v) => setBoardsPick(String(v))}
            options={choices.map((n) => ({ value: String(n), label: `${n} board${n === 1 ? "" : "s"}` }))} />
          {mode === "teams" && (
            <div className="brain-pass__names">
              {[0, 1].map((i) => (
                <Input key={i} id={`brain-pass-team-${i}`} floatingLabel={`Team ${i + 1} name`} value={names[i]} maxLength={TEAM_NAME_MAX} autoComplete="off"
                  onChange={(e) => setNames((n) => n.map((x, k) => (k === i ? e.target.value : x)))} />
              ))}
            </div>
          )}
          <p className="bgn-tools__hint">
            {mode === "table"
              ? `Each answer on the board banks its points; anything else is a strike, and three strikes ends the board. Bank ${tableTarget(Number(boardsPick) || 3)} points to win.`
              : "The team in control answers until it clears the board or takes three strikes. Then the other team gets one answer to steal every point found so far. Teams take turns leading."}
          </p>
          <div><Button variant="primary" disabled={busy} onClick={() => void begin()}>Start</Button></div>
        </div>
        <div className="oddone-tool__phones">
          <p className="bgn-tools__hint"><strong>Want everyone on their own phone?</strong> Start a live night: everyone types an answer, the answer most of you gave counts, and the TV shows the board.</p>
          {user
            ? <Button variant="secondary" size="small" disabled={starting || roster.length < 2} onClick={playOnPhones}>{roster.length < 2 ? "Add 2 players above to play on phones" : "Play on everyone's phones"}</Button>
            : <Link href={`/signup?redirect=${encodeURIComponent("/game-nights/tools/chat-brain")}`}>Create a free account to host on everyone&apos;s phones</Link>}
        </div>
      </div>
    );
  }

  const slots: TableSlot[] = Array.from({ length: board.size }, (_, i) => {
    const rank = i + 1;
    const f = found[rank] ?? null;
    const shown = f ?? (all?.[rank] ?? null);
    return { rank, points: shown?.points ?? 0, label: shown?.label ?? null, found: !!f };
  });
  const teamName = (i: number) => game.teams[i]?.name ?? "";
  const playing = game.phase === "play" || game.phase === "steal";
  const last = game.last;
  const lastLine = !last ? null
    : last.kind === "hit" ? `${last.label} is on the board: ${last.points} points.`
    : last.kind === "cleared" ? `${last.label}! Board cleared${game.mode === "teams" ? `: ${teamName(last.team)} banks ${last.points}` : ""}.`
    : last.kind === "stole" ? `${last.label}: ${teamName(last.team)} steals ${last.points} points!`
    : last.kind === "held" ? `The steal missed. ${teamName(last.team)} banks ${last.points}.`
    : last.kind === "strikes" ? "Three strikes. That's the board."
    : last.kind === "already" ? `${last.label} is already up. That's a strike.`
    : "Not on the board. That's a strike.";

  if (game.phase === "done") {
    const res = passResult(game);
    return (
      <div className="account-card brain-pass">
        <div className="brain-pass__done">
          <p className="brain-pass__turn">
            {res.kind === "table"
              ? (res.won ? `You won: ${res.total} points, ${res.target} needed.` : `${res.total} points, ${res.target} needed. Not this time.`)
              : res.winner === null ? `It's a tie at ${game.teams[0].score}!` : `${teamName(res.winner)} wins, ${game.teams[res.winner].score} to ${game.teams[1 - res.winner].score}.`}
          </p>
          <div className="party-row">
            <Button variant="primary" disabled={busy} onClick={() => void begin()}>Play again</Button>
            <Button variant="ghost" onClick={() => { setGame(null); setBoards([]); }}>Change the setup</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="account-card brain-pass">
      {/* The table's score is in the line under the question; teams get a score each. */}
      {game.mode === "teams" && <ul className="brain-pass__scores" aria-label="Scores">
        {game.teams.map((t, i) => (
          <li key={i} className={game.mode === "teams" && i === (game.phase === "steal" ? 1 - game.control : game.control) && playing ? "is-control" : undefined}>
            <span>{t.name}</span><strong>{t.score}</strong>
          </li>
        ))}
      </ul>}
      <div className="likely__prompt">
        <span className="oddone__label">Board {game.boardNo + 1} of {game.boards}</span>
        <strong className="likely__text">{board.question}</strong>
      </div>
      <div className="brain-table__status">
        <span>{game.mode === "teams" ? <><strong>{game.pot}</strong> points found this board</> : <><strong>{game.teams[0].score}</strong> of {tableTarget(game.boards)} to win</>}</span>
        <BrainStrikes strikes={game.strikes} max={TABLE_STRIKES} />
      </div>
      <BrainSlots slots={slots} />
      {lastLine && <p className={`brain-table__last brain-table__last--${last && (last.kind === "hit" || last.kind === "cleared" || last.kind === "stole") ? "hit" : "miss"}`} role="status">{lastLine}</p>}

      {playing ? (
        <>
          <p className="brain-pass__turn">
            {game.mode === "table" ? "What would most people say?"
              : game.phase === "steal" ? `${teamName(1 - game.control)}: one answer to steal ${game.pot} points.`
              : `${teamName(game.control)} is answering.`}
          </p>
          <form className="brain-table__answer" onSubmit={(e) => { e.preventDefault(); void answer(); }}>
            <Input id="brain-pass-answer" floatingLabel="Your answer" value={text} maxLength={40} autoComplete="off" fullWidth onChange={(e) => setText(e.target.value)} />
            <Button type="submit" variant="primary" size="small" disabled={busy || !text.trim()}>Check it</Button>
          </form>
        </>
      ) : (
        <div className="party-row">
          <Button variant="primary" onClick={moveOn}>{game.boardNo + 1 >= game.boards ? "See the result" : "Next board"}</Button>
        </div>
      )}
    </div>
  );
}
