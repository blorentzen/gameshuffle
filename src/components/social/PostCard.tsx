"use client";

/**
 * A single feed post: author header (live presence), body with linked
 * @mentions, CDS Reactions, expandable CDS Comments, and an owner/report menu.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Reactions, CommentInput, IconButton, Icon, Modal, Button, type Reaction } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/client";
import { CommentTree } from "@/components/social/CommentTree";
import { UserAvatar, type AvatarSource } from "@/components/UserAvatar";
import { LivePresenceDot } from "@/components/social/LivePresenceDot";
import { ReportContentModal } from "@/components/social/ReportContentModal";
import { ShareRegisterButton } from "@/components/social/ShareRegisterButton";
import { useToast } from "@/components/toast/ToastProvider";
import type { FeedPost, FeedComment, RsvpStatus } from "@/lib/social/feed";
import { IconTrophy, IconDeviceGamepad2, IconCalendarEvent, IconClock } from "@tabler/icons-react";

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

/** Render body text with @mentions and #hashtags as links. */
function renderBody(body: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(@|#)([A-Za-z0-9_]{2,50})/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) out.push(body.slice(last, m.index));
    const [full, sigil, token] = m;
    if (sigil === "@") {
      out.push(
        <Link key={`t${i++}`} href={`/u/${token.toLowerCase()}`} className="post-card__mention">
          @{token}
        </Link>,
      );
    } else {
      out.push(
        <Link key={`t${i++}`} href={`/t/${token.toLowerCase()}`} className="post-card__mention">
          #{token}
        </Link>,
      );
    }
    last = m.index + full.length;
  }
  if (last < body.length) out.push(body.slice(last));
  return out;
}

