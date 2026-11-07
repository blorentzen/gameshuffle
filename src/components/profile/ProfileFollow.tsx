"use client";

/**
 * Follow/unfollow control on a public profile (CDS FollowButton). Signed-in
 * only, hidden on your own profile. Optimistic; seeds from server-computed
 * initial state.
 */

import { useState } from "react";
import { FollowButton } from "@empac/cascadeds";
import { IconUsers } from "@tabler/icons-react";
import { useAuth } from "@/components/auth/AuthProvider";

export function ProfileFollow({
  targetUserId,
  initialFollowing,
  initialMutual,
  friendsLabel = false,
}: {
  targetUserId: string;
  initialFollowing: boolean;
  initialMutual: boolean;
  /** Say "Friends" beside the button once you follow each other (the front window, bring-along 2A). */
  friendsLabel?: boolean;
}) {
  const { user } = useAuth();
  const [following, setFollowing] = useState(initialFollowing);
  const [mutual, setMutual] = useState(initialMutual);
  const [loading, setLoading] = useState(false);

  if (!user || user.id === targetUserId) return null;

  async function doFollow() {
    setLoading(true);
    try {
      const res = await fetch("/api/account/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: targetUserId }),
      });
      if (res.ok) {
        setFollowing(true);
        const body = (await res.json().catch(() => null)) as { isMutual?: boolean } | null;
        if (body?.isMutual) setMutual(true);
      }
    } finally {
      setLoading(false);
    }
  }

  async function doUnfollow() {
    setLoading(true);
    try {
      const res = await fetch(`/api/account/follow?userId=${encodeURIComponent(targetUserId)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setFollowing(false);
        setMutual(false);
      }
    } finally {
      setLoading(false);
    }
  }

  const button = (
    <FollowButton
      isFollowing={following}
      isMutual={mutual}
      isLoading={loading}
      onFollow={() => void doFollow()}
      onUnfollow={() => void doUnfollow()}
      size="small"
    />
  );
  if (!friendsLabel) return button;
  return (
    <>
      {button}
      {following && mutual && <span className="pf-friends"><IconUsers size={16} stroke={2} aria-hidden="true" />Friends</span>}
    </>
  );
}
