"use client";

/**
 * A game's trivia questions with tap-to-reveal answers. Every answer is in the
 * page's HTML (the page promises answers), hidden until its button or "Show
 * every answer" is pressed. Picture questions show the picture; changeable
 * facts say when they were checked.
 */

import { useState } from "react";
import { Button, Switch } from "@empac/cascadeds";
import { EVENTS, track } from "@/lib/analytics/events";

export interface TopicQuestionView {
  id: string;
  prompt: string;
  answer: string;
  options: string[] | null;
  imageUrl: string | null;
  difficulty: "easy" | "medium" | "hard";
  asOf: string | null;
  source: { title: string; url: string | null } | null;
}

const DIFFICULTY = { easy: "Easy", medium: "Medium", hard: "Hard" } as const;

export function TopicQuestionList({ questions, topic }: { questions: TopicQuestionView[]; topic: string }) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [noted, setNoted] = useState(false);

  const note = () => { if (!noted) { setNoted(true); track(EVENTS.toolUsed, { tool: "trivia-questions", topic }); } };
  const toggle = (id: string) => {
    note();
    setOpen((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  return (
    <div className="topic-questions">
      <div className="topic-questions__bar">
        <Switch checked={all} onChange={(e) => { note(); setAll(e.target.checked); }} label="Show every answer" />
      </div>
      <ol className="topic-questions__list">
        {questions.map((q, i) => {
          const shown = all || open.has(q.id);
          return (
            <li key={q.id} className="topic-questions__item">
              <div className="topic-questions__meta">
                <span className="topic-questions__num">{i + 1}</span>
                <span className={`topic-questions__level topic-questions__level--${q.difficulty}`}>{DIFFICULTY[q.difficulty]}</span>
              </div>
              <p className="topic-questions__prompt">{q.prompt}</p>
              {q.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="topic-questions__pic" src={q.imageUrl} alt={`Picture for question ${i + 1}`} loading="lazy" width={256} height={256} />
              )}
              {q.options && q.options.length > 0 && (
                <ul className="topic-questions__options">
                  {q.options.map((o, j) => <li key={o}><b>{String.fromCharCode(65 + j)}</b> {o}</li>)}
                </ul>
              )}
              <div className="topic-questions__reveal">
                {!all && (
                  <Button variant="secondary" size="small" aria-expanded={shown} aria-controls={`answer-${q.id}`} onClick={() => toggle(q.id)}>
                    {shown ? "Hide answer" : "Show answer"}
                  </Button>
                )}
                <div id={`answer-${q.id}`} className={`topic-questions__answer${shown ? " is-shown" : ""}`} aria-hidden={!shown}>
                  <span className="topic-questions__answer-text">Answer: <strong>{q.answer}</strong></span>
                  {(q.asOf || q.source) && (
                    <span className="topic-questions__source">
                      {q.asOf ? `Checked ${q.asOf}. ` : ""}
                      {q.source ? (q.source.url ? <>Source: <a href={q.source.url} target="_blank" rel="noopener noreferrer" tabIndex={shown ? 0 : -1}>{q.source.title}</a></> : <>Source: {q.source.title}</>) : null}
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
