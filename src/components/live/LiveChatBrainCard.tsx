"use client";

/**
 * Chat Brain on the live page: the streamer's game or survey round, so viewers
 * on GameShuffle can play here as well as in chat. Signed-in viewers answer
 * (a Twitch-linked account is the same player as in chat; anyone else plays
 * as their account): a guess in Chat plays, a find in the speed round, a
 * play-along guess in 1v1 and Teams, or a survey answer. Shows no more than
 * the overlay does. Polls every 2 seconds. Data: /api/chat-brain/live/[communityId].
 */

import { useEffect, useState } from "react";
import { Button, Input } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, track } from "@/lib/analytics/events";
import { AuthPromptModal } from "./AuthPromptModal";
import type { StreamGameView } from "@/lib/chatbrain/streamGame";
import type { StreamSurveyView } from "@/lib/chatbrain/survey";

interface LiveData {
  game: StreamGameView | null;
  survey: StreamSurveyView | null;
  open: { opensAt: string; closesAt: string } | null;
  signedIn: boolean;
  you: { answer: string | null; points: number } | null;
}

const secsUntil = (iso: string, now: number) => Math.max(0, Math.ceil((Date.parse(iso) - now) / 1000));
const MODE_LABEL: Record<StreamGameView["mode"], string> = { host: "", speed: " · Speed round", versus: " · 1v1", teams: " · Teams", costream: " · Co-stream" };

export function LiveChatBrainCard({ communityId, streamerSlug }: { communityId: string | null; streamerSlug: string }) {
  const toast = useToast();
  const [data, setData] = useState<LiveData | null>(null);
  const [draft, setDraft] = useState({ key: "", text: "" });
  const [busy, setBusy] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!communityId) return;
    let active = true;
    const load = async () => {
      const d = await fetch(`/api/chat-brain/live/${communityId}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (active && d?.ok) setData(d as LiveData);
    };
    void load();
    const iv = window.setInterval(load, 2000);
    return () => { active = false; window.clearInterval(iv); };
  }, [communityId]);

  const live = !!data?.open;
  useEffect(() => {
    if (!live) return;
    const iv = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(iv);
  }, [live]);

  if (!communityId || !data || (!data.game && !data.survey)) return null;
  const { game: g, survey: sv, open, you } = data;
  const accepting = !!open && Date.parse(open.opensAt) <= now && Date.parse(open.closesAt) > now;
  const key = open?.opensAt ?? "";
  const typed = draft.key === key ? draft.text : "";
  const mode = g ? g.mode : "survey";

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data.signedIn) { setAuthOpen(true); return; }
    const text = typed.trim();
    if (!text) return;
    setBusy(true);
    const r = await fetch(`/api/chat-brain/live/${communityId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) })
      .then((res) => res.json()).catch(() => null);
    setBusy(false);
    if (r?.ok) {
      track(EVENTS.brainLiveAnswered, { mode });
      setDraft({ key, text: "" });
      setData((d) => (d ? { ...d, you: { answer: text, points: d.you?.points ?? 0 } } : d));
      toast.success(mode === "speed" ? "Sent. If you're first, it's yours!" : "Answer in. You can change it while time's left.");
    } else {
      toast.error(r?.error === "closed" ? "Time's up for that one. Catch the next!" : r?.error === "slow_down" ? "Slow down a little, then try again." : r?.error === "rejected" ? "That answer can't be used." : "Couldn't send that. Try again.");
    }
  };

  const help = mode === "survey" ? "Say the first thing that comes to mind. One answer each; answer again to change it."
    : mode === "speed" ? "First to type a hidden answer reveals it and takes its points."
    : mode === "host" ? "What most of chat says is chat's answer. Your own guess scores too if it's on the board."
    : mode === "costream" ? "Your answer counts for your streamer's chat. Your own guess scores too if it's on the board."
    : "Play along: your guess scores if it's on the board.";

  return (
    <section className="live-poll live-break live-brain" aria-labelledby="live-brain-title">
      <div className="live-break__head">
        <h2 id="live-brain-title" className="live-break__title">Chat Brain{g ? MODE_LABEL[g.mode] : " · Survey"}</h2>
        {accepting && open && <span className="live-break__clock">{secsUntil(open.closesAt, now)}s</span>}
      </div>

      {g ? <GameBoard g={g} /> : sv ? <SurveyBoard sv={sv} /> : null}

      {accepting ? (
        <>
          <form className="live-break__form" onSubmit={(e) => void send(e)}>
            <Input id="live-brain-answer" size="small" value={typed} onChange={(e) => setDraft({ key, text: e.target.value })}
              placeholder={mode === "survey" ? "Your answer" : "Your guess"} aria-label={mode === "survey" ? "Your answer" : "Your guess"} maxLength={40} autoComplete="off" />
            <Button type="submit" size="small" variant="primary" disabled={busy || !typed.trim()}>Send</Button>
          </form>
          <p className="live-break__leaders">{help} Or type <b>!a</b>{" "}and your answer in chat.</p>
        </>
      ) : g?.status === "playing" || sv?.status === "open" ? (
        <p className="live-break__line">{waitingLine(g, open, now)}</p>
      ) : null}

      {you?.answer && accepting && <p className="live-break__mine">{mode === "speed" ? "Your last guess" : "Your answer"}: {you.answer}</p>}
      {g && you && you.points > 0 && <p className="live-break__mine">Your points: {you.points}</p>}
      {g && g.prize > 0 && g.status === "playing" && <p className="live-break__leaders">Prize: {g.prize} tokens for the top brains when the game ends.</p>}
      {g && g.playalong.length > 0 && (
        <>
          <p className="live-break__meta">{g.mode === "speed" ? "Fastest brains" : "Top brains"}</p>
          <ol className="live-trivia__standings">
            {g.playalong.slice(0, 5).map((p, i) => <li key={`${p.name}-${i}`}><span>{p.name}</span><b>{p.points}</b></li>)}
          </ol>
        </>
      )}
      <AuthPromptModal isOpen={authOpen} onClose={() => setAuthOpen(false)} streamerSlug={streamerSlug} actionLabel="play Chat Brain" />
    </section>
  );
}

