"use client";

/**
 * The Activity's Trivia tab. When the server's owner is running a trivia
 * night on stream, it's here to play along (the same player as Discord's
 * buttons, scored with everyone else). Otherwise a practice round: five
 * questions from the GameShuffle pack, checked one at a time, nothing scored
 * or saved. Data: /api/activity/trivia through the Activity's host.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Input } from "@empac/cascadeds";
import { IconBulb, IconCheck, IconX } from "@tabler/icons-react";
import { useOriginalsHost } from "@/components/originals/OriginalsHost";
import { useToast } from "@/components/toast/ToastProvider";
import type { TriviaStreamView } from "@/lib/trivia/stream";
import type { PracticeQuestion, PracticeResult } from "@/lib/activity/trivia";

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const secsUntil = (iso: string | null, now: number) => (iso ? Math.max(0, Math.ceil((Date.parse(iso) - now) / 1000)) : 0);

export function ActivityTrivia({ active }: { active: boolean }) {
  const { api } = useOriginalsHost();
  const [live, setLive] = useState<TriviaStreamView | null>(null);
  const [checked, setChecked] = useState(false);

  // The server's night on stream: every 2s while one is on, every 10s otherwise, only while the tab is open.
  useEffect(() => {
    if (!active) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      const j = await api("/api/activity/trivia", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (stop) return;
      if (j?.ok) setLive(j.live ?? null);
      setChecked(true);
      timer = setTimeout(load, j?.live?.status === "live" ? 2000 : 10_000);
    };
    void load();
    return () => { stop = true; clearTimeout(timer); };
  }, [active, api]);

  if (!checked) return <p className="gs-activity__muted" role="status">Looking for a trivia night…</p>;
  return (
    <div className="gs-activity__trivia">
      {live && <LiveNight view={live} onAnswered={(text) => setLive((v) => (v ? { ...v, you: { ...(v.you ?? { name: "You", score: 0, rank: null, verdict: null }), answer: text } } : v))} />}
      {(!live || live.status === "done") && <Practice />}
    </div>
  );
}

function LiveNight({ view, onAnswered }: { view: TriviaStreamView; onAnswered: (text: string) => void }) {
  const { api } = useOriginalsHost();
  const toast = useToast();
  const [draft, setDraft] = useState({ key: "", text: "" });
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const open = view.phase === "question";
  useEffect(() => {
    if (!open) return;
    const iv = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(iv);
  }, [open]);

  const key = `${view.id}:${view.round?.index}:${view.questionIndex}`;
  const typed = draft.key === key ? draft.text : "";
  const q = view.question;
  const mine = view.you?.answer ?? null;
  const left = secsUntil(view.closesAt, now);

  const answer = async (text: string) => {
    if (!text.trim()) return;
    setBusy(true);
    const j = await api("/api/activity/trivia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) })
      .then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (j?.ok) { onAnswered(text.trim()); toast.success("Answer in. You can change it until time's up."); }
    else toast.error(j?.error === "closed" ? "Time's up for that one. Catch the next question!" : "Couldn't send that. Try again.");
  };

  return (
    <Card variant="outlined" padding="medium" className="gs-activity__trivia-card">
      <div className="gs-activity__trivia-head">
        <Badge variant={view.status === "live" ? "error" : "default"} size="small">{view.status === "live" ? "Live" : "Finished"}</Badge>
        <h2 className="gs-activity__trivia-title">{view.title}</h2>
        {open && <span className="gs-activity__trivia-clock">{left > 0 ? `${left}s` : "Last answers…"}</span>}
      </div>
      {view.status === "done" ? (
        <p>{view.standings[0] ? `${view.standings[0].name} won with ${view.standings[0].score}. Thanks for playing!` : "That's the end of the night."}</p>
      ) : q ? (
        <>
          {view.round && <p className="gs-activity__muted">{view.round.title} · question {view.questionIndex + 1} of {view.round.questionCount}</p>}
          <p className="gs-activity__trivia-prompt">{q.prompt}</p>
          {q.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- our own picture route (same origin inside Discord)
            <img className="gs-activity__trivia-pic" src={q.imageUrl} alt="The picture for this question" />
          )}
          {q.kind === "choice" && q.options?.length ? (
            <div className="gs-activity__trivia-choices" role="group" aria-label="Answers">
              {q.options.map((o, i) => {
                const letter = LETTERS[i];
                const picked = mine?.toUpperCase() === letter || mine?.toLowerCase() === o.toLowerCase();
                const right = !!view.answer && view.answer.toLowerCase() === o.toLowerCase();
                return (
                  <Button key={letter} variant={picked || right ? "primary" : "secondary"} disabled={busy || !open} aria-pressed={picked} onClick={() => void answer(letter)}>
                    {letter}. {o}
                  </Button>
                );
              })}
            </div>
          ) : open ? (
            <form className="gs-activity__trivia-form" onSubmit={(e) => { e.preventDefault(); void answer(typed); }}>
              <Input id="activity-trivia-live" value={typed} onChange={(e) => setDraft({ key, text: e.target.value })} placeholder="Your answer" aria-label="Your answer" maxLength={120} autoComplete="off" fullWidth />
              <Button type="submit" variant="primary" disabled={busy || !typed.trim()}>Send</Button>
            </form>
          ) : null}
          {mine && q.kind !== "choice" && <p className="gs-activity__muted">Your answer: {mine}</p>}
          {view.phase === "locked" && <p>Time&apos;s up! {view.answered} answer{view.answered === 1 ? "" : "s"} in. The answer is coming up.</p>}
          {view.answer && (
            <p className="gs-activity__trivia-reveal">
              The answer: <b>{view.answer}</b>. {view.gotIt ?? 0} of {view.answered} got it.
              {view.you?.verdict ? (view.you.verdict === "correct" ? " You got it!" : view.you.verdict === "partial" ? " Half points for you." : " Not this time.") : ""}
            </p>
          )}
        </>
      ) : (
        <p className="gs-activity__muted">{view.phase === "standings" ? "Standings so far." : "Next question coming up. Answer here or in the stream's chat."}</p>
      )}
      {view.standings.length > 0 && (
        <ol className="gs-activity__trivia-standings">
          {view.standings.slice(0, 5).map((s, i) => <li key={`${s.name}-${i}`}><span>{s.name}</span><b>{s.score}</b></li>)}
        </ol>
      )}
      {view.you && view.you.score > 0 && <p className="gs-activity__muted">You: {view.you.score} point{view.you.score === 1 ? "" : "s"}{view.you.rank ? `, #${view.you.rank}` : ""}</p>}
    </Card>
  );
}

type Step = { q: PracticeQuestion; result: PracticeResult | null; given: string | null };

function Practice() {
  const { api } = useOriginalsHost();
  const [round, setRound] = useState<Step[] | null>(null);
  const [at, setAt] = useState(0);
  const [seen, setSeen] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setBusy(true); setError(null);
    const j = await api(`/api/activity/trivia?practice=1&skip=${seen.join(",")}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    const qs = (j?.questions ?? []) as PracticeQuestion[];
    if (!qs.length) { setError("No practice questions right now. Try again later."); return; }
    setRound(qs.map((q) => ({ q, result: null, given: null })));
    setSeen((s) => [...s, ...qs.map((q) => q.id)].slice(-60));
    setAt(0); setTyped("");
  }, [api, seen]);

  const answer = async (text: string) => {
    if (!round || !text.trim()) return;
    setBusy(true);
    const step = round[at];
    const j = await api("/api/activity/trivia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ practice: step.q.id, text }) })
      .then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (!j?.ok) { setError("Couldn't check that. Try again."); return; }
    setRound(round.map((s, i) => (i === at ? { ...s, result: { verdict: j.verdict, answer: j.answer }, given: text.trim() } : s)));
  };

  if (!round) {
    return (
      <Card variant="outlined" padding="medium" className="gs-activity__trivia-card">
        <span className="gs-activity__trivia-glyph" aria-hidden><IconBulb size={28} stroke={1.75} /></span>
        <h2 className="gs-activity__trivia-title">Practice round</h2>
        <p className="gs-activity__muted">No trivia night is on in this server right now. Warm up with five questions from the GameShuffle pack: just for fun, nothing&apos;s scored.</p>
        <p className="gs-activity__muted">When the server&apos;s streamer runs trivia on stream, you can play along right here.</p>
        {error && <Alert variant="warning">{error}</Alert>}
        <Button variant="primary" onClick={() => void start()} loading={busy} disabled={busy}>Start a practice round</Button>
      </Card>
    );
  }

  const right = round.filter((s) => s.result?.verdict === "correct").length;
  if (at >= round.length) {
    return (
      <Card variant="outlined" padding="medium" className="gs-activity__trivia-card">
        <h2 className="gs-activity__trivia-title">You got {right} of {round.length}</h2>
        <ol className="gs-activity__trivia-recap">
          {round.map((s) => (
            <li key={s.q.id} className={`is-${s.result?.verdict ?? "wrong"}`}>
              {s.result?.verdict === "correct" ? <IconCheck size={16} aria-label="Right" /> : <IconX size={16} aria-label="Not quite" />}
              <span>{s.q.prompt} <b>{s.result?.answer}</b></span>
            </li>
          ))}
        </ol>
        <Button variant="primary" onClick={() => void start()} loading={busy} disabled={busy}>Play another round</Button>
      </Card>
    );
  }

  const step = round[at];
  const q = step.q;
  return (
    <Card variant="outlined" padding="medium" className="gs-activity__trivia-card">
      <div className="gs-activity__trivia-head">
        <Badge variant="default" size="small">Practice</Badge>
        <span className="gs-activity__muted">Question {at + 1} of {round.length} · {q.category}</span>
      </div>
      <p className="gs-activity__trivia-prompt">{q.prompt}</p>
      {q.kind === "choice" && q.options?.length ? (
        <div className="gs-activity__trivia-choices" role="group" aria-label="Answers">
          {q.options.map((o, i) => {
            const letter = LETTERS[i];
            const picked = step.given === letter;
            const isAnswer = !!step.result && step.result.answer.toLowerCase() === o.toLowerCase();
            return (
              <Button key={letter} variant={picked || isAnswer ? "primary" : "secondary"} disabled={busy || !!step.result} aria-pressed={picked} onClick={() => void answer(letter)}>
                {letter}. {o}
              </Button>
            );
          })}
        </div>
      ) : !step.result ? (
        <form className="gs-activity__trivia-form" onSubmit={(e) => { e.preventDefault(); void answer(typed); }}>
          <Input id="activity-trivia-practice" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={q.kind === "number" ? "A number" : "Your answer"} aria-label="Your answer"
            inputMode={q.kind === "number" ? "numeric" : "text"} maxLength={120} autoComplete="off" fullWidth />
          <Button type="submit" variant="primary" disabled={busy || !typed.trim()}>Check</Button>
        </form>
      ) : null}
      {error && <Alert variant="warning">{error}</Alert>}
      {step.result && (
        <>
          <p className={`gs-activity__trivia-verdict is-${step.result.verdict}`} role="status">
            {step.result.verdict === "correct" ? "Right!" : step.result.verdict === "close" ? "Close." : "Not quite."} The answer: <b>{step.result.answer}</b>
          </p>
          <Button variant="primary" onClick={() => { setAt(at + 1); setTyped(""); setError(null); }}>{at + 1 < round.length ? "Next question" : "See how you did"}</Button>
        </>
      )}
    </Card>
  );
}
