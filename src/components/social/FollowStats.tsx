"use client";

/**
 * Followers / Following stat tiles on a profile — clickable, opening a modal
 * list of those users (avatar + name + online + an in-list Follow button for
 * signed-in viewers). Backed by /api/social/connections.
 */

import { useEffect, useState } from "react";
import { Modal, FollowButton } from "@empac/cascadeds";
import { FriendTile } from "@/components/social/FriendTile";
import { useAuth } from "@/components/auth/AuthProvider";
import type { Connection } from "@/lib/social/topFriends";

function ConnectionRow({ user }: { user: Connection }) {
  const { user: me } = useAuth();
  const [following, setFollowing] = useState(user.isFollowing);
  const [loading, setLoading] = useState(false);
  const showFollow = !!me && me.id !== user.id;

  async function follow() {
    setLoading(true);
    try {
      const res = await fetch("/api/account/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      if (res.ok) setFollowing(true);
    } finally {
      setLoading(false);
    }
  }
  async function unfollow() {
    setLoading(true);
    try {
      const res = await fetch(`/api/account/follow?userId=${encodeURIComponent(user.id)}`, {
        method: "DELETE",
      });
      if (res.ok) setFollowing(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="conn-row">
      <FriendTile friend={user} size={44} />
      {showFollow ? (
        <FollowButton
          isFollowing={following}
          isLoading={loading}
          onFollow={() => void follow()}
          onUnfollow={() => void unfollow()}
          size="small"
        />
      ) : null}
    </div>
  );
}

export function FollowStats({
  userId,
  followers,
  following,
}: {
  userId: string;
  followers: number;
  following: number;
}) {
  const [open, setOpen] = useState<null | "followers" | "following">(null);
  const [users, setUsers] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`/api/social/connections?userId=${encodeURIComponent(userId)}&type=${open}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (cancelled) return;
        setUsers((b?.users as Connection[]) ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  function openList(type: "followers" | "following") {
    setUsers([]);
    setLoading(true);
    setOpen(type);
  }

  return (
    <>
      <button type="button" className="profile-stat profile-stat--btn" onClick={() => openList("followers")}>
        <span className="profile-stat__num">{followers.toLocaleString()}</span>
        <span className="profile-stat__label">Followers</span>
      </button>
      <button type="button" className="profile-stat profile-stat--btn" onClick={() => openList("following")}>
        <span className="profile-stat__num">{following.toLocaleString()}</span>
        <span className="profile-stat__label">Following</span>
      </button>

      {open && (
        <Modal
          isOpen
          onClose={() => setOpen(null)}
          title={open === "followers" ? "Followers" : "Following"}
          size="medium"
          secondaryAction={{ label: "Close", onClick: () => setOpen(null) }}
        >
          {loading ? (
            <p style={{ color: "var(--text-secondary)" }}>Loading…</p>
          ) : users.length === 0 ? (
            <p style={{ color: "var(--text-secondary)" }}>No {open} yet.</p>
          ) : (
            <div className="conn-list">
              {users.map((u) => (
                <ConnectionRow key={u.id} user={u} />
              ))}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
