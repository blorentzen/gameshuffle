"use client";

/**
 * Team up in the Discord Activity's Together room: Boss Fight, Five Letters,
 * Four in a Row and Shuffle Dice with everyone in the call on one side
 * (src/lib/coop/rules.ts, run by src/lib/activity/room.ts). Each game lasts a
 * few rounds and ends as a win or a loss for the whole call; nobody is ranked
 * against anyone else.
 *
 *   CoopLobbyCard  the lobby's card (whoever runs the room picks the game)
 *   CoopPlay       a game in play, and the end screen once the set is over
 */

import { useState } from "react";
import { Avatar, Badge, Button, Card } from "@empac/cascadeds";
import { IconCheck, IconPlayerSkipForward, IconSwords } from "@tabler/icons-react";
import { Select } from "@/components/ui/Select";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { BreakRoundPlay } from "@/components/break/BreakRoundPlay";
import { GameInfoButton } from "@/components/activity/GameInfo";
import { COOP_GAMES, COOP_GAME_IDS, coopHeadline, type CoopResultKind } from "@/lib/coop/rules";
import { COOP_COUNTS, QUICKFIRE_SETS, ROOM_ERRORS, type CoopPick, type RoomView } from "@/lib/activity/roomRules";
import "@/styles/coop.css";

type Act = (body: Record<string, unknown>, quiet?: boolean) => Promise<boolean>;

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
const secsLeft = (iso: string | null, now: number) => (iso ? Math.max(0, Math.ceil((Date.parse(iso) - now) / 1000)) : 0);

export const RESULT_LABEL: Record<CoopResultKind, string> = { won: "Won", lost: "Lost", draw: "Draw" };
export const RESULT_BADGE: Record<CoopResultKind, "success" | "error" | "default"> = { won: "success", lost: "error", draw: "default" };

// ── Lobby ────────────────────────────────────────────────────────────────────

export function CoopLobbyCard({ view, act }: { view: RoomView; act: Act }) {
  const [pick, setPick] = useState<CoopPick>("mix");
  const [count, setCount] = useState(2);
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    await act({ action: "quickfire", set: "coop", focus: "any", rounds: count, game: pick });
    setBusy(false);
  };
  return (
    <Card variant="outlined" padding="medium" className="gs-room__game">
      <div className="gs-room__game-head">
        <h3 className="gs-room__game-title"><IconSwords size={18} aria-hidden /> {QUICKFIRE_SETS.coop.name}</h3>
        <GameInfoButton game="quickfire-coop" />
      </div>
      <p className="gs-room__game-blurb">{QUICKFIRE_SETS.coop.blurb} You win or lose together.</p>
      {view.isHost && (
        <div className="gs-room__form">
          <Select fullWidth floatingLabel="Game" value={pick} onChange={(v) => setPick(v as CoopPick)}
            options={[{ value: "mix", label: "A mix of all four" }, ...COOP_GAME_IDS.map((id) => ({ value: id, label: COOP_GAMES[id].name }))]} />
          <p className="gs-room__hint">{pick === "mix" ? "A different game each time, in a random order." : COOP_GAMES[pick].how}</p>
          <Select fullWidth floatingLabel="How many games" value={String(count)} onChange={(v) => setCount(Number(v))}
            options={COOP_COUNTS.map((n) => ({ value: String(n), label: String(n) }))} />
          <Button variant="primary" disabled={busy} onClick={() => void start()}>Start</Button>
        </div>
      )}
    </Card>
  );
}

// ── In play ──────────────────────────────────────────────────────────────────

