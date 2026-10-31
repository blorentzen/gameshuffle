"use client";

/**
 * ChatBrainOverlay: a Chat Brain game on the OBS overlay. Chat plays: the
 * question, the board filling in, three strike marks, the guess countdown,
 * what chat is leaning toward, a short reveal or strike moment after each
 * guess, and the top play-along viewers. Speed round: who found each answer,
 * the timer to the next strike, and a "too slow" moment when it runs out. 1v1 and Teams: both sides' scores
 * (who's in control), the face-off, strikes for the side in control, "Trust
 * chat?" side by side, and chat's last steal. Placement-aware like the other
 * overlay pieces. Text only.
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { StreamGameView } from "@/lib/chatbrain/streamGame";
import type { StreamSurveyView } from "@/lib/chatbrain/survey";

const FLASH_MS = 4500;

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const iv = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(iv);
  }, [active]);
  return now;
}

const secsUntil = (iso: string, now: number) => Math.max(0, Math.ceil((Date.parse(iso) - now) / 1000));

export function ChatBrainOverlay({ game, style }: { game: StreamGameView; style?: CSSProperties }) {
  const now = useNow(game.status === "playing");
  if (game.versus) return <VersusBoard game={game} style={style} now={now} />;
  const w = game.window;
  const flash = game.last && now - Date.parse(game.last.at) < FLASH_MS ? game.last : null;
  const speed = game.mode === "speed";

  let status: string;
  if (game.phase === "done") status = `Final score: ${game.score} points`;
  else if (game.phase === "board_done") status = game.boardIndex + 1 < game.boardCount ? "Board over. Next board coming up" : "Board over";
  else if (game.phase === "guessing" && w && speed) status = `First to find one with !a  ·  ${secsUntil(w.closesAt, now)}s`;
  else if (game.phase === "guessing" && w) status = `Answer with !a  ·  ${secsUntil(w.closesAt, now)}s`;
  else if (w) status = game.phase === "starting" ? `Get ready: first guess in ${secsUntil(w.opensAt, now)}s` : `Next guess in ${secsUntil(w.opensAt, now)}s`;
  else status = "";

  return (
    <div className="gs-brain" style={style}>
      <div className="gs-brain__head">
        <span>Chat Brain{speed ? " · Speed round" : ""}{game.boardCount > 1 ? ` · Board ${game.boardIndex + 1} of ${game.boardCount}` : ""}</span>
        <span className="gs-brain__score">{game.score} pts</span>
      </div>
      {game.prize > 0 && game.status === "playing" && <div className="gs-brain__prize">Prize for the top brains: {game.prize} tokens</div>}
      <div className="gs-brain__q">{game.question}</div>
      {/* Two columns read down like the TV board (1-4 left, 5-8 right), split evenly for shorter boards. */}
      <ol className="gs-brain__board" style={{ gridTemplateRows: `repeat(${Math.max(1, Math.ceil(game.slots.length / 2))}, auto)` }}>
        {game.slots.map((s) => (
          <li key={s.rank} className={`gs-brain__slot${s.label ? (s.found ? " is-found" : " is-revealed") : ""}${flash?.rank === s.rank ? " is-new" : ""}`}>
            <span className="gs-brain__rank">{s.rank}</span>
            <span className="gs-brain__label">{s.label ?? ""}{s.finder && <small className="gs-brain__by">{s.finder}</small>}</span>
            <span className="gs-brain__pts">{s.points ?? ""}</span>
          </li>
        ))}
      </ol>
      <div className="gs-brain__status">
        <span className="gs-brain__strikes" aria-label={`${game.strikes} of 3 strikes`}>
          {[0, 1, 2].map((i) => <span key={i} className={i < game.strikes ? "is-on" : ""}>✕</span>)}
        </span>
        <span className="gs-brain__clock">{status}</span>
      </div>
      {game.phase === "guessing" && game.leaning.length > 0 && (
        <div className="gs-brain__lean">Chat is leaning: {game.leaning.map((l) => `${l.label} ${Math.round(l.share * 100)}%`).join("  ·  ")}</div>
      )}
      {flash && (
        <div className={`gs-brain__flash gs-brain__flash--${flash.result === "hit" ? "hit" : "miss"}`}>
          {flash.result === "hit"
            ? <>{flash.label}{flash.rank ? <small>#{flash.rank}{flash.finder ? ` · ${flash.finder}` : ""}</small> : null}</>
            : flash.result === "empty" ? <>{speed ? "✕ Too slow" : "✕ No answers"}</> : <>✕ {flash.label}{flash.already ? <small>already up</small> : null}</>}
        </div>
      )}
      {game.playalong.length > 0 && (
        <div className="gs-brain__top">{speed ? "Fastest brains" : "Top brains"}: {game.playalong.slice(0, 3).map((p) => `${p.name} ${p.points}`).join("  ·  ")}</div>
      )}
    </div>
  );
}