function waitingLine(g: StreamGameView | null, open: LiveData["open"], now: number): string {
  if (g?.phase === "board_done") return g.boardIndex + 1 < g.boardCount ? "Board over. The next one is coming up." : "Board over.";
  if (open && Date.parse(open.opensAt) > now) return `Next ${g?.mode === "speed" ? "board starts" : "guess opens"} in ${secsUntil(open.opensAt, now)}s.`;
  if (g?.versus) return "The players are answering. Chat plays along on the next turn.";
  return "Get ready for the next question.";
}

function GameBoard({ g }: { g: StreamGameView }) {
  const v = g.versus;
  const done = g.status !== "playing";
  return (
    <>
      <p className="live-break__meta">
        {v ? `Round ${v.round + 1} of ${v.rounds}${v.double && !done ? " · double points" : ""}` : `Board ${g.boardIndex + 1} of ${g.boardCount}`}
        {!v && ` · ${g.score} points · ${g.strikes} of 3 strikes`}
      </p>
      {v && (
        <ul className="live-brain__sides">
          {v.sides.map((s) => (
            <li key={s.team} className={s.inControl && !done ? "is-control" : ""}><span>{s.name}</span><b>{s.score}</b></li>
          ))}
          {(v.chat.lastSteal || v.chat.score > 0) && <li><span>Chat</span><b>{v.chat.score}</b></li>}
        </ul>
      )}
      <p className="live-break__prompt">{g.question}</p>
      <ol className="live-brain__board">
        {g.slots.map((s) => (
          <li key={s.rank} className={s.label ? (s.found ? "is-found" : "is-revealed") : ""}>
            <span className="live-brain__rank">{s.rank}</span>
            <span className="live-brain__label">{s.label ?? <span className="sr-only">Hidden</span>}{s.finder && <small> · {s.finder}</small>}</span>
            <span className="live-brain__pts">{s.points ?? ""}</span>
          </li>
        ))}
      </ol>
      {done && (
        <p className="live-break__reveal">
          {v ? (v.winner === 0 ? `It's a tie at ${v.sides[0].score}!` : `${v.sides.find((s) => s.team === v.winner)?.name ?? ""} wins!`) : `Game over! Chat ${g.mode === "speed" ? "found" : "scored"} ${g.score} points.`}
        </p>
      )}
      {!done && g.last && (
        <p className="live-break__line">
          {g.mode === "speed"
            ? g.last.result === "hit" ? `${g.last.finder ?? "Someone"} found ${g.last.label}!` : "Too slow: that's a strike."
            : g.last.result === "hit" ? `Chat said ${g.last.label}: #${g.last.rank} on the board!` : g.last.result === "empty" ? "Nobody answered: a strike." : `Chat said ${g.last.label}${g.last.already ? ", already up there" : ": not on the board"}.`}
        </p>
      )}
    </>
  );
}

function SurveyBoard({ sv }: { sv: StreamSurveyView }) {
  const open = sv.status === "open";
  return (
    <>
      <p className="live-break__prompt">{sv.question}</p>
      {open && sv.style === "live" && sv.groups.length > 0 ? (
        <ol className="live-brain__board live-brain__board--bars">
          {sv.groups.map((gr) => (
            <li key={gr.n} className="is-found">
              <span className="live-brain__rank">{gr.n}</span>
              <span className="live-brain__label">{gr.label}</span>
              <span className="live-brain__pts">{Math.round(gr.share * 100)}%</span>
            </li>
          ))}
        </ol>
      ) : open ? (
        <p className="live-break__line">{sv.answers} answer{sv.answers === 1 ? "" : "s"} in.{sv.style === "hidden" ? " They stay secret for now." : " Answers show up once two people say the same thing."}</p>
      ) : (
        <p className="live-break__line">
          {sv.result?.made ? "Survey closed: chat made a board. Watch for it on stream!" : `Survey closed with ${sv.answers} answer${sv.answers === 1 ? "" : "s"}. Thanks for playing!`}
        </p>
      )}
    </>
  );
}
