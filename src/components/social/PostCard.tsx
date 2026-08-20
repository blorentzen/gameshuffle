"use client";

/**
 * A single feed post: author header (live presence), body with linked
 * @mentions, CDS Reactions, expandable CDS Comments, and an owner/report menu.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Reactions, Comments, Button, type Reaction } from "@empac/cascadeds";
import { UserAvatar, type AvatarSource } from "@/components/UserAvatar";
import { LivePresenceDot } from "@/components/social/LivePresenceDot";
import { ReportContentModal } from "@/components/social/ReportContentModal";
import { useToast } from "@/components/toast/ToastProvider";
import type { FeedPost, FeedComment, RsvpStatus } from "@/lib/social/feed";

function formatWhen(startAt: string | null | undefined): string {
  if (!startAt) return "Open · hosting now";
  const d = new Date(startAt);
  if (Number.isNaN(d.getTime())) return "Open · hosting now";
  return d.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

/** Render body text with @mentions as profile links. */
function renderBody(body: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /@([A-Za-z0-9_]{2,30})/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) out.push(body.slice(last, m.index));
    out.push(
      <Link key={`m${i++}`} href={`/u/${m[1].toLowerCase()}`} className="post-card__mention">
        @{m[1]}
      </Link>,
    );
    last = m.index + m[0].length;
  }
  if (last < body.length) out.push(body.slice(last));
  return out;
}

