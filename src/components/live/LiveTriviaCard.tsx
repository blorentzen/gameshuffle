"use client";

/**
 * Trivia on the live page: the streamer's trivia night on stream, so viewers
 * on GameShuffle can answer here as well as in chat. Signed-in viewers answer
 * (a Twitch-linked account is the same player as in chat); answers stay hidden
 * until the streamer reveals the question. Polls every 2 seconds while a night
 * is on. Data: /api/trivia/live/[communityId].
 */

import { useEffect, useState } from "react";
import { Button, Input } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { AuthPromptModal } from "./AuthPromptModal";
import type { TriviaStreamView } from "@/lib/trivia/stream";

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const secsUntil = (iso: string | null, now: number) => (iso ? Math.max(0, Math.ceil((Date.parse(iso) - now) / 1000)) : 0);

export function LiveTriviaCard({ communityId, streamerSlug }: { communityId: string | null; streamerSlug: string }) {
  const toast = useToast();
  const [view, setView] = useState<TriviaStreamView | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [draft, setDraft] = useState({ key: "", text: "" });
  const [busy, setBusy] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!communityId) return;
    let active = true;
    const load = async () => {
      const d = await fetch(`/api/trivia/live/${communityId}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (!active || !d?.ok) return;
      setView(d.view ?? null);
      setSignedIn(!!d.signedIn);
    };
    void load();
    const iv = window.setInterval(load, 2000);
    return () => { active = false; window.clearInterval(iv); };
  }, [communityId]);

  const open = view?.phase === "question";
  useEffect(() => {
    if (!open) return;
    const iv = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(iv);
  }, [open]);

  if (!view || !communityId) return null;
  const key = `${view.id}:${view.round?.index}:${view.questionIndex}`;
  const typed = draft.key === key ? draft.text : "";
  const q = view.question;
  const mine = view.you?.answer ?? null;

  const answer = async (text: string) => {
    if (!signedIn) { setAuthOpen(true); return; }
    if (!text.trim()) return;
    setBusy(true);
    const d = await fetch(`/api/trivia/live/${communityId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) })
      .then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) {
      setView((v) => (v ? { ...v, you: { ...(v.you ?? { name: "You", score: 0, rank: null, verdict: null }), answer: text.trim() } } : v));
      toast.success("Answer in. You can change it until time's up.");
    } else toast.error(d?.error === "closed" ? "Time's up for that one. Catch the next question!" : "Couldn't send that. Try again.");
  };

  const left = secsUntil(view.closesAt, now);
  const verdict = view.you?.verdict;

  return (
    <section className="live-poll live-break live-trivia" aria-labelledby="live-trivia-title">
      <div className="live-break__head">
        <h2 id="live-trivia-title" className="live-break__title">Trivia: {view.title}</h2>
        {open && <span className={`live-break__clock${left > 0 ? "" : " is-last"}`}>{left > 0 ? `${left}s` : "Last answers…"}</span>}
      </div>

      {view.status === "done" ? (
        <p className="live-break__line">{view.standings[0] ? `${view.standings[0].name} wins with ${view.standings[0].score}. Thanks for playing!` : "That's the end. Thanks for playing!"}</p>
      ) : q ? (
        <>
          {view.round && <p className="live-break__meta">{view.round.title} · question {view.questionIndex + 1} of {view.round.questionCount}</p>}
          <p className="live-break__prompt">{q.prompt}</p>
          {q.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- our own picture route or the host's link
            <img className="live-trivia__pic" src={q.imageUrl} alt="The picture for this question" />
          )}
          {q.kind === "choice" && q.options?.length ? (
            <div className="live-break__choices" role="group" aria-label="Answers">
              {q.options.map((o, i) => {
                const letter = LETTERS[i];
                const picked = mine?.toUpperCase() === letter || mine?.toLowerCase() === o.toLowerCase();
                const right = !!view.answer && (view.answer.toLowerCase() === o.toLowerCase() || view.answer.toUpperCase() === letter);
                return (
                  <Button key={letter} size="small" variant={picked || right ? "primary" : "secondary"} disabled={busy || !open} aria-pressed={picked} onClick={() => void answer(letter)}>
                    {letter}. {o}
                  </Button>
                );
              })}
            </div>
          ) : open ? (
            <form className="live-break__form" onSubmit={(e) => { e.preventDefault(); void answer(typed); }}>
              <Input id="live-trivia-answer" size="small" value={typed} onChange={(e) => setDraft({ key, text: e.target.value })} placeholder="Your answer" aria-label="Your answer" maxLength={120} autoComplete="off" />
              <Button type="submit" size="small" variant="primary" disabled={busy || !typed.trim()}>Send</Button>
            </form>
          ) : null}
          {mine && q.kind !== "choice" && <p className="live-break__mine">Your answer: {mine}</p>}
          {view.phase === "locked" && <p className="live-break__line">Time&apos;s up! {view.answered} answer{view.answered === 1 ? "" : "s"} in. The answer is coming up.</p>}
          {view.answer && (
            <p className="live-break__reveal">
              The answer: <b>{view.answer}</b>. {view.gotIt ?? 0} of {view.answered} got it.
              {verdict ? (verdict === "correct" ? " You got it!" : verdict === "partial" ? " Half points for you." : " Not this time.") : ""}
            </p>
          )}
        </>
      ) : (
        <p className="live-break__line">{view.phase === "standings" ? "Standings so far." : "Next question coming up. Answer here or in chat with !a."}</p>
      )}

      {view.standings.length > 0 && (
        <ol className="live-trivia__standings">
          {view.standings.slice(0, 5).map((s, i) => <li key={`${s.name}-${i}`}><span>{s.name}</span><b>{s.score}</b></li>)}
        </ol>
      )}
      {view.you && view.you.score > 0 && <p className="live-break__mine">You: {view.you.score} point{view.you.score === 1 ? "" : "s"}{view.you.rank ? `, #${view.you.rank}` : ""}</p>}
      <AuthPromptModal isOpen={authOpen} onClose={() => setAuthOpen(false)} streamerSlug={streamerSlug} actionLabel="play along" />
    </section>
  );
}
