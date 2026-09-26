"use client";

/**
 * Crew battles on /c — cross-community 1v1 matches per game. Shows the
 * community's win/loss record, its battle history, and (for captains + owner/
 * mods) controls to challenge another community, accept/decline/cancel, and
 * report results. Actions hit /api/communities/[id]/battles and refresh.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Button, Select, Input } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { FAVORITE_GAME_CATALOG } from "@/data/favorite-games";
import type { CrewBattle } from "@/lib/communities/battles";

const STATUS_LABEL: Record<string, string> = { proposed: "Proposed", accepted: "Accepted", completed: "Final", declined: "Declined", cancelled: "Cancelled" };

export function CommunityBattles({
  communityId,
  battles,
  record,
  canManage,
  captainGames,
}: {
  communityId: string;
  battles: CrewBattle[];
  record: Record<string, { wins: number; losses: number }>;
  canManage: boolean;
  captainGames: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [showPropose, setShowPropose] = useState(false);
  const [pGame, setPGame] = useState("");
  const [pOpponent, setPOpponent] = useState("");
  const [pWhen, setPWhen] = useState("");

  const canAct = (game: string) => canManage || captainGames.includes(game);
  const canPropose = canManage || captainGames.length > 0;
  const gameOptions = [
    { value: "", label: "Pick a game" },
    ...(canManage ? FAVORITE_GAME_CATALOG.map((g) => ({ value: g.name, label: g.name })) : captainGames.map((g) => ({ value: g, label: g }))),
  ];
  const recordEntries = Object.entries(record).filter(([, r]) => r.wins + r.losses > 0);

  async function call(method: string, body: Record<string, unknown>, okMsg?: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/communities/${communityId}/battles`, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { if (okMsg) toast.success(okMsg); router.refresh(); }
      else toast.error(
        d.error === "opponent_not_found" ? "No community with that handle."
        : d.error === "cannot_challenge_self" ? "Pick a different community."
        : d.error === "forbidden" ? "Only crew captains or community owners/mods can do that."
        : "Something went wrong. Try again.",
      );
    } catch { toast.error("Network error. Try again."); }
    setBusy(false);
  }

  /** Open (or create) the live lounge for this battle and go there. */
  async function playMatch(battleId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/communities/${communityId}/battles`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ battleId, action: "play" }),
      });
      const d = (await res.json().catch(() => ({}))) as { href?: string; error?: string };
      if (res.ok && d.href) { router.push(d.href); return; }
      toast.error(
        d.error === "game_not_competitive" ? "That game doesn't have live scoring yet."
        : d.error === "forbidden" ? "Only crew captains or community owners/mods can do that."
        : "Couldn't open the match. Try again.",
      );
    } catch { toast.error("Network error. Try again."); }
    setBusy(false);
  }

  return (
    <Card padding="large">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--spacing-12)", marginBottom: "var(--spacing-16)" }}>
        <h2 className="profile-section-heading" style={{ margin: 0 }}>Crew battles</h2>
        {canPropose && (
          <Button variant="secondary" size="small" onClick={() => setShowPropose((s) => !s)}>{showPropose ? "Close" : "Challenge a crew"}</Button>
        )}
      </div>

      {recordEntries.length > 0 && (
        <div className="battle-record">
          {recordEntries.map(([game, r]) => (
            <span key={game} className="battle-record__chip"><strong>{game}</strong> {r.wins}–{r.losses}</span>
          ))}
        </div>
      )}

      {showPropose && (
        <div className="battle-propose">
          <div className="crew__join-row">
            <Select options={gameOptions} value={pGame} onChange={(v) => setPGame(v as string)} size="small" />
            <Input value={pOpponent} onChange={(e) => setPOpponent(e.target.value)} placeholder="Opponent community handle" />
          </div>
          <div className="crew__join-row" style={{ marginTop: "var(--spacing-8)" }}>
            <input type="datetime-local" className="save-setup-input" value={pWhen} onChange={(e) => setPWhen(e.target.value)} />
            <Button variant="primary" size="small" disabled={busy || !pGame || !pOpponent.trim()}
              onClick={() => { const g = pGame, o = pOpponent.trim().replace(/^@/, ""), w = pWhen; setPOpponent(""); setPWhen(""); setPGame(""); setShowPropose(false); call("POST", { game: g, opponentSlug: o, scheduledAt: w ? new Date(w).toISOString() : null }, "Challenge sent"); }}>
              Send challenge
            </Button>
          </div>
        </div>
      )}

      {battles.length === 0 ? (
        <p style={{ margin: 0, color: "var(--text-tertiary)", fontSize: "var(--font-size-14)" }}>
          No crew battles yet. Challenge another community&rsquo;s crew to get on the board.
        </p>
      ) : (
        <ul className="battle-list">
          {battles.map((b) => {
            const isAway = b.away.communityId === communityId;
            const other = isAway ? b.home : b.away;
            const won = b.status === "completed" && b.winnerCommunityId === communityId;
            const lost = b.status === "completed" && b.winnerCommunityId && !won;
            return (
              <li key={b.id} className="battle-row">
                <div className="battle-row__main">
                  <span className="battle-row__game">🏁 {b.game}</span>
                  <span className="battle-row__vs">vs <Link href={`/c/${other.slug}`}>{other.name}</Link></span>
                  {b.scheduledAt && b.status !== "completed" && (
                    <span className="battle-row__when">{new Date(b.scheduledAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                  )}
                </div>
                <div className="battle-row__end">
                  {b.status === "completed" ? (
                    <span className={`battle-row__result battle-row__result--${won ? "win" : lost ? "loss" : "na"}`}>
                      {won ? "Won" : lost ? "Lost" : "Final"}{b.homeScore != null && b.awayScore != null ? ` ${b.homeScore}–${b.awayScore}` : ""}
                    </span>
                  ) : (
                    <span className={`battle-row__status battle-row__status--${b.status}`}>{STATUS_LABEL[b.status]}</span>
                  )}
                  {/* Away side responds to a proposal */}
                  {b.status === "proposed" && isAway && canAct(b.game) && (
                    <span className="battle-row__actions">
                      <Button variant="primary" size="small" disabled={busy} onClick={() => call("PATCH", { battleId: b.id, action: "accept" }, "Battle accepted")}>Accept</Button>
                      <Button variant="ghost" size="small" disabled={busy} onClick={() => call("PATCH", { battleId: b.id, action: "decline" })}>Decline</Button>
                    </span>
                  )}
                  {/* Play it live: the lounge scores the set and reports it back,
                      so the manual buttons below are the fallback, not the norm. */}
                  {b.status === "accepted" && canAct(b.game) && (
                    <Button variant="primary" size="small" disabled={busy} onClick={() => void playMatch(b.id)}>
                      {b.loungeSessionId ? "Open match" : "Play match"}
                    </Button>
                  )}

                  {/* Either side can still report by hand (a draw, or a set played off-platform) */}
                  {b.status === "accepted" && canAct(b.game) && (
                    <span className="battle-row__actions">
                      <Button variant="secondary" size="small" disabled={busy} onClick={() => call("PATCH", { battleId: b.id, action: "report", winnerCommunityId: communityId }, "Result reported")}>We won</Button>
                      <Button variant="ghost" size="small" disabled={busy} onClick={() => call("PATCH", { battleId: b.id, action: "report", winnerCommunityId: other.communityId }, "Result reported")}>They won</Button>
                    </span>
                  )}
                  {(b.status === "proposed" || b.status === "accepted") && canAct(b.game) && (
                    <button type="button" className="crew__leave" disabled={busy} onClick={() => call("PATCH", { battleId: b.id, action: "cancel" })}>Cancel</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
