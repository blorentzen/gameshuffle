"use client";

/**
 * A Fire Round in play: the clock (or hearts), the heat and the score along
 * the top, then the question with a box to type the answer for 100, or four
 * choices for 40 (Britton's picks, 2026-10-19). The last answer's result sits
 * above the next question instead of pausing the clock. Keys: Enter answers,
 * 1 to 4 (or A to D) pick a choice once they're open.
 */

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Input, Progress } from "@empac/cascadeds";
import { IconCheck, IconClock, IconFlame, IconFlameFilled, IconHeartBroken, IconHeartFilled, IconListLetters, IconPlayerSkipForward, IconX } from "@tabler/icons-react";
import { CHOICE_POINTS, LENGTHS, LIVES, TYPED_POINTS } from "@/lib/originals/fireRound";
import type { FireOutcome, FireRunView } from "@/lib/fireRound/store";
import { FireGlyph } from "./fireIcons";

export type FireMove = { action: "typed" | "choice"; text: string } | { action: "choices" | "skip" | "stop" };

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const heatText = (h: number) => (h === 1.5 ? "×1.5" : h === 2 ? "×2" : "×1");

function Feedback({ outcome }: { outcome: FireOutcome | null }) {
  if (!outcome || outcome.verdict === "close") return null;
  if (outcome.verdict === "right") {
    return (
      <p className="fire-feedback fire-feedback--right">
        <IconCheck size={18} aria-hidden /> Right: {outcome.answer} <span className="fire-feedback__pts">+{outcome.points}{outcome.heat > 1 ? ` (${heatText(outcome.heat)})` : ""}</span>
      </p>
    );
  }
  return (
    <p className={`fire-feedback fire-feedback--${outcome.verdict}`}>
      <IconX size={18} aria-hidden /> {outcome.verdict === "skip" ? "Skipped" : "Not quite"}: it was {outcome.answer}
    </p>
  );
}

