"use client";

/**
 * A team's phone: join with a team name (no account), then answer each
 * question before the timer runs out. Teammates join the same team from a
 * link the first phone shares. The team's key lives in this browser.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Input } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, track } from "@/lib/analytics/events";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { Standings } from "./TriviaConsole";
import type { TeamView } from "@/lib/trivia/store";
import "@/styles/trivia.css";

const POLL_MS = 2500;
const storeKey = (code: string) => `gs-trivia-team:${code}`;
type Saved = { teamId: string; key: string; name: string };

function readSaved(code: string): Saved | null {
  try {
    const raw = window.localStorage.getItem(storeKey(code));
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}
function writeSaved(code: string, s: Saved | null) {
  try {
    if (s) window.localStorage.setItem(storeKey(code), JSON.stringify(s));
    else window.localStorage.removeItem(storeKey(code));
  } catch { /* private mode: the team lasts this tab */ }
}

const ERRORS: Record<string, string> = {
  not_found: "No game with that code. Check it with the host.",
  finished: "That game has finished.",
  full: "This game is full.",
  name_taken: "Another team has that name. Pick another.",
  bad_name: "Team names need at least 2 characters.",
  blocked: "That name can't be used.",
  closed: "Time's up for this question.",
  bad_confidence: "Pick a number you haven't used this round.",
  bad_wager: "That bet is more than you can stake.",
  joker_used: "Your team already played its joker.",
  round_started: "This round has started: the joker goes on a round before it begins.",
};