export function CoopPlay({ view, act, serverNow }: { view: RoomView; act: Act; serverNow: number }) {
  const confirm = useConfirm();
  const toast = useToast();
  const q = view.quickfire!;
  const c = q.coop!;
  const open = view.phase === "open";
  const left = secsLeft(view.endsAt, serverNow);
  const here = view.players.filter((p) => p.active);
  const end = async () => {
    if (await confirm({ title: "End this game?", body: "Everyone goes back to the lobby.", confirmLabel: "End game" })) void act({ action: "lobby" });
  };
  const answer = async (text: string) => {
    const ok = await act({ action: "answer", text }, true);
    if (!ok) toast.error(q.game?.id === "five-letters" ? "That word isn't on our list. Try another five-letter word." : ROOM_ERRORS.not_an_answer);
    return ok;
  };

  if (view.phase === "done") return <CoopDone view={view} act={act} />;

  // The tag over the round says who's against whom ("You vs the House"); a boss needs no tag.
  const tag = q.round && q.round.tag && q.round.tag !== "Co-op" ? q.round.tag : null;
  // Five Letters' prompt already counts its guesses ("Guess 3 of 6"): say it once.
  const counted = !!q.round && q.round.prompt.includes(`${c.roundWord} ${c.round}`);
  return (
    <div className="gs-room__play">
      <div className="gs-room__bar">
        <span className="gs-room__progress">
          {c.games > 1 ? `Game ${c.gameNo} of ${c.games} · ` : ""}{q.game?.name}{view.phase !== "intro" && c.round && !counted ? ` · ${c.roundWord} ${c.round} of ${c.maxRounds}` : ""}
        </span>
        {open && <span className={`gs-room__clock${left <= 3 ? " is-last" : ""}`} aria-live="off">{left}s</span>}
      </div>
      <div className="gs-room__stage">
        <div className="gs-room__round live-break">
          {view.phase === "intro" ? (
            <div className="gs-room__intro">
              <p className="gs-room__eyebrow">{c.gameNo === 1 ? "First up" : "Next up"}</p>
              <p className="gs-room__big">{q.game?.name}</p>
              <p className="gs-activity__muted">{c.how}</p>
            </div>
          ) : q.round ? (
            <BreakRoundPlay
              round={q.round}
              reveal={q.reveal}
              open={open}
              mine={q.mine}
              found={null}
              answering={q.answering}
              roundKey={`${q.roundNo}:${q.game?.id}`}
              now={serverNow}
              onAnswer={answer}
              meta={tag}
              inputId="gs-room-coop"
              team="You"
            />
          ) : null}
          {q.round?.layout === "connect" && view.phase !== "intro" && <p className="gs-room__answered">Your pieces are yellow, GameShuffle&apos;s are red.</p>}
          {open && <p className="gs-room__answered">{q.answering} of {here.length} answered</p>}
          {view.phase === "reveal" && c.outcome && (
            <div className={`coop-outcome is-${c.outcome.result}`} role="status">
              <Badge variant={RESULT_BADGE[c.outcome.result]} size="small">{RESULT_LABEL[c.outcome.result]}</Badge> {c.outcome.line}
            </div>
          )}
        </div>
        <section className="gs-room__side coop-side" aria-label="Your team">
          {c.results.length > 0 && (
            <p className="coop-side__record">
              <b>{c.record.won}</b> won · <b>{c.record.lost}</b> lost{c.record.draw ? <> · <b>{c.record.draw}</b> drawn</> : null}
            </p>
          )}
          <ol className="gs-room__players" aria-label="Who's playing">
            {view.players.filter((p) => p.active).map((p) => (
              <li key={p.id} className={`gs-room__player${p.id === view.me ? " is-me" : ""}`}>
                <Avatar size="small" src={p.avatar ?? undefined} initials={initials(p.name)} alt="" status="online" />
                <span className="gs-room__pname">{p.name}{p.id === view.me ? " (you)" : ""}</span>
                {open && p.answered && <span className="coop-side__in"><IconCheck size={16} aria-hidden /><span className="sr-only">answered</span></span>}
              </li>
            ))}
          </ol>
        </section>
      </div>
      {view.isHost && (
        <div className="gs-room__host">
          <Button size="small" variant="ghost" iconBefore={IconPlayerSkipForward} onClick={() => void act({ action: "next" })}>{open ? "Play this round now" : "Skip ahead"}</Button>
          <Button size="small" variant="ghost" onClick={() => void end()}>End game</Button>
        </div>
      )}
    </div>
  );
}

/** The end of the set: how the call did, game by game. */
function CoopDone({ view, act }: { view: RoomView; act: Act }) {
  const c = view.quickfire!.coop!;
  const played = view.players.filter((p) => p.active).map((p) => p.name);
  return (
    <div className="gs-room__done">
      <h3 className="gs-room__big">{coopHeadline(c.results)}</h3>
      {c.results.length > 0 ? (
        <ol className="coop-results">
          {c.results.map((r, i) => (
            <li key={i} className="coop-results__row">
              <Badge variant={RESULT_BADGE[r.result]} size="small">{RESULT_LABEL[r.result]}</Badge>
              <span><b>{COOP_GAMES[r.game].name}.</b> {r.line}</span>
            </li>
          ))}
        </ol>
      ) : <p className="gs-activity__muted">No games finished this time.</p>}
      {played.length > 0 && <p className="gs-activity__muted">Played by {played.join(", ")}.</p>}
      {view.isHost ? (
        <div className="gs-room__actions">
          <Button variant="primary" onClick={() => void act({ action: "again" })}>Play again</Button>
          <Button variant="secondary" onClick={() => void act({ action: "lobby" })}>Back to the lobby</Button>
        </div>
      ) : <p className="gs-room__waiting">Waiting for {view.host?.name ?? "the host"} to pick what&apos;s next.</p>}
    </div>
  );
}
