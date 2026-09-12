"use client";

/**
 * The social feed — a "Create post" modal composer + All / Following /
 * Communities tabs, each a self-loading list of PostCards. The centerpiece of
 * the community home.
 */

import { useCallback, useEffect, useState } from "react";
import { Tabs } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { PostCard } from "@/components/social/PostCard";
import { PostComposer } from "@/components/social/PostComposer";
import type { FeedPost } from "@/lib/social/feed";

type Scope = "for_you" | "following" | "communities";

function FeedList({
  scope,
  refreshKey,
  currentUserId,
  prepend,
}: {
  scope: Scope;
  refreshKey: number;
  currentUserId: string;
  /** A just-created post to drop at the top optimistically (for_you only). */
  prepend?: FeedPost | null;
}) {
  const [posts, setPosts] = useState<FeedPost[] | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/social/posts?scope=${scope}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { posts: [] }))
      .then((d) => { if (live) setPosts((d.posts as FeedPost[]) ?? []); })
      .catch(() => { if (live) setPosts([]); });
    return () => { live = false; };
  }, [scope, refreshKey]);

  // Optimistically show a newly-created post at the top, without a refetch (so
  // no other new posts stream in — those wait for a manual refresh).
  useEffect(() => {
    if (!prepend) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPosts((ps) => {
      if (!ps) return [prepend];
      if (ps.some((p) => p.id === prepend.id)) return ps;
      return [prepend, ...ps];
    });
  }, [prepend]);

  const onDeleted = useCallback(
    (id: string) => setPosts((ps) => (ps ? ps.filter((p) => p.id !== id) : ps)),
    [],
  );

  if (posts === null) return <p className="feed__msg">Loading…</p>;
  if (posts.length === 0) {
    return (
      <p className="feed__msg">
        {scope === "following"
          ? "Posts from people you follow show up here. Follow some players to fill your feed."
          : scope === "communities"
            ? "Join communities and their posts show up here."
            : "No posts yet. Be the first to say something."}
      </p>
    );
  }
  return (
    <div className="feed__list">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} currentUserId={currentUserId} onDeleted={onDeleted} />
      ))}
    </div>
  );
}

export function SocialFeed() {
  const { user } = useAuth();
  const [refreshKey] = useState(0);
  const [tab, setTab] = useState<Scope>("for_you");
  const [pending, setPending] = useState<FeedPost | null>(null);

  if (!user) return null;

  const onPosted = (post?: FeedPost) => {
    setTab("for_you");
    if (post) setPending(post);
  };

  return (
    <div className="feed">
      <PostComposer onPosted={onPosted} />

      <Tabs
        variant="underline"
        activeTab={tab}
        onChange={(id) => setTab(id as Scope)}
        tabs={[
          { id: "for_you", label: "All", content: <FeedList scope="for_you" refreshKey={refreshKey} currentUserId={user.id} prepend={pending} /> },
          { id: "following", label: "Following", content: <FeedList scope="following" refreshKey={refreshKey} currentUserId={user.id} /> },
          { id: "communities", label: "Communities", content: <FeedList scope="communities" refreshKey={refreshKey} currentUserId={user.id} /> },
        ]}
      />
    </div>
  );
}
