"use client";

/**
 * A game space's Posts tab (game spaces step 3): the composer, about this game, then its posts newest first with
 * Show more. Signed out, the posts read the same; Write a post, a reaction or a comment opens the sign-up sheet
 * (journeys 4A), and on the way back the composer is ready or the reaction is sent (kept in this tab's session storage
 * while they sign up).
 */

import { useCallback, useRef, useState } from "react";
import { Button } from "@empac/cascadeds";
import { IconPencil } from "@tabler/icons-react";
import { PostCard } from "@/components/social/PostCard";
import { PostComposer } from "@/components/social/PostComposer";
import { JoinSheet, useThen, type SheetContext } from "@/components/games/JoinSheet";
import type { FeedPost } from "@/lib/social/feed";

const PENDING = "gs-space-pending-react";

function readPending(): { postId: string; emoji: string } | null {
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(PENDING) ?? "null") as { postId?: unknown; emoji?: unknown } | null;
    window.sessionStorage.removeItem(PENDING);
    return raw && typeof raw.postId === "string" && typeof raw.emoji === "string" ? { postId: raw.postId, emoji: raw.emoji } : null;
  } catch { return null; }
}

export function SpacePosts({ space, game, initialPosts, currentUserId, pageSize = 20 }: {
  space: string;
  game: { key: string; name: string };
  initialPosts: FeedPost[];
  currentUserId: string | null;
  pageSize?: number;
}) {
  const [posts, setPosts] = useState<FeedPost[]>(initialPosts);
  // Reading more goes through the signed-in API, so signed out it stays at the first page.
  const [more, setMore] = useState(!!currentUserId && initialPosts.length >= pageSize);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (before: string | null) => {
    const q = new URLSearchParams({ space });
    if (before) q.set("before", before);
    const r = await fetch(`/api/social/posts?${q}`, { cache: "no-store" });
    if (!r.ok) return null;
    return ((await r.json()).posts as FeedPost[]) ?? [];
  }, [space]);

  const onPosted = useCallback((post?: FeedPost) => {
    if (post) setPosts((ps) => [post, ...ps.filter((p) => p.id !== post.id)]);
    else void load(null).then((fresh) => fresh && setPosts(fresh));
  }, [load]);

  async function showMore() {
    const last = posts[posts.length - 1];
    if (!last) return;
    setLoading(true);
    const next = await load(last.createdAt).catch(() => null);
    setLoading(false);
    if (!next) return;
    setPosts((ps) => [...ps, ...next.filter((n) => !ps.some((p) => p.id === n.id))]);
    setMore(next.length >= pageSize);
  }

  const signedIn = !!currentUserId;
  const composerRef = useRef<HTMLDivElement>(null);
  const [ask, setAsk] = useState<{ action: "post" | "react"; context?: SheetContext } | null>(null);

  // Back from the sheet: the composer ready to type, or the reaction they tapped sent.
  useThen("post", signedIn, () => {
    const box = composerRef.current;
    const field = () => box?.querySelector<HTMLElement>("textarea, [contenteditable=true], input[type=text]");
    box?.scrollIntoView({ block: "center" });
    field()?.focus({ preventScroll: true });
    // The page's tabs settle after mount and can take focus back; try once more unless they've moved on.
    window.setTimeout(() => { if (document.activeElement === document.body) field()?.focus({ preventScroll: true }); }, 600);
  });
  useThen("react", signedIn, () => {
    const p = readPending();
    if (!p) return;
    void fetch(`/api/social/posts/${p.postId}/react`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emoji: p.emoji }) })
      .then(() => load(null))
      .then((fresh) => { if (fresh) setPosts(fresh); })
      .catch(() => {});
  });

  function needAccount(post: FeedPost, emoji?: string) {
    try {
      if (emoji) window.sessionStorage.setItem(PENDING, JSON.stringify({ postId: post.id, emoji }));
      else window.sessionStorage.removeItem(PENDING);
    } catch { /* the reaction just won't be sent for them */ }
    const words = (post.body ?? "").replace(/\s+/g, " ").trim();
    setAsk({ action: "react", context: { title: `${post.author.name}'s post`, line: words.length > 90 ? `${words.slice(0, 88)}…` : words || undefined, img: post.author.discordAvatar ?? post.author.twitchAvatar ?? null } });
  }

  return (
    <div className="feed space-posts">
      {signedIn ? (
        <div ref={composerRef}><PostComposer game={game} onPosted={onPosted} /></div>
      ) : (
        <div className="space-posts__in">
          <span>Posts about {game.name} from players here.</span>
          <Button variant="primary" size="small" iconBefore={IconPencil} onClick={() => setAsk({ action: "post" })} aria-haspopup="dialog">Write a post</Button>
        </div>
      )}
      <JoinSheet
        open={!!ask} onClose={() => setAsk(null)} space={space} action={ask?.action ?? "post"} params={{ tab: "posts" }}
        heading={ask?.action === "react" ? "Join the conversation" : "Write a post"}
        body={ask?.action === "react"
          ? `Free. React, comment and post about ${game.name}, and hear when someone answers you.`
          : `Free. Post about ${game.name} where its players read, and hear when someone answers you.`}
        context={ask?.context}
      />
      {posts.length === 0 ? (
        <p className="feed__msg">No posts about {game.name} yet.{currentUserId ? " Say something to start it off." : ""}</p>
      ) : (
        <div className="feed__list">
          {posts.map((p) => (
            <PostCard key={p.id} post={p} currentUserId={currentUserId ?? ""} readOnly={!currentUserId} hideGame onDeleted={(id) => setPosts((ps) => ps.filter((x) => x.id !== id))} onNeedAccount={signedIn ? undefined : ({ emoji }) => needAccount(p, emoji)} />
          ))}
        </div>
      )}
      {more && posts.length > 0 && (
        <Button variant="secondary" onClick={() => void showMore()} disabled={loading}>{loading ? "Loading" : "Show more"}</Button>
      )}
    </div>
  );
}
