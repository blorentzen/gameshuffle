"use client";

/**
 * A community's scoped feed — the shared modal composer (members only) + a list
 * of PostCards for that community. Reads are public; posting requires membership.
 */

import { useCallback, useState } from "react";
import { PostCard } from "@/components/social/PostCard";
import { PostComposer } from "@/components/social/PostComposer";
import type { FeedPost } from "@/lib/social/feed";

export function CommunityFeed({
  communityId,
  communityName,
  initialPosts,
  canPost,
  isOwner = false,
  currentUserId,
}: {
  communityId: string;
  communityName?: string;
  initialPosts: FeedPost[];
  canPost: boolean;
  isOwner?: boolean;
  currentUserId: string | null;
}) {
  const [posts, setPosts] = useState<FeedPost[]>(initialPosts);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/social/posts?communityId=${communityId}`, { cache: "no-store" });
      if (r.ok) {
        const d = await r.json();
        setPosts((d.posts as FeedPost[]) ?? []);
      }
    } catch { /* keep current */ }
  }, [communityId]);

  const onDeleted = useCallback(
    (id: string) => setPosts((ps) => ps.filter((p) => p.id !== id)),
    [],
  );

  return (
    <div className="feed">
      {canPost && (
        <div style={{ marginBottom: "var(--spacing-16)" }}>
          <PostComposer communityId={communityId} communityName={communityName} isOwner={isOwner} onPosted={() => void refresh()} />
        </div>
      )}

      {posts.length === 0 ? (
        <p className="feed__msg">{canPost ? "No posts yet. Be the first to say something." : "No posts yet."}</p>
      ) : (
        <div className="feed__list">
          {posts.map((p) => (
            <PostCard key={p.id} post={p} currentUserId={currentUserId ?? ""} onDeleted={onDeleted} />
          ))}
        </div>
      )}
    </div>
  );
}
