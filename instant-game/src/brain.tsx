/**
 * Chat Brain Daily (Britton's picks, 2026-10-18,
 * https://claude.ai/artifact/P1nLRnQraMgvSavH3c4Jgk): answer today's question,
 * then name the top answers on today's board, then share a card into a chat or
 * the feed. Talks to /api/instant/brain on gameshuffle.co.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Input, Progress } from "@empac/cascadeds";
import { bumpStreak, type DayRecord, type Found, type SaveData } from "./host";
import { loadView, revealBoard, sendAnswer, sendGuess, type View } from "./api";
import { drawShareCard } from "./card";

const MAX_STRIKES = 3;

function Strikes({ n }: { n: number }) {
  return (
    <span className="ig-strikes" aria-label={`${n} of ${MAX_STRIKES} misses`}>
      {Array.from({ length: MAX_STRIKES }, (_, i) => <span key={i} className={i < n ? "ig-strike ig-strike--on" : "ig-strike"} aria-hidden="true">✕</span>)}
    </span>
  );
}

export function BrainGame({ save, setSave, onShare }: {
  save: SaveData;
  setSave: (fn: (s: SaveData) => SaveData) => void;
  onShare: (image: string, text: string) => Promise<void>;
}) {
  const [view, setView] = useState<View | null>(null);
  const [failed, setFailed] = useState(false);
  const [answer, setAnswer] = useState("");
  const [guess, setGuess] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; tone: "ok" | "bad" | "plain" } | null>(null);
  const [sharing, setSharing] = useState(false);
  const guessRef = useRef<HTMLInputElement>(null);

  const anon = save.anon;
  const load = useCallback(async () => {
    setFailed(false);
    try {
      setView(await loadView(anon));
    } catch {
      setFailed(true);
    }
  }, [anon]);

  useEffect(() => { void load(); }, [load]);

  const day = view?.day ?? "";
  const today: DayRecord = (day && save.days[day]) || {};

  /** Saves today's record (and the streak) to Facebook's storage. */
  const update = useCallback((patch: DayRecord, played = true) => {
    if (!day) return;
    setSave((prev) => {
      const next: SaveData = { ...prev, days: { ...prev.days, [day]: { ...prev.days[day], ...patch } } };
      return played ? bumpStreak(next, day) : next;
    });
  }, [day, setSave]);

  const submitAnswer = async (e: FormEvent) => {
    e.preventDefault();
    if (!view?.question || !answer.trim()) return;
    setBusy(true); setNote(null);
    try {
      const res = await sendAnswer(view.question.id, answer.trim(), save.anon);
      update({ answer: answer.trim(), line: res.line });
    } catch (err) {
      setNote({ text: err instanceof Error && err.message !== "failed" ? err.message : "That didn't save. Try again.", tone: "bad" });
    } finally { setBusy(false); }
  };

  const board = view?.board ?? null;
  const played = board && today.board?.id === board.id ? today.board : null;
  const found: Found[] = played?.found ?? [];
  const strikes = played?.strikes ?? 0;
  const done = played?.done ?? false;

  const finish = async (foundNow: Found[], strikesNow: number) => {
    if (!board) return;
    const reveal = await revealBoard(board.id).then((r) => r.answers).catch(() => undefined);
    update({ board: { id: board.id, found: foundNow, strikes: strikesNow, done: true, reveal } });
  };

  const submitGuess = async (e: FormEvent) => {
    e.preventDefault();
    if (!board || done || !guess.trim()) return;
    setBusy(true);
    try {
      const res = await sendGuess(board.id, guess.trim(), found.map((f) => f.rank));
      setGuess("");
      if (res.result === "hit") {
        const next = [...found, { rank: res.rank, label: res.label, points: res.points }];
        setNote({ text: `${res.label}! +${res.points}`, tone: "ok" });
        update({ board: { id: board.id, found: next, strikes, done: false } });
        if (next.length === board.slots.length) await finish(next, strikes);
      } else if (res.result === "found") {
        setNote({ text: "That one's already on the board.", tone: "plain" });
      } else if (res.result === "miss") {
        const s = strikes + 1;
        setNote({ text: s >= MAX_STRIKES ? "Not on the board. That's three: here's the whole board." : "Not on the board.", tone: "bad" });
        update({ board: { id: board.id, found, strikes: s, done: false } });
        if (s >= MAX_STRIKES) await finish(found, s);
      } else {
        setNote({ text: "Today's board changed. Pull down to refresh.", tone: "plain" });
      }
    } catch {
      setNote({ text: "Couldn't check that. Try again.", tone: "bad" });
    } finally {
      setBusy(false);
      guessRef.current?.focus();
    }
  };

  const points = found.reduce((t, f) => t + f.points, 0);

  const share = async () => {
    if (!view) return;
    setSharing(true);
    try {
      const streak = save.streak.count;
      const card = board && done
        ? { question: board.question, headline: `Found ${found.length} of ${board.slots.length}`, detail: `${points} points on today's board` }
        : { question: view.question?.text ?? "Today's Chat Brain question", headline: "I answered today's question", detail: today.line ?? "What would you say?" };
      const image = await drawShareCard({ ...card, streak });
      const text = board && done
        ? `I found ${found.length} of ${board.slots.length} on today's Chat Brain board. Can you beat ${points}?`
        : "I answered today's Chat Brain question. What would you say?";
      await onShare(image, text);
    } catch {
      /* closing the share sheet isn't an error */
    } finally { setSharing(false); }
  };

  if (failed) {
    return (
      <section className="ig-card ig-center">
        <p>Couldn&apos;t reach GameShuffle. Check your connection and try again.</p>
        <Button variant="primary" onClick={() => void load()}>Try again</Button>
      </section>
    );
  }
  if (!view) {
    return <section className="ig-card ig-center"><p>Loading today&apos;s question…</p></section>;
  }

  const q = view.question;
  const answered = !!today.answer || !!q?.answered;
  const slots = board ? board.slots.map((s) => {
    const hit = (done ? played?.reveal ?? found : found).find((f) => f.rank === s.rank);
    return { ...s, label: hit?.label ?? null, mine: found.some((f) => f.rank === s.rank) };
  }) : [];

  return (
    <div className="ig-tab">
      <section className="ig-card" aria-labelledby="ig-q">
        <div className="ig-band"><span className="ig-kicker">Today&apos;s question</span><h1 id="ig-q" className="ig-question">{q ? q.text : "No question today. Check back tomorrow."}</h1></div>
        {q && !answered && (
          <form className="ig-form" onSubmit={(e) => void submitAnswer(e)}>
            <Input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer" aria-label="Your answer" maxLength={40} autoComplete="off" />
            <Button type="submit" variant="primary" fullWidth disabled={busy || !answer.trim()}>{busy ? "Saving…" : "Lock it in"}</Button>
            <p className="ig-fine">Your answer is anonymous. It joins everyone else&apos;s to build future boards.</p>
          </form>
        )}
        {q && answered && (
          <div className="ig-answered">
            {today.answer ? <p>You said <strong>&ldquo;{today.answer}&rdquo;</strong>.</p> : <p>You&apos;ve answered today&apos;s question.</p>}
            {today.line && <p className="ig-line">{today.line}</p>}
          </div>
        )}
      </section>

      {board ? (
        <section className="ig-card" aria-labelledby="ig-board">
          <div className="ig-board-head">
            <div><span className="ig-kicker ig-kicker--dark">Today&apos;s board</span><h2 id="ig-board" className="ig-board-q">{board.question}</h2></div>
            <Strikes n={strikes} />
          </div>
          <ol className="ig-slots">
            {slots.map((s) => (
              <li key={s.rank} className={`ig-slot${s.label ? (s.mine ? " ig-slot--mine" : " ig-slot--shown") : ""}`}>
                <span className="ig-slot__rank">{s.rank}</span>
                <span className="ig-slot__label">{s.label ?? <span className="sr-only">Hidden answer</span>}</span>
                <span className="ig-slot__pts">{s.points}</span>
              </li>
            ))}
          </ol>
          {!done ? (
            <form className="ig-form" onSubmit={(e) => void submitGuess(e)}>
              <Input ref={guessRef} value={guess} onChange={(e) => setGuess(e.target.value)} placeholder="Name a top answer" aria-label="Name a top answer" maxLength={40} autoComplete="off" />
              <Button type="submit" variant="primary" fullWidth disabled={busy || !guess.trim()}>Guess</Button>
            </form>
          ) : (
            <div className="ig-result">
              <p className="ig-score">Found {found.length} of {board.slots.length} · {points} points</p>
              <p className="ig-fine">A new board tomorrow.</p>
            </div>
          )}
          {note && <p className={`ig-note ig-note--${note.tone}`} role="status">{note.text}</p>}
        </section>
      ) : (
        <section className="ig-card" aria-labelledby="ig-soon">
          <span className="ig-kicker ig-kicker--dark">Today&apos;s board</span>
          <h2 id="ig-soon" className="ig-board-q">Boards are on the way</h2>
          <p>Every answer helps build them. When enough people answer a question, its top answers become a board to play here.</p>
          {view.progress && <Progress value={view.progress.boards} max={view.progress.goal} label={`${view.progress.boards} of ${view.progress.goal} boards ready`} showLabel />}
          {note && <p className={`ig-note ig-note--${note.tone}`} role="status">{note.text}</p>}
        </section>
      )}

      {(answered || done) && (
        <div className="ig-share">
          <Button variant="secondary" fullWidth onClick={() => void share()} disabled={sharing}>{sharing ? "Getting it ready…" : "Share with friends"}</Button>
        </div>
      )}
    </div>
  );
}
