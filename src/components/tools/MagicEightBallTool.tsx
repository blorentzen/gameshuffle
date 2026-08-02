"use client";

import { useState } from "react";
import { Button, Input } from "@empac/cascadeds";

type Tone = "yes" | "maybe" | "no";
interface Answer {
  text: string;
  tone: Tone;
}

// The classic 20 Magic 8-Ball answers: 10 affirmative, 5 non-committal, 5 negative.
const ANSWERS: Answer[] = [
  { text: "It is certain.", tone: "yes" },
  { text: "It is decidedly so.", tone: "yes" },
  { text: "Without a doubt.", tone: "yes" },
  { text: "Yes — definitely.", tone: "yes" },
  { text: "You may rely on it.", tone: "yes" },
  { text: "As I see it, yes.", tone: "yes" },
  { text: "Most likely.", tone: "yes" },
  { text: "Outlook good.", tone: "yes" },
  { text: "Yes.", tone: "yes" },
  { text: "Signs point to yes.", tone: "yes" },
  { text: "Reply hazy, try again.", tone: "maybe" },
  { text: "Ask again later.", tone: "maybe" },
  { text: "Better not tell you now.", tone: "maybe" },
  { text: "Cannot predict now.", tone: "maybe" },
  { text: "Concentrate and ask again.", tone: "maybe" },
  { text: "Don't count on it.", tone: "no" },
  { text: "My reply is no.", tone: "no" },
  { text: "My sources say no.", tone: "no" },
  { text: "Outlook not so good.", tone: "no" },
  { text: "Very doubtful.", tone: "no" },
];

export function MagicEightBallTool() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [shaking, setShaking] = useState(false);

  function shake() {
    if (shaking) return;
    setShaking(true);
    setAnswer(null);
    window.setTimeout(() => {
      setAnswer(ANSWERS[Math.floor(Math.random() * ANSWERS.length)]);
      setShaking(false);
    }, 900);
  }

  return (
    <div className="tool-panel eight-tool">
      <Input
        floatingLabel="Ask a yes-or-no question (optional)"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") shake();
        }}
        fullWidth
      />

      <button
        type="button"
        className={`eight-ball${shaking ? " is-shaking" : ""}`}
        onClick={shake}
        aria-label="Shake the Magic 8-Ball"
      >
        {answer && !shaking ? (
          <span className={`eight-ball__window eight-ball__window--${answer.tone}`} aria-live="polite">
            <span className="eight-ball__answer">{answer.text}</span>
          </span>
        ) : (
          <span className="eight-ball__num">8</span>
        )}
      </button>

      <Button variant="primary" onClick={shake} disabled={shaking}>
        {shaking ? "Shaking…" : answer ? "Ask again" : "Shake"}
      </Button>
    </div>
  );
}