export function FirePlay({ run, outcome, busy, offset, onMove, onTimeUp }: {
  run: FireRunView;
  outcome: FireOutcome | null;
  busy: boolean;
  /** Server time minus this browser's, so the clock matches the server's. */
  offset: number;
  onMove: (m: FireMove) => void;
  onTimeUp: () => void;
}) {
  const q = run.question;
  const [text, setText] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const input = useRef<HTMLInputElement>(null);
  const firedTimeUp = useRef(false);
  const total = LENGTHS[run.length].seconds;
  const left = run.endsAt ? Date.parse(run.endsAt) - (now + offset) : null;

  // A new question: clear the box and put the cursor in it.
  const index = q?.index ?? 0;
  useEffect(() => {
    void Promise.resolve().then(() => setText(""));
    if (!q?.choices) input.current?.focus({ preventScroll: true });
  }, [index, q?.choices]);

  useEffect(() => {
    if (!run.endsAt) return;
    const t = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(t);
  }, [run.endsAt]);

  useEffect(() => {
    if (left !== null && left <= 0 && !firedTimeUp.current) {
      firedTimeUp.current = true;
      onTimeUp();
    }
  }, [left, onTimeUp]);

  // 1-4 or A-D pick a choice.
  useEffect(() => {
    if (!q?.choices) return;
    const choices = q.choices;
    const onKey = (e: KeyboardEvent) => {
      if (busy || e.metaKey || e.ctrlKey || e.altKey) return;
      const i = "1234".indexOf(e.key) >= 0 ? "1234".indexOf(e.key) : "abcd".indexOf(e.key.toLowerCase());
      if (i >= 0 && choices[i]) { e.preventDefault(); onMove({ action: "choice", text: choices[i] }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [q?.choices, busy, onMove]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!busy && text.trim()) onMove({ action: "typed", text: text.trim() });
  };

  const lives = run.lives;

  return (
    <section className="fire-play" aria-labelledby="fire-question">
      <div className="fire-bar">
        <div className="fire-bar__row">
          {lives !== null ? (
            <span className="fire-bar__lives" role="img" aria-label={`${lives} ${lives === 1 ? "miss" : "misses"} left`}>
              {Array.from({ length: LIVES }, (_, i) => (i < lives ? <IconHeartFilled key={i} size={18} aria-hidden /> : <IconHeartBroken key={i} size={18} className="fire-bar__lost" aria-hidden />))}
            </span>
          ) : (
            <span className="fire-bar__time"><IconClock size={18} aria-hidden /><span className="sr-only">Time left </span>{clock(left ?? 0)}</span>
          )}
          <span className={`fire-heat${run.heat > 1 ? " fire-heat--hot" : ""}`}>
            {run.heat > 1 ? <IconFlameFilled size={16} aria-hidden /> : <IconFlame size={16} aria-hidden />}
            {heatText(run.heat)}{run.streak >= 3 ? ` · ${run.streak} in a row` : ""}
          </span>
          <span className="fire-bar__score"><span className="sr-only">Score </span>{run.score.toLocaleString("en-US")}</span>
        </div>
        {total && left !== null && (
          <Progress value={Math.max(0, Math.min(100, (left / (total * 1000)) * 100))} size="xsmall" variant={left < 10_000 ? "error" : "warning"} label="Time left" className="admin-progress-quiet fire-bar__progress" />
        )}
      </div>

      <div className="fire-q" aria-live="polite">
        <Feedback outcome={outcome} />
        {q && (
          <>
            <p className="fire-q__tag"><FireGlyph name={q.icon} /> {q.category} · question {q.index}</p>
            <h2 id="fire-question" className="fire-q__prompt">{q.prompt}</h2>
            {q.image && (
              // A same-origin proxy (the file name would give the answer away), so a plain img.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={q.image} alt="The picture for this question" className="fire-q__pic" width={220} height={220} />
            )}
          </>
        )}
      </div>

      {q && !q.choices && (
        <form className="fire-answer" onSubmit={submit}>
          <div className="fire-answer__row">
            <Input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your answer" aria-label="Your answer" maxLength={120} autoComplete="off" autoCapitalize="off" spellCheck={false} fullWidth />
            <Button type="submit" variant="primary" disabled={busy || !text.trim()}>Answer</Button>
          </div>
          <div className="fire-answer__alts">
            <Button type="button" variant="secondary" size="small" iconBefore={IconListLetters} disabled={busy} onClick={() => onMove({ action: "choices" })}>Show 4 choices · {CHOICE_POINTS}</Button>
            <Button type="button" variant="ghost" size="small" iconBefore={IconPlayerSkipForward} disabled={busy} onClick={() => onMove({ action: "skip" })}>Skip</Button>
          </div>
          <p className="fire-answer__note">Typed answers score {TYPED_POINTS} and forgive small typos.{lives !== null ? " A miss or a skip costs a heart." : ""}</p>
        </form>
      )}

      {q?.choices && (
        <div className="fire-choices">
          {q.close && <p className="fire-choices__close">Close. Pick the exact answer:</p>}
          <div className="fire-choices__list" role="group" aria-label="Four choices">
            {q.choices.map((c, i) => (
              <Button key={c} variant="secondary" fullWidth disabled={busy} onClick={() => onMove({ action: "choice", text: c })} className="fire-choice">
                <kbd className="fire-choice__key" aria-hidden>{"ABCD"[i]}</kbd>{c}
              </Button>
            ))}
          </div>
          <p className="fire-answer__note">Worth {CHOICE_POINTS}{run.heat > 1 ? `, times your heat (${heatText(run.heat)})` : ""}.</p>
        </div>
      )}

      {lives !== null && (
        <div className="fire-stop">
          <Button variant="ghost" size="small" disabled={busy} onClick={() => onMove({ action: "stop" })}>Stop and keep my score</Button>
        </div>
      )}
    </section>
  );
}
