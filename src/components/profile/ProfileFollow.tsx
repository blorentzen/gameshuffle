"use client";

/**
 * Follow/unfollow control on a public profile (CDS FollowButton). Signed-in
 * only, hidden on your own profile. Optimistic; seeds from server-computed
 * initial state.
 */

import { useState } from "react";
import { FollowButton } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";

export function ProfileFollow({
  targetUserId,
  initialFollowing,
  initialMutual,
}: {
  targetUserId: string;
  initialFollowing: boolean;
  initialMutual: boolean;
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
      if (res.ok) setFollowing(true);
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

  return (
    <FollowButton
      isFollowing={following}
      isMutual={mutual}
      isLoading={loading}
      onFollow={() => void doFollow()}
      onUnfollow={() => void doUnfollow()}
      size="small"
    />
  );
}
