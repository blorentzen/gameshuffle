"use client";

/**
 * "Running now" in the control room: one card for each thing happening on
 * stream (picks and bans, a poll, bingo, a draft, Chat Brain, a prediction,
 * bounties, chaos challenges to settle), each with its next step and a way into its tab. Nothing running
 * means no cards, just the ways to start one, and only the ones this game
 * can run (picks and bans and predictions are Mario Kart only).
 */

import { useState, type ReactNode } from "react";
import { Badge, Button } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { closePicksBansRoundAction } from "@/app/hub/sessions/[slug]/actions";
import { getGameName } from "@/data/game-registry";
import type { HubGameActions } from "@/lib/hub/gameActions";
import { useHubLive } from "./HubLiveProvider";
import { ChallengesModal } from "./ChallengesModal";

export function RunningNow({ sessionSlug, liveSlug, actions, predictions = true }: {
  sessionSlug: string;
  liveSlug: string | null;
  actions: HubGameActions | null;
  /** Off on a mod's page: predictions and bounties stay with the streamer. */
  predictions?: boolean;
}) {
  const { data, sessionId, refresh, goTab } = useHubLive();
  const [challengesOpen, setChallengesOpen] = useState(false);
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<boolean>, done: string) => {
    setBusy(key);
    const ok = await fn().catch(() => false);
    setBusy(null);
    if (ok) toast.success(done);
    else toast.error("That didn't go through. Try again.");
    refresh();
  };
  const patch = (url: string, body: Record<string, unknown>, method = "PATCH") => async () => {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return res.ok;
  };

  const raceGame = !!actions?.race;
  const marketsGame = predictions && !!actions?.markets;
  const cards: ReactNode[] = [];

  if (data?.picks && raceGame) {
    const p = data.picks;
    cards.push(
      <Card key="picks" title="Picks and bans" status={<Badge variant="success" size="small">Round open</Badge>}
        line={`${getGameName(p.game)} · ${p.ballots} ${p.ballots === 1 ? "ballot" : "ballots"}, ${p.locked} locked`}
        onOpen={() => goTab("picks")}>
        <Button size="small" variant="secondary" disabled={busy !== null}
          onClick={() => void run("picks", async () => (await closePicksBansRoundAction(sessionSlug, p.id)).ok, "Round closed")}>
          Close the round
        </Button>
      </Card>,
    );
  }
  if (data?.poll) {
    const p = data.poll;
    cards.push(
      <Card key="poll" title="Poll" status={<Badge variant="success" size="small">Open</Badge>}
        line={`${p.question} · ${p.votes} ${p.votes === 1 ? "vote" : "votes"}`} onOpen={() => goTab("live-games", "polls")}>
        <Button size="small" variant="secondary" disabled={busy !== null}
          onClick={() => void run("poll", patch(`/api/polls/${p.id}`, { action: "close" }), "Poll closed")}>Close the poll</Button>
      </Card>,
    );
  }
  if (data?.bingo) {
    const b = data.bingo;
    const line = b.status === "won" ? `Won by ${b.winner ?? "a viewer"}` : b.status === "closed" ? "Ended" : b.doors ? `The hall is open for cards · ${b.pattern}` : `${b.called} ${b.called === 1 ? "number" : "numbers"} called · ${b.pattern}`;
    cards.push(
      <Card key="bingo" title="Stream Bingo" status={<Badge variant={b.status === "open" ? "success" : "default"} size="small">{b.status === "open" ? (b.doors ? "Doors open" : "Playing") : b.status === "won" ? "Won" : "Ended"}</Badge>}
        line={line} onOpen={() => goTab("live-games", "bingo")}>
        {b.status === "open" && (b.doors ? (
          <Button size="small" variant="secondary" disabled={busy !== null}
            onClick={() => void run("bingo", patch(`/api/bingo/${b.id}`, { action: "doors" }), "Doors closed")}>Close the doors</Button>
        ) : (
          <Button size="small" variant="secondary" disabled={busy !== null}
            onClick={() => void run("bingo", patch(`/api/bingo/${b.id}`, { action: "call" }), "Number called")}>Call a number</Button>
        ))}
      </Card>,
    );
  }
  if (data?.draft) {
    const d = data.draft;
    cards.push(
      <Card key="draft" title="Chat Draft" status={<Badge variant="success" size="small">{d.status === "signup" ? "Sign-ups" : "Drafting"}</Badge>}
        line={d.status === "signup" ? `${d.title} · taking sign-ups` : `${d.title} · pick ${Math.min(d.picked + 1, d.slots)} of ${d.slots}`}
        onOpen={() => goTab("live-games", "draft")} />,
    );
  }
  if (data?.brain) {
    const g = data.brain;
    cards.push(
      <Card key="brain" title="Chat Brain" status={<Badge variant="success" size="small">Playing</Badge>}
        line={g.scores ? `Round ${g.board} of ${g.boards}: ${g.question} · ${g.scores}` : `Board ${g.board} of ${g.boards}: ${g.question} · ${g.strikes} ${g.strikes === 1 ? "strike" : "strikes"}, ${g.score} points`}
        onOpen={() => goTab("live-games", "chat-brain")} />,
    );
  }
  if (data?.breakMode) {
    const b = data.breakMode;
    const where = b.phase === "intro" ? `Up next: ${b.game ?? "a game"}` : b.phase === "standings" ? `Standings after ${b.game ?? "the game"}` : `${b.game ?? "Round"} · round ${b.round} of ${b.rounds}`;
    // You're on a break: this comes first.
    cards.unshift(
      <Card key="break" title="On a break" status={<Badge variant="success" size="small">{b.ending ? "Ending" : "Chat's playing"}</Badge>}
        line={`${where} · ${b.players} scored so far`} onOpen={() => goTab("live-games", "break")}>
        {!b.ending && (
          <Button size="small" variant="secondary" disabled={busy !== null}
            onClick={() => void run("break", patch("/api/break", { action: "end" }, "PATCH"), "Ending after this round")}>I&apos;m back</Button>
        )}
      </Card>,
    );
  }
  if (data?.market && marketsGame) {
    const m = data.market;
    cards.push(
      <Card key="market" title="Prediction" status={<Badge variant={m.status === "open" ? "success" : "warning"} size="small">{m.status === "open" ? "Taking bets" : "Locked"}</Badge>}
        line={m.question} onOpen={() => goTab("predictions")}>
        {m.status === "open" && liveSlug && (
          <Button size="small" variant="secondary" disabled={busy !== null}
            onClick={() => void run("market", patch(`/api/live/${encodeURIComponent(liveSlug)}/market/admin`, { action: "lock" }, "POST"), "Bets locked")}>Lock bets</Button>
        )}
        {m.status === "locked" && <Button size="small" variant="secondary" onClick={() => goTab("predictions")}>Settle it</Button>}
      </Card>,
    );
  }
  if (predictions && data && data.bounties.count > 0) {
    const b = data.bounties;
    cards.push(
      <Card key="bounties" title={b.count === 1 ? "Bounty" : `${b.count} bounties`} status={<Badge variant="info" size="small">Open</Badge>}
        line={b.first ? `${b.amount ? `${b.amount} tokens: ` : ""}${b.first}` : "Waiting for a winner"} onOpen={() => goTab("predictions")} />,
    );
  }

  if (data?.breakBounty) {
    const bb = data.breakBounty;
    cards.push(
      <Card key="break-bounty" title="Chat's bounty" status={<Badge variant="info" size="small">{bb.tokens} tokens</Badge>}
        line={`${bb.text} ${bb.voters} ${bb.voters === 1 ? "viewer" : "viewers"} split it if you pull it off.`} onOpen={() => goTab("live-games", "break")}>
        <Button size="small" variant="secondary" className="hub-lever__main" disabled={busy === "bounty"}
          onClick={() => void run("bounty", patch("/api/break", { action: "bounty_done" }), "Bounty paid to the voters")}>Did it</Button>
        <Button size="small" variant="ghost" disabled={busy === "bounty"}
          onClick={() => void run("bounty", patch("/api/break", { action: "bounty_missed" }), "Marked not done")}>Didn&apos;t</Button>
      </Card>,
    );
  }
  if (data && data.challenges.open + data.challenges.needsWinner > 0) {
    const c = data.challenges;
    const total = c.open + c.needsWinner;
    cards.push(
      <Card key="challenges" title={total === 1 ? "Challenge" : `${total} challenges`}
        status={<Badge variant={c.needsWinner ? "warning" : "info"} size="small">{c.needsWinner ? "Needs a winner" : "Waiting on you"}</Badge>}
        line={c.needsWinner ? `${c.needsWinner} done with nobody paid yet` : "Call it when chat pulls it off, or doesn't"} onOpen={() => setChallengesOpen(true)}>
        <Button size="small" variant="secondary" className="hub-lever__main" onClick={() => setChallengesOpen(true)}>Settle</Button>
      </Card>,
    );
  }

  // Ways to start something, only for what this game can run and isn't running.
  const starts: { key: string; label: string; onClick: () => void }[] = [];
  if (raceGame && !data?.picks) starts.push({ key: "picks", label: "Picks and bans", onClick: () => goTab("picks") });
  if (!data?.poll) starts.push({ key: "poll", label: "Poll", onClick: () => goTab("live-games", "polls") });
  if (!data?.bingo || data.bingo.status !== "open") starts.push({ key: "bingo", label: "Bingo", onClick: () => goTab("live-games", "bingo") });
  if (!data?.draft) starts.push({ key: "draft", label: "Chat Draft", onClick: () => goTab("live-games", "draft") });
  if (!data?.brain) starts.push({ key: "brain", label: "Chat Brain", onClick: () => goTab("live-games", "chat-brain") });
  if (!data?.breakMode) starts.push({ key: "break", label: "Break mode", onClick: () => goTab("live-games", "break") });
  if (marketsGame && !data?.market) starts.push({ key: "market", label: "Prediction", onClick: () => goTab("predictions") });
  if (predictions) starts.push({ key: "bounty", label: "Bounty", onClick: () => goTab("predictions") });

  return (
    <section className="hub-panel hub-running" aria-labelledby="hub-running-title">
      <div className="hub-panel__head">
        <h2 id="hub-running-title" className="hub-panel__title">
          Running now {cards.length > 0 && <span className="hub-page__group-count">{cards.length}</span>}
        </h2>
      </div>
      {!data ? (
        <p className="hub-panel__empty">Loading…</p>
      ) : cards.length > 0 ? (
        <div className="hub-running__grid">{cards}</div>
      ) : (
        <p className="hub-panel__empty">Nothing running right now.</p>
      )}
      <ChallengesModal sessionId={sessionId} isOpen={challengesOpen} onClose={() => setChallengesOpen(false)} onSettled={refresh} />
      <div className="hub-running__start" role="group" aria-label="Start something">
        <span className="hub-running__start-label">Start</span>
        {starts.map((st) => (
          <Button key={st.key} size="small" variant="ghost" onClick={st.onClick}>+ {st.label}</Button>
        ))}
      </div>
    </section>
  );
}

function Card({ title, status, line, onOpen, children }: {
  title: string;
  status: ReactNode;
  line: string;
  onOpen: () => void;
  children?: ReactNode;
}) {
  return (
    <article className="hub-running__card">
      <header className="hub-running__card-head">
        <h3 className="hub-running__card-title">{title}</h3>
        {status}
      </header>
      <p className="hub-running__card-line">{line}</p>
      {/* Same footer on every card: its next step on the left, Open on the right. */}
      <div className="hub-running__card-actions">
        {children}
        <Button size="small" variant="ghost" className="hub-running__open" onClick={onOpen} aria-label={`Open ${title}`}>Open</Button>
      </div>
    </article>
  );
}
