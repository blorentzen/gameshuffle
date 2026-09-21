"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { UserAvatar, type UserAvatarUser } from "@/components/UserAvatar";
import { ProfileFollow } from "@/components/profile/ProfileFollow";
import { useAuth } from "@/components/auth/AuthProvider";

export interface OrganizerInfo {
  userId: string;
  username: string | null;
  displayName: string;
  avatar?: UserAvatarUser | null;
  /** Server-rendered pages pass these; client pages leave them out and the card fetches. */
  followState?: { isFollowing: boolean; isMutual: boolean } | null;
  followerCount?: number | null;
  coHosts?: { username: string | null; displayName: string }[];
}

/**
 * Organizer card for the shared event shell: avatar, name (→ profile), follower
 * count, Follow button. Eventbrite's "Organized by" block, on our follow graph.
 * Hidden follow when viewing your own event.
 */
export function OrganizerCard({ organizer, roleLabel = "Hosted by", isYou = false }: { organizer: OrganizerInfo; roleLabel?: string; isYou?: boolean }) {
  const { user } = useAuth();
  const [state, setState] = useState(organizer.followState ?? null);
  const [count, setCount] = useState<number | null>(organizer.followerCount ?? null);

  // Client-rendered pages: fetch follow state + counts once we know the viewer.
  useEffect(() => {
    if (organizer.followState !== undefined && organizer.followerCount !== undefined) return;
    let cancelled = false;
    fetch(`/api/account/follow?userId=${encodeURIComponent(organizer.userId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { isFollowing?: boolean; isMutual?: boolean; followers?: number } | null) => {
        if (cancelled || !j) return;
        setState({ isFollowing: !!j.isFollowing, isMutual: !!j.isMutual });
        if (typeof j.followers === "number") setCount(j.followers);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [organizer.userId, organizer.followState, organizer.followerCount, user?.id]);

  const name = organizer.displayName || organizer.username || "a GameShuffle member";
  const profileHref = organizer.username ? `/u/${organizer.username}` : null;

  return (
    <div className="event-shell__organizer">
      <UserAvatar user={organizer.avatar ?? { id: organizer.userId }} size={44} />
      <div className="event-shell__organizer-body">
        <span className="event-shell__organizer-role">{roleLabel}</span>
        <span className="event-shell__organizer-name">
          {profileHref ? <Link href={profileHref}>{name}</Link> : name}
          {isYou && <span className="event-shell__organizer-you"> · that&rsquo;s you</span>}
        </span>
        {(count != null || (organizer.coHosts && organizer.coHosts.length > 0)) && (
          <span className="event-shell__organizer-meta">
            {count != null && `${count} follower${count === 1 ? "" : "s"}`}
            {organizer.coHosts && organizer.coHosts.length > 0 && (
              <>
                {count != null && " · "}with{" "}
                {organizer.coHosts.map((c, i) => (
                  <span key={i}>
                    {i > 0 && ", "}
                    {c.username ? <Link href={`/u/${c.username}`}>{c.displayName}</Link> : c.displayName}
                  </span>
                ))}
              </>
            )}
          </span>
        )}
      </div>
      {!isYou && user?.id !== organizer.userId && state && (
        <div className="event-shell__organizer-follow">
          <ProfileFollow targetUserId={organizer.userId} initialFollowing={state.isFollowing} initialMutual={state.isMutual} />
        </div>
      )}
    </div>
  );
}
