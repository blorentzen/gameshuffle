"use client";

/**
 * TriviaOverlay: the streamer's trivia night on the OBS overlay. The question
 * (and its picture or choices), a countdown and how many have answered; then
 * "time's up", the answer with how many got it, and the top of the standings.
 * Answers stay hidden until the reveal. Placement-aware like the other pieces.
 */

import { useEffect, useState, type CSSProperties } from "react";
import type { TriviaStreamView } from "@/lib/trivia/stream";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

export function TriviaOverlay({ trivia, style }: { trivia: TriviaStreamView; style?: CSSProperties }) {
  const [now, setNow] = useState(() => Date.now());
  const open = trivia.phase === "question";
  useEffect(() => {
    if (!open) return;
    const iv = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(iv);
  }, [open]);
  const left = trivia.closesAt ? Math.max(0, Math.ceil((Date.parse(trivia.closesAt) - now) / 1000)) : 0;
  const q = trivia.question;
  const done = trivia.status === "done";
  const showStandings = done || trivia.phase === "standings" || trivia.phase === "lobby";

  return (
    <div className="gs-trivia" style={style}>
      <div className="gs-trivia__head">
        <span>{done ? "Trivia · Final standings" : trivia.round ? `Trivia · ${trivia.round.title}` : "Trivia"}</span>
        {trivia.round && !done && q && <span>Q{trivia.questionIndex + 1} of {trivia.round.questionCount}</span>}
      </div>
      {q && !done && (
        <>
          <div className="gs-trivia__q">{q.prompt}</div>
          {q.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- our own picture route or the host's link
            <img className="gs-trivia__pic" src={q.imageUrl} alt="" />
          )}
          {q.kind === "choice" && q.options?.length ? (
            <ol className="gs-trivia__options">
              {q.options.map((o, i) => {
                const right = !!trivia.answer && (trivia.answer.toLowerCase() === o.toLowerCase() || trivia.answer.toUpperCase() === LETTERS[i]);
                return <li key={i} className={right ? "is-right" : ""}><b>{LETTERS[i]}</b><span>{o}</span></li>;
              })}
            </ol>
          ) : null}
        </>
      )}
      {open && (
        <div className="gs-trivia__status">
          <span>{q?.kind === "choice" ? "Type a letter or !a <answer>" : "Answer with !a <answer>"}</span>
          <span className="gs-trivia__clock">{left > 0 ? `${left}s` : "Last answers"}</span>
        </div>
      )}
      {open && <div className="gs-trivia__sub">{trivia.answered} answer{trivia.answered === 1 ? "" : "s"} in · hidden until the reveal</div>}
      {trivia.phase === "locked" && !done && <div className="gs-trivia__status"><span>Time&apos;s up!</span><span>{trivia.answered} answer{trivia.answered === 1 ? "" : "s"}</span></div>}
      {trivia.answer && !done && (
        <div className="gs-trivia__reveal">
          <small>The answer</small>
          <strong>{trivia.answer}</strong>
          <span>{trivia.gotIt ?? 0} of {trivia.answered} got it</span>
        </div>
      )}
      {showStandings && !q && !done && trivia.phase === "lobby" && <div className="gs-trivia__sub">Next question coming up</div>}
      {showStandings && trivia.standings.length > 0 && (
        <ol className="gs-trivia__standings">
          {trivia.standings.slice(0, done ? 5 : 3).map((s, i) => (
            <li key={`${s.name}-${i}`} className={i === 0 && done ? "is-winner" : ""}><b>{i + 1}</b><span>{s.name}</span><em>{s.score}</em></li>
          ))}
        </ol>
      )}
    </div>
  );
}