export function PostCard({
  post,
  currentUserId,
  onDeleted,
  defaultOpenComments = false,
}: {
  post: FeedPost;
  currentUserId: string;
  onDeleted: (id: string) => void;
  defaultOpenComments?: boolean;
}) {
  const [reactions, setReactions] = useState<Reaction[]>(post.reactions);
  const [showComments, setShowComments] = useState(defaultOpenComments);
  const [comments, setComments] = useState<FeedComment[] | null>(null);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [reportOpen, setReportOpen] = useState(false);
  const [rsvp, setRsvpState] = useState(post.rsvp);
  const toast = useToast();

  const a = post.author;

  function applyRsvp(next: RsvpStatus | null) {
    setRsvpState((prev) => {
      if (!prev) return prev;
      let { going, interested } = prev;
      if (prev.myStatus === "going") going -= 1;
      else if (prev.myStatus === "interested") interested -= 1;
      if (next === "going") going += 1;
      else if (next === "interested") interested += 1;
      return { ...prev, going, interested, myStatus: next };
    });
  }

  function onRsvp(status: RsvpStatus) {
    const cur = rsvp?.myStatus ?? null;
    if (cur === status) {
      applyRsvp(null);
      void fetch(`/api/social/posts/${post.id}/rsvp`, { method: "DELETE" });
    } else {
      applyRsvp(status);
      void fetch(`/api/social/posts/${post.id}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    }
  }

  const loadComments = useCallback(async () => {
    const res = await fetch(`/api/social/posts/${post.id}/comments`, { cache: "no-store" });
    if (res.ok) {
      const d = await res.json();
      const list = (d.comments as FeedComment[]) ?? [];
      setComments(list);
      setCommentCount(countComments(list));
    }
  }, [post.id]);

  function toggleComments() {
    const next = !showComments;
    setShowComments(next);
    if (next && comments === null) void loadComments();
  }

  // Auto-load when comments start open (permalink view). loadComments sets
  // state only in its async continuation, not synchronously in the effect.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (showComments && comments === null) void loadComments();
  }, [showComments, comments, loadComments]);

  function applyReact(emoji: string, add: boolean) {
    setReactions((prev) => {
      const idx = prev.findIndex((r) => r.emoji === emoji);
      if (add) {
        if (idx >= 0) {
          const c = [...prev];
          c[idx] = { ...c[idx], count: c[idx].count + 1, reacted: true };
          return c;
        }
        return [...prev, { emoji, count: 1, reacted: true }];
      }
      if (idx < 0) return prev;
      const c = [...prev];
      const nc = c[idx].count - 1;
      if (nc <= 0) c.splice(idx, 1);
      else c[idx] = { ...c[idx], count: nc, reacted: false };
      return c;
    });
  }

  function onReact(emoji: string) {
    applyReact(emoji, true);
    void fetch(`/api/social/posts/${post.id}/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    });
  }
  function onRemoveReaction(emoji: string) {
    applyReact(emoji, false);
    void fetch(`/api/social/posts/${post.id}/react?emoji=${encodeURIComponent(emoji)}`, { method: "DELETE" });
  }

  async function addComment(content: string, parentId?: string) {
    const res = await fetch(`/api/social/posts/${post.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: content, parentId: parentId ?? null }),
    });
    if (res.ok) await loadComments();
    else if (res.status === 429) toast.error("You're commenting too fast. Give it a sec.");
  }

  async function toggleLike(commentId: string) {
    const liked = findLiked(comments ?? [], commentId);
    await fetch(`/api/social/comments/${commentId}/like`, { method: liked ? "DELETE" : "POST" });
    await loadComments();
  }

  async function removeComment(commentId: string) {
    await fetch(`/api/social/comments/${commentId}`, { method: "DELETE" });
    await loadComments();
  }

  async function deletePost() {
    if (!window.confirm("Delete this post?")) return;
    const res = await fetch(`/api/social/posts/${post.id}`, { method: "DELETE" });
    if (res.ok) {
      onDeleted(post.id);
      toast.success("Post deleted.");
    }
  }

  return (
    <article className="post-card">
      <header className="post-card__head">
        <span className="post-card__avatar">
          <UserAvatar
            user={{
              id: a.id,
              avatar_source: (a.avatarSource as AvatarSource | null) ?? "dicebear",
              avatar_seed: a.avatarSeed,
              avatar_options: a.avatarOptions as Record<string, string> | null,
              discord_avatar: a.discordAvatar,
              twitch_avatar: a.twitchAvatar,
            }}
            size={44}
            alt={a.name}
          />
          <LivePresenceDot userId={a.id} className="post-card__dot" />
        </span>
        <span className="post-card__id">
          <span className="post-card__name">
            {a.username ? <Link href={`/u/${a.username}`}>{a.name}</Link> : a.name}
          </span>
          <span className="post-card__meta">
            {a.username && <span className="post-card__handle">@{a.username}</span>}
            <span className="post-card__time">· {relativeTime(post.createdAt)}</span>
          </span>
        </span>
        <span className="post-card__menu">
          {post.isOwn ? (
            <Button variant="ghost" size="small" onClick={() => void deletePost()}>Delete</Button>
          ) : (
            <Button variant="ghost" size="small" onClick={() => setReportOpen(true)}>Report</Button>
          )}
        </span>
      </header>

      {post.kind === "game_night" && post.meta && (
        <div className="game-night">
          <div className="game-night__head">
            <span className="game-night__badge">🎮 Game Night</span>
            {post.meta.game && <span className="game-night__game">{post.meta.game}</span>}
          </div>
          <div className="game-night__facts">
            <span className="game-night__when">🕒 {formatWhen(post.meta.startAt)}</span>
            <span className="game-night__count">
              {rsvp?.going ?? 0} going
              {post.meta.capacity ? ` / ${post.meta.capacity}` : ""}
              {(rsvp?.interested ?? 0) > 0 ? ` · ${rsvp?.interested} interested` : ""}
            </span>
          </div>
          <div className="game-night__rsvp">
            <Button
              variant={rsvp?.myStatus === "going" ? "primary" : "secondary"}
              size="small"
              onClick={() => onRsvp("going")}
            >
              {rsvp?.myStatus === "going" ? "✓ Going" : "I'm in"}
            </Button>
            <Button
              variant={rsvp?.myStatus === "interested" ? "primary" : "ghost"}
              size="small"
              onClick={() => onRsvp("interested")}
            >
              Interested
            </Button>
            {rsvp && rsvp.attendees.length > 0 && (
              <span className="game-night__faces">
                {rsvp.attendees.map((att) => (
                  <span key={att.id} className="game-night__face" title={att.name}>
                    <UserAvatar
                      user={{
                        id: att.id,
                        avatar_source: (att.avatarSource as AvatarSource | null) ?? "dicebear",
                        avatar_seed: att.avatarSeed,
                        avatar_options: att.avatarOptions as Record<string, string> | null,
                        discord_avatar: att.discordAvatar,
                        twitch_avatar: att.twitchAvatar,
                      }}
                      size={24}
                      alt={att.name}
                    />
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="post-card__body">{renderBody(post.body)}</div>

      <div className="post-card__actions">
        <Reactions reactions={reactions} onReact={onReact} onRemoveReaction={onRemoveReaction} size="small" />
        <button type="button" className="post-card__comment-toggle" onClick={toggleComments}>
          {commentCount > 0 ? `${commentCount} comment${commentCount === 1 ? "" : "s"}` : "Comment"}
        </button>
      </div>

      {showComments && (
        <div className="post-card__comments">
          <Comments
            comments={comments ?? []}
            currentUser={{ id: currentUserId, name: "You" }}
            showHeader={false}
            inputPlaceholder="Write a comment…"
            emptyMessage="No comments yet. Be the first."
            onAddComment={(content) => void addComment(content)}
            onReply={(commentId, content) => void addComment(content, commentId)}
            onLike={(commentId) => void toggleLike(commentId)}
            onDelete={(commentId) => void removeComment(commentId)}
          />
        </div>
      )}

      {reportOpen && (
        <ReportContentModal
          targetType="post"
          targetId={post.id}
          open={reportOpen}
          onClose={() => setReportOpen(false)}
        />
      )}
    </article>
  );
}

function countComments(list: FeedComment[]): number {
  let n = 0;
  for (const c of list) {
    n += 1;
    if (c.replies?.length) n += countComments(c.replies);
  }
  return n;
}

function findLiked(list: FeedComment[], id: string): boolean {
  for (const c of list) {
    if (c.id === id) return c.likedByMe;
    if (c.replies?.length) {
      const r = findLiked(c.replies, id);
      if (r) return true;
    }
  }
  return false;
}
