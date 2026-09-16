"use client";

/**
 * Community crews — per-game representation rosters. Followers (community
 * members) can opt in to "represent" a game (join as a prospect); owner/mods and
 * that game's captains promote/demote (prospect → representative → captain) and
 * remove. Read-only for everyone else. Actions hit /api/communities/[id]/crews
 * and refresh the server data.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Button, Select, Icon, IconButton } from "@empac/cascadeds";
import { UserAvatar, type AvatarSource } from "@/components/UserAvatar";
import { useMessenger } from "@/components/social/MessengerProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { FAVORITE_GAME_CATALOG } from "@/data/favorite-games";
import type { GameCrew, CrewMember, CrewTier } from "@/lib/communities/crews";

const TIER_LABEL: Record<CrewTier, string> = { captain: "Captain", representative: "Representative", prospect: "Prospect" };
const TIER_ORDER: CrewTier[] = ["captain", "representative", "prospect"];
const UP: Record<CrewTier, CrewTier | null> = { prospect: "representative", representative: "captain", captain: null };
const DOWN: Record<CrewTier, CrewTier | null> = { captain: "representative", representative: "prospect", prospect: null };

function avatarUser(m: CrewMember) {
  return {
    id: m.userId,
    avatar_source: (m.avatarSource as AvatarSource | null) ?? "dicebear",
    avatar_seed: m.avatarSeed,
    avatar_options: m.avatarOptions as Record<string, string> | null,
    discord_avatar: m.discordAvatar,
    twitch_avatar: m.twitchAvatar,
  };
}

export function CommunityCrews({
  communityId,
  crews,
  viewerTiers,
  isMember,
  canManage,
  viewerId,
  members,
}: {
  communityId: string;
  crews: GameCrew[];
  viewerTiers: Record<string, CrewTier>;
  isMember: boolean;
  canManage: boolean;
  viewerId: string;
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const { openConversation } = useMessenger();
  const [busy, setBusy] = useState(false);
  const [joinGame, setJoinGame] = useState("");
  const [recruitGame, setRecruitGame] = useState("");
  const [recruitUser, setRecruitUser] = useState("");

  async function openChat(game: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/communities/${communityId}/crews/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.id) openConversation(d.id);
      else toast.error(d.error === "not_on_crew" ? "Join this crew to use its chat." : "Couldn't open crew chat.");
    } catch { toast.error("Network error. Try again."); }
    setBusy(false);
  }

  async function call(method: string, body: Record<string, unknown>, okMsg?: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/communities/${communityId}/crews`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { if (okMsg) toast.success(okMsg); router.refresh(); }
      else toast.error(d.error === "not_a_member" ? "Join the community first." : d.error === "forbidden" ? "You can't manage this crew." : "Something went wrong. Try again.");
    } catch { toast.error("Network error. Try again."); }
    setBusy(false);
  }

  const manages = (game: string) => canManage || viewerTiers[game] === "captain";
  const joinOptions = [{ value: "", label: "Pick a game" }, ...FAVORITE_GAME_CATALOG.map((g) => ({ value: g.name, label: g.name }))];

  return (
    <Card padding="large">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--spacing-12)", marginBottom: "var(--spacing-16)" }}>
        <h2 className="profile-section-heading" style={{ margin: 0 }}>Crews</h2>
        <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>Who represents, by game</span>
      </div>

      {crews.length === 0 ? (
        <p style={{ margin: "0 0 var(--spacing-16)", color: "var(--text-tertiary)", fontSize: "var(--font-size-14)" }}>
          No crews yet. Members can step up to represent this community in a game below.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-20)" }}>
          {crews.map((crew) => (
            <section key={crew.game} className="crew">
              <div className="crew__head">
                <span className="crew__game">🏁 {crew.game}</span>
                <span className="crew__count">{crew.total} {crew.total === 1 ? "rep" : "reps"}</span>
                {viewerTiers[crew.game] && (
                  <button type="button" className="crew__chat" disabled={busy} onClick={() => openChat(crew.game)}>
                    <Icon name="message-circle" size="14" /> Crew chat
                  </button>
                )}
              </div>
              <ul className="crew__list">
                {crew.members.map((m) => {
                  const isSelf = m.userId === viewerId;
                  const canEdit = manages(crew.game);
                  return (
                    <li key={m.userId} className="crew__member">
                      <Link href={m.username ? `/u/${m.username}` : "#"} className="crew__id">
                        <UserAvatar user={avatarUser(m)} size={30} alt={m.name} />
                        <span className="crew__name">{m.name}</span>
                      </Link>
                      <span className={`crew__tier crew__tier--${m.tier}`}>{TIER_LABEL[m.tier]}</span>
                      {canEdit && (
                        <span className="crew__actions">
                          {UP[m.tier] && (
                            <IconButton variant="tertiary" size="small" aria-label={`Promote ${m.name}`} title="Promote" disabled={busy}
                              onClick={() => call("PATCH", { game: crew.game, userId: m.userId, tier: UP[m.tier] }, `${m.name} promoted`)}>
                              <Icon name="arrow-up" size="16" />
                            </IconButton>
                          )}
                          {DOWN[m.tier] && (
                            <IconButton variant="tertiary" size="small" aria-label={`Demote ${m.name}`} title="Demote" disabled={busy}
                              onClick={() => call("PATCH", { game: crew.game, userId: m.userId, tier: DOWN[m.tier] }, `${m.name} demoted`)}>
                              <Icon name="arrow-down" size="16" />
                            </IconButton>
                          )}
                          <IconButton variant="tertiary" size="small" aria-label={`Remove ${m.name}`} title="Remove from crew" disabled={busy}
                            onClick={() => call("DELETE", { game: crew.game, userId: m.userId })}>
                            <Icon name="x" size="16" />
                          </IconButton>
                        </span>
                      )}
                      {!canEdit && isSelf && (
                        <button type="button" className="crew__leave" disabled={busy} onClick={() => call("DELETE", { game: crew.game, userId: viewerId })}>
                          Leave
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {isMember && (
        <div className="crew__join">
          <span className="crew__join-label">Represent this community in a game:</span>
          <div className="crew__join-row">
            <Select options={joinOptions} value={joinGame} onChange={(v) => setJoinGame(v as string)} size="small" />
            <Button variant="secondary" size="small" disabled={busy || !joinGame}
              onClick={() => { const g = joinGame; setJoinGame(""); call("POST", { game: g }, `You're repping in ${g}`); }}>
              Join crew
            </Button>
          </div>
        </div>
      )}

      {canManage && members.length > 0 && (
        <div className="crew__join">
          <span className="crew__join-label">Recruit a member into a crew:</span>
          <div className="crew__join-row">
            <Select options={joinOptions} value={recruitGame} onChange={(v) => setRecruitGame(v as string)} size="small" />
            <Select
              options={[{ value: "", label: "Pick a member" }, ...members.map((m) => ({ value: m.id, label: m.name }))]}
              value={recruitUser}
              onChange={(v) => setRecruitUser(v as string)}
              size="small"
            />
            <Button variant="secondary" size="small" disabled={busy || !recruitGame || !recruitUser}
              onClick={() => { const g = recruitGame, u = recruitUser; setRecruitUser(""); call("PATCH", { game: g, userId: u, tier: "representative" }, "Added to the crew"); }}>
              Add as rep
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
