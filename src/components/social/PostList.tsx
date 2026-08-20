"use client";

/** Renders a list of posts (e.g. a profile's Posts tab) with local delete handling. */

import { useState } from "react";
import { PostCard } from "@/components/social/PostCard";
import type { FeedPost } from "@/lib/social/feed";

export function PostList({
  posts: initial,
  currentUserId,
  emptyMessage = "No posts yet.",
}: {
  posts: FeedPost[];
  currentUserId: string;
  emptyMessage?: string;
}) {
  const [posts, setPosts] = useState<FeedPost[]>(initial);
  if (posts.length === 0) return <p className="feed__msg">{emptyMessage}</p>;
  return (
    <div className="feed__list">
      {posts.map((p) => (
        <PostCard
          key={p.id}
          post={p}
          currentUserId={currentUserId}
          onDeleted={(id) => setPosts((ps) => ps.filter((x) => x.id !== id))}
        />
      ))}
    </div>
  );
}