/** 1v1 and Teams: two sides play for control of each board; chat plays along. */
function VersusBoard({ game, style, now }: { game: StreamGameView; style?: CSSProperties; now: number }) {
  const v = game.versus!;
  const t = v.turn;
  const last = v.last && now - Date.parse(v.last.at) < FLASH_MS ? v.last : null;
  const control = v.sides.find((s) => s.inControl);
  const playing = game.status === "playing";
  const co = game.mode === "costream";

  let status: string;
  if (co && playing && v.phase !== "round_done" && v.phase !== "pick_control") {
    status = v.phase === "faceoff" ? "Face-off: the higher answer wins control"
      : v.phase === "control" && control ? `${control.name}'s chat in control`
      : v.phase === "steal" ? `${t?.side ?? "The other"}'s chat can steal!` : "";
  } else if (!playing) status = v.winner === 0 ? `It's a tie at ${v.sides[0].score}!` : `${v.sides.find((s) => s.team === v.winner)?.name ?? ""} wins!`;
  else if (v.phase === "round_done") status = v.round + 1 < v.rounds ? "Round over. Next round coming up" : "Round over";
  else if (v.phase === "pick_control") status = "The host picks who plays";
  else if (t?.state === "advisor") status = "Trust chat?";
  else if (v.phase === "faceoff") status = `Face-off: ${v.faceoff[0]} vs ${v.faceoff[1]}`;
  else if (v.phase === "control" && control) status = `${control.name} in control${t?.player ? ` · ${t.player} answers` : ""}`;
  else if (v.phase === "steal") status = `${t?.side ?? "The other side"} can steal!`;
  else if (v.phase === "last_steal" && t) status = t.state === "pause" ? `Chat's last steal in ${secsUntil(t.opensAt, now)}s` : `Chat's last steal! !a  ·  ${secsUntil(t.closesAt, now)}s`;
  else status = "";

  const chatLine = co && t && playing
    ? t.state === "open" ? `${t.kind === "faceoff" ? "Both chats" : `${t.side}'s chat`}: answer with !a  ·  ${secsUntil(t.closesAt, now)}s` : t.state === "pause" ? `Next answer in ${secsUntil(t.opensAt, now)}s` : null
    : t && playing && t.kind !== "last_steal"
    ? t.state === "open" ? `Chat, play along with !a  ·  ${secsUntil(t.closesAt, now)}s` : t.state === "pause" ? "Chat, get ready to play along" : null
    : null;

  return (
    <div className="gs-brain gs-brain--versus" style={style}>
      <div className="gs-brain__head">
        <span>Chat Brain{co ? " · Co-stream" : ""}{v.rounds > 1 ? ` · Round ${v.round + 1} of ${v.rounds}` : ""}{v.double && playing ? " · Double points" : ""}</span>
        {v.pot > 0 && playing && v.phase !== "round_done" && <span className="gs-brain__score">{v.pot * (v.double ? 2 : 1)} in play</span>}
      </div>
      {game.prize > 0 && playing && <div className="gs-brain__prize">Prize for chat&apos;s top brains: {game.prize} tokens</div>}
      <div className="gs-brain__sides">
        {v.sides.map((s) => (
          <div key={s.team} className={`gs-brain__side gs-brain__side--${s.team}${s.inControl && playing ? " is-control" : ""}${!playing && v.winner === s.team ? " is-winner" : ""}`}>
            <span className="gs-brain__side-name">{s.name}</span>
            <span className="gs-brain__side-score">{s.score}</span>
          </div>
        ))}
        {(v.chat.lastSteal || v.chat.score > 0) && (
          <div className="gs-brain__side gs-brain__side--3">
            <span className="gs-brain__side-name">Chat</span>
            <span className="gs-brain__side-score">{v.chat.score}</span>
          </div>
        )}
      </div>
      <div className="gs-brain__q">{game.question}</div>
      <ol className="gs-brain__board" style={{ gridTemplateRows: `repeat(${Math.max(1, Math.ceil(game.slots.length / 2))}, auto)` }}>
        {game.slots.map((s) => (
          <li key={s.rank} className={`gs-brain__slot${s.label ? (s.found ? ` is-found is-by-${s.by ?? 0}` : " is-revealed") : ""}${last?.rank === s.rank ? " is-new" : ""}`}>
            <span className="gs-brain__rank">{s.rank}</span>
            <span className="gs-brain__label">{s.label ?? ""}</span>
            <span className="gs-brain__pts">{s.points ?? ""}</span>
          </li>
        ))}
      </ol>
      <div className="gs-brain__status">
        {control && playing && (v.phase === "control" || v.phase === "steal") ? (
          <span className="gs-brain__strikes" aria-label={`${control.strikes} of 3 strikes`}>
            {[0, 1, 2].map((i) => <span key={i} className={i < control.strikes ? "is-on" : ""}>✕</span>)}
          </span>
        ) : <span />}
        <span className="gs-brain__clock">{status}</span>
      </div>
      {t?.state === "advisor" && t.advisor && (
        <div className="gs-brain__advisor">
          <span><small>{t.side}</small>{t.advisor.side}</span>
          <span><small>Chat · {Math.round(t.advisor.share * 100)}%</small>{t.advisor.chat}</span>
        </div>
      )}
      {(v.phase === "last_steal" || co) && game.leaning.length > 0 && (
        <div className="gs-brain__lean">Chat is leaning: {game.leaning.map((l) => `${l.label} ${Math.round(l.share * 100)}%`).join("  ·  ")}</div>
      )}
      {chatLine && <div className="gs-brain__lean">{chatLine}</div>}
      {last && (
        <div className={`gs-brain__flash gs-brain__flash--${last.result === "hit" ? "hit" : "miss"}`}>
          {last.result === "hit"
            ? <>{last.label}{last.rank ? <small>#{last.rank}</small> : null}</>
            : last.result === "empty" ? <>✕ No answer</> : <>✕ {last.label}{last.already ? <small>already up</small> : null}</>}
        </div>
      )}
      {game.playalong.length > 0 && (
        <div className="gs-brain__top">{co ? "Top brains in both chats" : "Top brains in chat"}: {game.playalong.slice(0, 3).map((p) => `${p.name} ${p.points}`).join("  ·  ")}</div>
      )}
    </div>
  );
}

/**
 * A survey round (no game): the question, a countdown and either the groups
 * forming live (bars, numbered for `!cb hide` / `!cb merge`) or just a count
 * for a hidden round. Once closed: the board chat made, or a thank-you.
 */
export function ChatBrainSurveyOverlay({ survey, style }: { survey: StreamSurveyView; style?: CSSProperties }) {
  const open = survey.status === "open";
  const now = useNow(open);
  const r = survey.result;
  const left = secsUntil(survey.closesAt, now);
  const count = `${survey.answers} answer${survey.answers === 1 ? "" : "s"}`;

  let body: ReactNode;
  if (open && survey.style === "live") {
    body = survey.groups.length ? (
      <ol className="gs-brain__survey">
        {survey.groups.map((g) => (
          <li key={g.n} className="gs-brain__bar">
            <span className="gs-brain__rank">{g.n}</span>
            <span className="gs-brain__label">{g.label}</span>
            <span className="gs-brain__pts">{Math.round(g.share * 100)}%</span>
            <span className="gs-brain__fill" style={{ width: `${Math.max(4, Math.round(g.share * 100))}%` }} aria-hidden />
          </li>
        ))}
      </ol>
    ) : <div className="gs-brain__note">Answers show up here once two of you say the same thing.</div>;
  } else if (open) {
    body = <div className="gs-brain__count"><strong>{survey.answers}</strong><span>{survey.own ? "answers in. They stay secret until we play the board." : "answers in. Thanks chat!"}</span></div>;
  } else if (r?.made && r.board) {
    body = (
      <ol className="gs-brain__board" style={{ gridTemplateRows: `repeat(${Math.max(1, Math.ceil(r.board.length / 2))}, auto)` }}>
        {r.board.map((b) => (
          <li key={b.rank} className="gs-brain__slot is-found">
            <span className="gs-brain__rank">{b.rank}</span>
            <span className="gs-brain__label">{b.label}</span>
            <span className="gs-brain__pts">{b.points}</span>
          </li>
        ))}
      </ol>
    );
  } else if (r?.made) {
    body = <div className="gs-brain__count"><strong>{r.size}</strong><span>answers on your board. It stays hidden until you play it.</span></div>;
  } else if (survey.own && survey.groups.length) {
    body = (
      <ol className="gs-brain__survey">
        {survey.groups.slice(0, 5).map((g) => (
          <li key={g.n} className="gs-brain__bar">
            <span className="gs-brain__rank">{g.n}</span>
            <span className="gs-brain__label">{g.label}</span>
            <span className="gs-brain__pts">{g.count}</span>
            <span className="gs-brain__fill" style={{ width: `${Math.max(4, Math.round(g.share * 100))}%` }} aria-hidden />
          </li>
        ))}
      </ol>
    );
  } else {
    body = <div className="gs-brain__note">{survey.own ? "Not enough answers for a board this time." : `Thanks chat! ${count} toward a GameShuffle board.`}</div>;
  }

  return (
    <div className="gs-brain gs-brain--survey" style={style}>
      <div className="gs-brain__head">
        <span>Chat Brain · {open ? "Survey" : r?.made ? "Board ready" : "Survey closed"}</span>
        <span className="gs-brain__score">{count}</span>
      </div>
      <div className="gs-brain__q">{survey.question}</div>
      {body}
      {open && (
        <div className="gs-brain__status">
          <span className="gs-brain__clock">Answer with !a</span>
          <span className="gs-brain__clock">{left}s</span>
        </div>
      )}
    </div>
  );
}
