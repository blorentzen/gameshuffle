"use client";

import { useRouter } from "next/navigation";
import { PostCard } from "@/components/social/PostCard";
import type { FeedPost } from "@/lib/social/feed";

/** Single post on its permalink page — routes back to the feed on delete. */
export function PermalinkPost({ post, currentUserId }: { post: FeedPost; currentUserId: string }) {
  const router = useRouter();
  return (
    <PostCard
      post={post}
      currentUserId={currentUserId}
      onDeleted={() => router.push("/community")}
      defaultOpenComments
    />
  );
}
