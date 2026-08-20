"use client";

/**
 * Profile hovercard content (Spec 1 §3). One implementation rendered inside
 * either a desktop popover or a mobile bottom sheet by <UserIdentity>. Loads
 * via the client cache; fixed dimensions so it doesn't resize when data lands.
 * States: loading · unavailable · blocked · tombstone · normal.
 */

import Link from "next/link";
import { useState } from "react";
import { Button, Badge, Skeleton } from "@empac/cascadeds";
import { UserAvatar } from "@/components/UserAvatar";
import { useProfileCard } from "@/lib/profile/useProfileCard";
import { useMessenger } from "@/components/social/MessengerProvider";
import { LivePresenceDot } from "@/components/social/LivePresenceDot";
import { BlockProfileButton } from "./BlockProfileButton";
import { ReportProfileButton } from "./ReportProfileButton";

export function ProfileCard({ userId, onClose }: { userId: string; onClose?: () => void }) {
  const { data: card, loading } = useProfileCard(userId, true);
  const { openConversation } = useMessenger();
  const [messaging, setMessaging] = useState(false);

  if (!card) {
    return (
      <div className="profile-card profile-card--loading" role="status">
        {loading ? (
          <>
            <Skeleton width={56} height={56} />
            <Skeleton width="60%" height={16} />
            <Skeleton width="40%" height={12} />
          </>
        ) : (
          <p className="profile-card__msg">Profile unavailable.</p>
        )}
      </div>
    );
  }

  if (card.blockedByViewer) {
    return (
      <div className="profile-card profile-card--minimal">
        <p className="profile-card__msg">You&apos;ve blocked {card.displayName}.</p>
        <Link href="/account?tab=security" onClick={onClose} className="profile-card__manage">
          Manage blocks
        </Link>
      </div>
    );
  }

  if (card.moderationStatus === "suspended" || card.moderationStatus === "banned") {
    return (
      <div className="profile-card profile-card--minimal">
        <p className="profile-card__msg">This account is unavailable.</p>
      </div>
    );
  }

  const memberSince = card.memberSince ? new Date(card.memberSince).getFullYear() : null;

  async function handleMessage() {
    if (!card) return;
    setMessaging(true);
    const res = await fetch("/api/messages/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUserId: card.userId }),
    });
    const d = (await res.json().catch(() => null)) as { id?: string } | null;
    setMessaging(false);
    if (res.ok && d?.id) {
      openConversation(d.id);
      onClose?.();
    }
  }

  return (
    <div className="profile-card">
      <div className="profile-card__head">
        <UserAvatar
          size={56}
          user={{
            id: card.userId,
            avatar_source: card.avatarSource,
            avatar_seed: card.avatarSeed,
            avatar_options: card.avatarOptions,
            discord_avatar: card.discordAvatar,
            twitch_avatar: card.twitchAvatar,
          }}
        />
        <div className="profile-card__id">
          <span className="profile-card__name">
            {card.displayName}
            <LivePresenceDot userId={card.userId} fallback={card.isOnline} className="profile-card__online" />
          </span>
          {card.username && <span className="profile-card__handle">@{card.username}</span>}
          <span className="profile-card__badges">
            {card.isStaff && <Badge variant="info" size="small">Staff</Badge>}
            {card.isPro && <Badge variant="success" size="small">Pro</Badge>}
            {card.isStreamer && (
              <Badge variant={card.isLive ? "error" : "default"} size="small">
                {card.isLive ? "Live" : "Streamer"}
              </Badge>
            )}
          </span>
        </div>
      </div>

      <div className="profile-card__stats">
        {memberSince && (
          <span><strong>{memberSince}</strong> joined</span>
        )}
        <span><strong>{card.configCount}</strong> setups</span>
        <span><strong>{card.tournamentCount}</strong> tournaments</span>
      </div>

      <div className="profile-card__actions">
        {card.username && (
          <Link href={`/u/${card.username}`} onClick={onClose}>
            <Button variant="secondary" size="small">
              {card.isSelf ? "Edit profile" : "View profile"}
            </Button>
          </Link>
        )}
        {!card.isSelf && card.canMessage && (
          <Button variant="primary" size="small" loading={messaging} onClick={() => void handleMessage()}>
            Message
          </Button>
        )}
      </div>

      {!card.isSelf && (
        <div className="profile-card__more">
          <ReportProfileButton targetUserId={card.userId} />
          <BlockProfileButton targetUserId={card.userId} />
        </div>
      )}
    </div>
  );
}
