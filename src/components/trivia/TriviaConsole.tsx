"use client";

/**
 * The host's console while the room is open (works from a phone, so the host
 * can walk the room). One big next step per phase: show the question, lock
 * answers, rule on the close ones (grouped, one tap per group), reveal, show
 * standings, next. The answer is always visible here, never on phones or the TV.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import type { HostView } from "@/lib/trivia/store";
import type { ConsoleLeague } from "@/lib/trivia/leagues";
import { STYLE_LABEL } from "@/lib/trivia/rules";

const POLL_MS = 2000;
const secsUntil = (iso: string | null, now: number) => (iso ? Math.max(0, Math.ceil((Date.parse(iso) - now) / 1000)) : 0);

const VERDICT_LABEL: Record<string, string> = { correct: "Right", wrong: "Wrong", partial: "Half", pending: "Needs you", mixed: "Mixed" };

export function TriviaConsole({ gameId }: { gameId: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [view, setView] = useState<HostView | null>(null);
  const [league, setLeague] = useState<ConsoleLeague | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const d = await fetch(`/api/trivia/games/${gameId}/live`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (d?.ok) { setView(d.view as HostView); setLeague((d.league as ConsoleLeague | null) ?? null); }
  }, [gameId]);
  useEffect(() => {
    void Promise.resolve().then(load);
    const iv = window.setInterval(() => void load(), POLL_MS);
    const clock = window.setInterval(() => setNow(Date.now()), 500);
    return () => { window.clearInterval(iv); window.clearInterval(clock); };
  }, [load]);

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    const d = await fetch(`/api/trivia/games/${gameId}/live`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok && d.view) { setView(d.view as HostView); setLeague((d.league as ConsoleLeague | null) ?? null); }
    else if (!d?.ok) toast.error(d?.error === "not_now" ? "That already happened. Refreshing." : "That didn't work.");
    if (!d?.ok) void load();
  };

  const undoLeague = async () => {
    if (!league) return;
    if (!(await confirm({ title: "Take tonight's league points out?", body: "Tonight's places stop counting in the standings, and the night no longer counts as a week played. The night's own scores stay.", confirmLabel: "Undo league points" }))) return;
    const d = await fetch(`/api/trivia/leagues/${league.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "undo_night", gameId }) }).then((r) => r.json()).catch(() => null);
    if (d?.ok) { toast.success("League points taken out."); void load(); }
    else toast.error("Couldn't undo that. Try again.");
  };

  const copyLeague = async () => {
    if (!league) return;
    const lines = [`${league.title} · Week ${league.week} results`, ...league.rows.map((r) => `${r.place}. ${r.name} · ${r.score} (+${r.points})`), `${window.location.origin}/trivia/leagues/${league.slug}`];
    try { await navigator.clipboard.writeText(lines.join("\n")); toast.success("Copied. Paste it in Discord."); } catch { toast.error("Couldn't copy."); }
  };

  const end = async () => {
    if (!(await confirm({ title: "End the night now?", body: "Scores so far are final, and every phone and the TV show the results.", confirmLabel: "End the night" }))) return;
    await act("end");
  };

  if (!view) return <div className="trivia-card"><LoadingLines label="Loading" /></div>;

  const r = view.round;
  const left = secsUntil(view.closesAt, now);
  const undecided = view.groups.filter((g) => g.verdict === "pending").reduce((n, g) => n + g.teamIds.length, 0);
  // Half points round down, so "Half" only shows where it can award something.
  const canHalf = !!r && (r.style === "confidence" || ((r.style === "classic" || r.style === "picture") && r.points >= 2));

  let next: { label: string; action: string } | null = null;
  if (view.status === "live") {
    if (view.phase === "lobby") next = { label: `Show ${r ? `question ${view.questionIndex + 1}` : "the question"}`, action: "open" };
    else if (view.phase === "question") next = { label: "Lock answers now", action: "lock" };
    else if (view.phase === "locked") next = { label: "Reveal the answer", action: "reveal" };
    else if (view.phase === "reveal" || view.phase === "standings") next = { label: view.isLast ? "Finish the night" : "Next question", action: "next" };
  }

  return (
    <div className="trivia-console">
      <div className="trivia-card trivia-console__head">
        <div>
          <p className="trivia-muted">
            {view.status === "done" ? "Finished" : "Live"} · code <strong>{view.code}</strong> · {view.teamCount} {view.onStream ? "player" : "team"}{view.teamCount === 1 ? "" : "s"}
            {view.onStream ? " · on your stream: chat answers with !a, viewers on your live page too" : ""}
          </p>
          <h1 className="trivia-h2">{view.title}</h1>
        </div>
        <div className="trivia-row">
          <a href={`/trivia/tv/${view.code}`} target="_blank" rel="noreferrer"><Button variant="secondary" size="small">Open the TV view</Button></a>
          {view.status === "live" && <Button variant="ghost" size="small" disabled={busy} onClick={() => void end()}>End the night</Button>}
        </div>
      </div>

      {view.status === "done" ? (
        <div className="trivia-card">
          <h2 className="trivia-h3">Final standings</h2>
          <Standings rows={view.standings} />
          {league && (
            <div className="trivia-league-final">
              <div className="trivia-row trivia-league-final__head">
                <h3 className="trivia-h3">{league.title} · Week {league.week} of {league.weeks}</h3>
                <Badge variant={league.recorded ? "success" : "default"} size="small">{league.recorded ? "Added to the league" : "No league points"}</Badge>
              </div>
              {league.rows.length > 0 ? (
                <div className="trivia-league-final__scroll" tabIndex={0} role="region" aria-label="League points tonight">
                  <table className="trivia-league-final__table">
                    <thead><tr><th scope="col">Place</th><th scope="col">Team</th><th scope="col">Score</th><th scope="col">League points</th><th scope="col">League</th></tr></thead>
                    <tbody>
                      {league.rows.map((r) => (
                        <tr key={r.name}>
                          <td>{r.place}</td>
                          <td>{r.name}</td>
                          <td>{r.score}</td>
                          <td>+{r.points}</td>
                          <td>{r.rank === null ? "" : r.previousRank === null || r.previousRank === r.rank ? `${r.rank}${r.previousRank === null ? " (new)" : ""}` : `${r.previousRank} → ${r.rank} ${r.rank < r.previousRank ? "▲" : "▼"}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="trivia-muted">No league teams played tonight, so the standings didn&apos;t change.</p>}
              {league.tonightOnly.length > 0 && <p className="trivia-muted">Played just tonight (not in the league): {league.tonightOnly.join(", ")}.</p>}
              <div className="trivia-row">
                <Link href={`/trivia/leagues/${league.slug}`}><Button variant="secondary" size="small">League page</Button></Link>
                <Button variant="secondary" size="small" onClick={() => void copyLeague()}>Copy results for Discord</Button>
                {league.recorded && <Button variant="ghost" size="small" onClick={() => void undoLeague()}>Undo league points</Button>}
              </div>
            </div>
          )}
          <Link href={league ? `/trivia/leagues/${league.slug}/manage` : "/trivia"}><Button variant="secondary">{league ? "Back to the league" : "Back to Trivia"}</Button></Link>
        </div>
      ) : (
        <div className="trivia-console__cols">
          <div className="trivia-card trivia-console__stage">
            {r && <p className="trivia-muted">Round {r.index + 1} of {r.count}: {r.title} ({STYLE_LABEL[r.style]}) · question {view.questionIndex + 1} of {r.questionCount}</p>}
            {view.current && (
              <>
                <p className="trivia-console__q">{view.current.prompt}</p>
                {view.current.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- a host-supplied picture-round image
                  <img className="trivia-pic" src={view.current.imageUrl} alt="The picture for this question" />
                )}
                <p className="trivia-console__a">Answer: <strong>{view.current.answer}</strong>{view.current.accept.length ? <span className="trivia-muted"> · also {view.current.accept.join(", ")}</span> : null}</p>
              </>
            )}
            {view.phase === "lobby" && <p className="trivia-muted">{view.onStream ? "Open the question when you're ready: it goes to your chat and your overlay's Trivia piece." : view.teamCount === 0 ? `Waiting for teams. They join at gameshuffle.co/trivia with code ${view.code}.` : "Ready when you are."}</p>}
            {view.phase === "question" && <p className="trivia-console__clock">{left}s · {view.answeredCount}{view.onStream ? "" : ` of ${view.teamCount} teams`} answered</p>}
            {view.phase === "question" && view.onStream && <p className="trivia-muted">Answers keep counting 5 seconds after the clock, for stream delay.</p>}
            {view.phase === "standings" && <p className="trivia-muted">The TV is showing the standings.</p>}

            {(view.phase === "locked" || view.phase === "reveal") && (
              <div className="trivia-groups">
                <p className="trivia-muted">{view.groups.length === 0 ? "No answers came in." : view.phase === "locked" ? (undecided ? `${undecided} answer${undecided === 1 ? "" : "s"} need${undecided === 1 ? "s" : ""} you. Anything you leave counts as wrong.` : "Everything's judged. Reveal when ready.") : "Change a ruling here and the scores update."}</p>
                {view.groups.map((g) => (
                  <div key={g.key} className={`trivia-group is-${g.verdict}`}>
                    <div className="trivia-group__text">
                      <strong>{g.label}</strong>
                      <span className="trivia-muted">{g.teams.join(", ")}</span>
                    </div>
                    <Badge variant={g.verdict === "correct" ? "success" : g.verdict === "wrong" ? "default" : g.verdict === "partial" ? "info" : "warning"} size="small">{VERDICT_LABEL[g.verdict]}</Badge>
                    <div className="trivia-group__btns">
                      <Button variant={g.verdict === "correct" ? "primary" : "secondary"} size="small" disabled={busy} onClick={() => void act("judge", { teamIds: g.teamIds, verdict: "correct" })}>Right</Button>
                      {canHalf && <Button variant={g.verdict === "partial" ? "primary" : "secondary"} size="small" disabled={busy} onClick={() => void act("judge", { teamIds: g.teamIds, verdict: "partial" })}>Half</Button>}
                      <Button variant={g.verdict === "wrong" ? "primary" : "secondary"} size="small" disabled={busy} onClick={() => void act("judge", { teamIds: g.teamIds, verdict: "wrong" })}>Wrong</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="trivia-row trivia-console__next">
              {next && <Button variant="primary" disabled={busy} onClick={() => void act(next.action)}>{next.label}</Button>}
              {view.phase === "reveal" && <Button variant="secondary" disabled={busy} onClick={() => void act("standings")}>Show standings on the TV</Button>}
            </div>
          </div>

          <div className="trivia-card">
            <h2 className="trivia-h3">Standings</h2>
            <Standings rows={view.standings} />
            {/* On stream every viewer is a team, so the who-answered list is left to the count above. */}
            {view.phase === "question" && !view.onStream && (
              <ul className="trivia-teamlist">
                {view.teams.map((t) => {
                  const away = view.away.find((a) => a.name === t.name)?.times ?? 0;
                  return <li key={t.name} className={t.answered ? "is-in" : ""}>{t.answered ? "✓ " : ""}{t.name}{away ? <span className="trivia-away"> · left the page {away}×</span> : null}</li>;
                })}
              </ul>
            )}
            {(view.phase === "locked" || view.phase === "reveal") && view.away.length > 0 && (
              <p className="trivia-muted trivia-away-note">Left the page during this question: {view.away.map((a) => `${a.name} (${a.times}×)`).join(", ")}. A nudge for you, never a penalty.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Places with ties shared (two teams on 12 are both 2nd). */
function places(rows: { score: number }[]): number[] {
  return rows.map((t, i) => (i > 0 && rows[i - 1].score === t.score ? -1 : i + 1)).reduce<number[]>((acc, p, i) => [...acc, p === -1 ? acc[i - 1] : p], []);
}

export function Standings({ rows }: { rows: { name: string; score: number; isYou?: boolean }[] }) {
  if (rows.length === 0) return <p className="trivia-muted">No teams yet.</p>;
  const place = places(rows);
  return (
    <ol className="trivia-standings">
      {rows.map((t, i) => (
        <li key={t.name} className={t.isYou ? "is-you" : ""}>
          <span className="trivia-standings__place">{place[i]}</span>
          <span className="trivia-standings__name">{t.name}{t.isYou ? " (you)" : ""}</span>
          <span className="trivia-standings__score">{t.score}</span>
        </li>
      ))}
    </ol>
  );
}