export function TriviaPhone({ code }: { code: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [team, setTeam] = useState<Saved | null>(null);
  const [checked, setChecked] = useState(false);
  const [name, setName] = useState("");
  const [view, setView] = useState<TeamView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [wager, setWager] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // A teammate's link (?team=&key=) joins this phone to the team; then it's tidied out of the URL.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const teamId = p.get("team");
    const key = p.get("key");
    if (teamId && key) {
      const s = { teamId, key, name: "" };
      writeSaved(code, s);
      window.history.replaceState(null, "", window.location.pathname);
    }
    // localStorage is only there in the browser, so this reads it after the first paint.
    void Promise.resolve().then(() => { setTeam(readSaved(code)); setChecked(true); });
  }, [code]);

  const load = useCallback(async () => {
    if (!team) {
      const d = await fetch(`/api/trivia/room/${code}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      setProblem(d?.ok ? null : d?.error ?? "offline");
      return;
    }
    const d = await fetch(`/api/trivia/room/${code}?team=${encodeURIComponent(team.teamId)}&key=${encodeURIComponent(team.key)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (d?.ok) { setView(d.view as TeamView); setProblem(null); }
    else if (d?.error === "not_on_team") { writeSaved(code, null); setTeam(null); setView(null); }
    else setProblem(d?.error ?? "offline");
  }, [code, team]);
  useEffect(() => {
    if (!checked) return;
    void Promise.resolve().then(load);
    const iv = window.setInterval(() => void load(), POLL_MS);
    const clock = window.setInterval(() => setNow(Date.now()), 500);
    return () => { window.clearInterval(iv); window.clearInterval(clock); };
  }, [checked, load]);

  // A new question clears the answer box.
  const qKey = view ? `${view.round?.index}:${view.questionIndex}` : "";
  const [lastQ, setLastQ] = useState("");
  if (qKey && qKey !== lastQ) {
    setLastQ(qKey);
    setAnswer(view?.myAnswer?.raw ?? "");
    setConfidence(view?.myAnswer?.confidence ?? null);
    setWager(view?.myAnswer?.wager != null ? String(view.myAnswer.wager) : "");
  }

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const d = await fetch(`/api/trivia/room/${code}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "join", name }) }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (!d?.ok) { toast.error(ERRORS[d?.error] ?? "Couldn't join. Try again."); return; }
    const s = { teamId: d.teamId as string, key: d.key as string, name: d.name as string };
    writeSaved(code, s);
    setTeam(s);
    track(EVENTS.triviaTeamJoined);
  };

  const send = async (action: "answer" | "joker", extra: Record<string, unknown>) => {
    if (!team) return;
    setBusy(true);
    const d = await fetch(`/api/trivia/room/${code}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, team: team.teamId, key: team.key, ...extra }) }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) { toast.success(action === "answer" ? "Locked in. You can change it until time's up." : "Joker played on this round."); void load(); }
    else toast.error(ERRORS[d?.error] ?? "That didn't go through. Try again.");
  };

  const shareTeam = async () => {
    if (!team) return;
    const url = `${window.location.origin}/trivia/play/${code}?team=${encodeURIComponent(team.teamId)}&key=${encodeURIComponent(team.key)}`;
    try {
      if (navigator.share) await navigator.share({ title: "Join our trivia team", url });
      else { await navigator.clipboard.writeText(url); toast.success("Link copied. Send it to your teammates."); }
    } catch { /* cancelled */ }
  };

  if (!checked) return <main className="trivia-phone"><LoadingLines label="Loading" /></main>;

  if (!team) {
    return (
      <main className="trivia-phone">
        <div className="trivia-phone__bar"><span>Trivia · {code}</span><h1 className="trivia-phone__title">Join a team</h1></div>
        <div className="trivia-phone__body">
          {problem === "not_found" ? (
            <div className="trivia-card"><p>{ERRORS.not_found}</p><Link href="/trivia"><Button variant="secondary">Enter another code</Button></Link></div>
          ) : (
            <form className="trivia-card trivia-form" onSubmit={join}>
              <Input fullWidth floatingLabel="Team name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoComplete="off" />
              <p className="trivia-muted">One phone per team is enough. Teammates can join from a link once you&apos;re in.</p>
              <Button type="submit" variant="primary" disabled={busy || name.trim().length < 2}>Join</Button>
            </form>
          )}
        </div>
      </main>
    );
  }

  if (!view) return <main className="trivia-phone"><div className="trivia-phone__body"><LoadingLines label={problem ? "Reconnecting" : "Loading"} /></div></main>;

  const r = view.round;
  const left = view.closesAt ? Math.max(0, Math.ceil((Date.parse(view.closesAt) - now) / 1000)) : 0;
  const total = Math.max(1, r?.seconds ?? 45);
  const canJoker = !!r && r.jokerAllowed && view.team.jokerRound === null && view.phase === "lobby" && view.questionIndex === 0;
  const mine = view.myAnswer;

  return (
    <main className="trivia-phone">
      <div className="trivia-phone__bar">
        <span>{r ? `Round ${r.index + 1}: ${r.title}${view.phase !== "lobby" && view.phase !== "standings" && view.phase !== "done" ? ` · Q${view.questionIndex + 1} of ${r.questionCount}` : ""}` : view.title}</span>
        <h1 className="trivia-phone__title">{view.team.name} · {view.team.score} pt{view.team.score === 1 ? "" : "s"}</h1>
      </div>
      <div className="trivia-phone__body">
        {view.phase === "lobby" && (
          <div className="trivia-card">
            <p className="trivia-phone__big">{r ? (view.questionIndex === 0 ? `${r.title} is up next` : `Question ${view.questionIndex + 1} is up next`) : "Waiting for the host"}</p>
            {view.team.jokerRound === r?.index && <p className="trivia-muted">Your joker is on this round: points count double.</p>}
            {canJoker && (
              <Button variant="secondary" disabled={busy} onClick={async () => {
                if (await confirm({ title: "Play your joker here?", body: `Every point your team wins in ${r!.title} counts double. You get one joker a night.`, confirmLabel: "Play the joker" })) void send("joker", { round: r!.index });
              }}>Play our joker on this round</Button>
            )}
          </div>
        )}

        {view.phase === "question" && view.question && (
          <div className="trivia-card trivia-form">
            <div className="trivia-timer" aria-hidden="true"><i style={{ width: `${Math.min(100, (left / total) * 100)}%` }} /></div>
            <p className="trivia-phone__q">{view.question.prompt}</p>
            {view.question.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- a host-supplied picture-round image
              <img className="trivia-pic" src={view.question.imageUrl} alt="The picture for this question" />
            )}
            {view.question.kind === "choice" && view.question.options ? (
              <div className="trivia-choices">
                {view.question.options.map((o, i) => (
                  <Button key={o} variant={answer === o ? "primary" : "secondary"} onClick={() => setAnswer(o)}>{String.fromCharCode(65 + i)}. {o}</Button>
                ))}
              </div>
            ) : (
              <Input fullWidth floatingLabel={view.question.kind === "number" ? "Your answer (a number)" : "Your answer"} value={answer} maxLength={120}
                inputMode={view.question.kind === "number" ? "numeric" : "text"} autoComplete="off"
                onPaste={(e) => e.preventDefault()} onChange={(e) => setAnswer(e.target.value)} />
            )}
            {r?.style === "confidence" && (
              <div>
                <p className="trivia-label">How sure? Each number once this round</p>
                <div className="trivia-confidence">
                  {Array.from({ length: r.questionCount }, (_, i) => r.questionCount - i).map((n) => {
                    const free = view.confidenceLeft.includes(n);
                    return <Button key={n} variant={confidence === n ? "primary" : "secondary"} size="small" disabled={!free} onClick={() => setConfidence(n)}>{n}</Button>;
                  })}
                </div>
              </div>
            )}
            {r?.style === "final" && (
              <Input fullWidth floatingLabel={`Your bet (0 to ${view.wagerCap})`} value={wager} inputMode="numeric" onChange={(e) => setWager(e.target.value.replace(/\D/g, ""))} />
            )}
            <Button variant="primary" disabled={busy || !answer.trim() || (r?.style === "confidence" && confidence === null)}
              onClick={() => void send("answer", { raw: answer, confidence, wager: wager === "" ? 0 : Number(wager) })}>
              {mine ? "Change our answer" : "Lock in"}
            </Button>
            <p className="trivia-muted">{left}s left{mine ? ` · locked in: ${mine.raw}` : ""}. Pasting is off.</p>
          </div>
        )}

        {view.phase === "locked" && (
          <div className="trivia-card">
            <p className="trivia-phone__big">Time&apos;s up</p>
            <p className="trivia-muted">{mine ? `Your answer: ${mine.raw}` : "No answer from your team this time."} The host reveals it next.</p>
          </div>
        )}

        {view.phase === "reveal" && (
          <div className="trivia-card">
            <p className="trivia-label">The answer</p>
            <p className="trivia-phone__big">{view.answer}</p>
            {mine ? (
              <p className={`trivia-verdict is-${mine.verdict}`}>
                {mine.verdict === "correct" ? `Right! +${mine.points}` : mine.verdict === "partial" ? `Half right: +${mine.points}` : mine.points < 0 ? `Not this time: ${mine.points}` : "Not this time"}
                <span className="trivia-muted"> · you said {mine.raw}</span>
              </p>
            ) : <p className="trivia-muted">Your team didn&apos;t answer.</p>}
            {view.gotIt !== null && <p className="trivia-muted">{view.gotIt} of {view.teams.length} teams got it.</p>}
          </div>
        )}

        {(view.phase === "standings" || view.phase === "done") && (
          <div className="trivia-card">
            <p className="trivia-phone__big">{view.phase === "done" ? `${view.standings[0]?.name ?? "Nobody"} win${view.standings[0]?.isYou ? "! That's you" : "s"}` : "Standings"}</p>
            <Standings rows={view.standings} />
          </div>
        )}

        {view.phase !== "done" && <Button variant="ghost" size="small" onClick={() => void shareTeam()}>Add a teammate&apos;s phone</Button>}
      </div>
    </main>
  );
}