export function PostCard({
  post,
  currentUserId,
  onDeleted,
  defaultOpenComments = false,
  readOnly = false,
}: {
  post: FeedPost;
  currentUserId: string;
  onDeleted: (id: string) => void;
  defaultOpenComments?: boolean;
  /** Signed-out preview: interactions nudge to signup instead of hitting auth APIs. */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const requireAuth = () => router.push("/signup?redirect=/communities");
  const [reactions, setReactions] = useState<Reaction[]>(post.reactions);
  const [showComments, setShowComments] = useState(defaultOpenComments);
  const [comments, setComments] = useState<FeedComment[] | null>(null);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [reportOpen, setReportOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  // Auto-load when comments start open (permalink view). loadComments sets
  // state only in its async continuation, not synchronously in the effect.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (showComments && comments === null) void loadComments();
  }, [showComments, comments, loadComments]);

  // Live reactions + comments from OTHER viewers. We refetch just this post's
  // reactions/comment-count on any change (debounced) — new POSTS are not
  // streamed in, only reactions/comments, so the feed itself stays put until a
  // manual refresh. Requires gs_post_reactions/gs_post_comments in the realtime
  // publication (supabase/social-feed-m3-realtime.sql).
  const showCommentsRef = useRef(showComments);
  useEffect(() => { showCommentsRef.current = showComments; }, [showComments]);
  useEffect(() => {
    if (readOnly) return;
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refetch = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void (async () => {
          const res = await fetch(`/api/social/posts/${post.id}`, { cache: "no-store" });
          if (!res.ok) return;
          const d = await res.json().catch(() => null);
          const p = d?.post as FeedPost | undefined;
          if (!p) return;
          setReactions(p.reactions);
          setCommentCount(p.commentCount);
        })();
      }, 350);
    };
    const channel = supabase
      .channel(`post-rt-${post.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gs_post_reactions", filter: `post_id=eq.${post.id}` }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "gs_post_comments", filter: `post_id=eq.${post.id}` }, () => {
        refetch();
        if (showCommentsRef.current) void loadComments();
      })
      .subscribe();
    return () => { clearTimeout(timer); void supabase.removeChannel(channel); };
  }, [post.id, loadComments, readOnly]);

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
    const res = await fetch(`/api/social/posts/${post.id}`, { method: "DELETE" });
    if (res.ok) {
      onDeleted(post.id);
      toast.success("Post deleted.");
    } else {
      toast.error("Couldn't delete. Try again.");
    }
  }

  // Toggle the comment section; load the thread the first time it opens.
  function toggleComments() {
    setShowComments((open) => {
      const next = !open;
      if (next && comments === null) void loadComments();
      return next;
    });
  }

  const page = post.postedAs;

  return (
    <article className="post-card">
      <header className="post-card__head">
        {page ? (
          <span className="post-card__avatar">
            <span aria-hidden style={{ display: "inline-flex", width: 44, height: 44, borderRadius: "12px", alignItems: "center", justifyContent: "center", background: "color-mix(in srgb, var(--primary-500) 18%, var(--surface-default))", fontWeight: 800, fontSize: "var(--font-size-12)" }}>
              {page.name.replace("@", "")[0]?.toUpperCase() ?? "?"}
            </span>
          </span>
        ) : (
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
        )}
        <span className="post-card__id">
          <span className="post-card__name">
            {page ? (
              <Link href={`/c/${page.slug}`}>{page.name}</Link>
            ) : a.username ? (
              <Link href={`/u/${a.username}`} style={a.nameColor ? { color: a.nameColor } : undefined}>{a.name}</Link>
            ) : (
              <span style={a.nameColor ? { color: a.nameColor } : undefined}>{a.name}</span>
            )}
          </span>
          <span className="post-card__meta">
            {page ? (
              <span className="post-card__handle">Community</span>
            ) : (
              a.username && <span className="post-card__handle">@{a.username}</span>
            )}
            <span className="post-card__time">· {relativeTime(post.createdAt)}</span>
          </span>
        </span>
        {!readOnly && (
          <span className="post-card__menu">
            {post.isOwn ? (
              <IconButton variant="tertiary" size="small" aria-label="Delete post" title="Delete" onClick={() => setConfirmDelete(true)}>
                <Icon name="trash" size="18" />
              </IconButton>
            ) : (
              <IconButton variant="tertiary" size="small" aria-label="Report post" title="Report" onClick={() => setReportOpen(true)}>
                <Icon name="flag" size="18" />
              </IconButton>
            )}
          </span>
        )}
      </header>

      {post.kind === "game_night" && post.meta && (
        <div className="game-night">
          <div className="game-night__head">
            <span className="game-night__badge"><IconDeviceGamepad2 size={14} stroke={1.9} aria-hidden /> Game Night</span>
            {post.meta.game && <span className="game-night__game">{post.meta.game}</span>}
          </div>
          <div className="game-night__facts">
            <span className="game-night__when"><IconClock size={14} stroke={1.9} aria-hidden /> {formatWhen(post.meta.startAt)}</span>
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
              onClick={() => (readOnly ? requireAuth() : onRsvp("going"))}
            >
              {rsvp?.myStatus === "going" ? "✓ Going" : "I'm in"}
            </Button>
            <Button
              variant={rsvp?.myStatus === "interested" ? "primary" : "ghost"}
              size="small"
              onClick={() => (readOnly ? requireAuth() : onRsvp("interested"))}
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

      {post.kind === "share" && post.meta?.title && (
        <div className="share-card">
          <Link href={post.meta.url || "#"} style={{ display: "block", textDecoration: "none", color: "inherit" }}>
            <div style={{ padding: "0.85rem 1rem", background: "color-mix(in srgb, var(--primary-500) 5%, var(--surface-default))" }}>
              <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "var(--font-size-12)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>
                {post.meta.entityType === "tournament"
                  ? <><IconTrophy size={14} stroke={1.9} aria-hidden /> Tournament</>
                  : post.meta.entityType === "board_game_night"
                    ? <><IconCalendarEvent size={14} stroke={1.9} aria-hidden /> Game night</>
                    : <><IconDeviceGamepad2 size={14} stroke={1.9} aria-hidden /> Session</>}
              </span>
              <p style={{ margin: "var(--spacing-4) 0 0", fontWeight: 700 }}>{post.meta.title}</p>
              {post.meta.subtitle && <p style={{ margin: "var(--spacing-2, 2px) 0 0", fontSize: "var(--font-size-14)", color: "var(--text-secondary)" }}>{post.meta.subtitle}</p>}
            </div>
          </Link>
          {post.meta.entityType === "tournament" && post.meta.entityId && (
            <ShareRegisterButton tournamentId={post.meta.entityId} readOnly={readOnly} />
          )}
        </div>
      )}

      {post.body && <div className="post-card__body">{renderBody(post.body)}</div>}

      {post.imageUrls.length > 0 && (
        <div
          style={{
            display: "grid",
            gap: 4,
            gridTemplateColumns: post.imageUrls.length === 1 ? "1fr" : "1fr 1fr",
            margin: "var(--spacing-8) 0 0",
            borderRadius: "0.7rem",
            overflow: "hidden",
          }}
        >
          {post.imageUrls.slice(0, 4).map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt=""
              loading="lazy"
              style={{
                display: "block",
                width: "100%",
                height: post.imageUrls.length === 1 ? "auto" : 180,
                maxHeight: post.imageUrls.length === 1 ? 520 : 180,
                objectFit: "cover",
                // 3 images: first spans both columns.
                gridColumn: post.imageUrls.length === 3 && i === 0 ? "1 / -1" : undefined,
              }}
            />
          ))}
        </div>
      )}

      {post.topics.length > 0 && (
        <div className="post-topics">
          {post.topics.map((t) => (
            <Link key={t} href={`/t/${encodeURIComponent(t)}`} className="post-topic-chip">{t}</Link>
          ))}
        </div>
      )}

      <div className="post-card__actions">
        <Reactions
          reactions={reactions}
          onReact={readOnly ? requireAuth : onReact}
          onRemoveReaction={readOnly ? requireAuth : onRemoveReaction}
          size="small"
        />
        <button type="button" className="post-card__comment-toggle" onClick={readOnly ? requireAuth : toggleComments}>
          <Icon name="message-circle" size="16" />
          {commentCount > 0 ? `${commentCount} comment${commentCount === 1 ? "" : "s"}` : "Comment"}
        </button>
      </div>

      {!readOnly && showComments && (
        <div className="post-card__comments">
          {comments === null ? (
            <p className="post-card__comments-msg">Loading comments…</p>
          ) : comments.length === 0 ? (
            <p className="post-card__comments-msg">No comments yet. Be the first.</p>
          ) : (
            <div className="post-card__comment-list">
              <CommentTree
                comments={comments}
                currentUserId={currentUserId}
                onLike={(id) => void toggleLike(id)}
                onReply={(id, content) => void addComment(content, id)}
                onDelete={(id) => void removeComment(id)}
              />
            </div>
          )}
          {currentUserId && (
            <div className="post-card__comment-box">
              <CommentInput
                currentUser={{ id: currentUserId, name: "You" }}
                placeholder="Write a comment…"
                autoFocus
                onSubmit={(content) => void addComment(content)}
              />
            </div>
          )}
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

      <Modal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this post?"
        size="small"
        primaryAction={{ label: "Delete", onClick: () => { setConfirmDelete(false); void deletePost(); } }}
        secondaryAction={{ label: "Cancel", onClick: () => setConfirmDelete(false) }}
      >
        <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "var(--font-size-14)" }}>
          This permanently removes the post and its comments. This can&rsquo;t be undone.
        </p>
      </Modal>
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
