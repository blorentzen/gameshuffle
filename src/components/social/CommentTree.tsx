"use client";

/**
 * Facebook-style comment thread with clickable author identities. Replaces the
 * CDS CommentThread so we can: link the name + avatar to /u, render the real
 * avatar (incl. DiceBear), and linkify @mentions / #topics in the body. Likes,
 * replies (nested, capped depth), and delete-own are wired to the same handlers
 * the post card already uses. A comment can be a GIF or sticker (GifButton beside the reply box), and other
 * people's comments have Report (a GIF comment reports the GIF).
 */

import { useState } from "react";
import Link from "next/link";
import { Icon, CommentInput } from "@empac/cascadeds";
import { UserAvatar, type AvatarSource } from "@/components/UserAvatar";
import { GifAttachment } from "@/components/gifs/GifAttachment";
import { GifButton } from "@/components/gifs/GifButton";
import { ReportContentModal } from "@/components/social/ReportContentModal";
import { ReactionRow } from "@/components/social/ReactionRow";
import type { Attachment } from "@/lib/gifs/rules";
import type { FeedComment } from "@/lib/social/feed";

const MAX_DEPTH = 3;

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

/** Linkify @mentions (→ /u) and #topics (→ /t) in comment text. */
function renderText(body: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(@|#)([A-Za-z0-9_]{2,50})/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) out.push(body.slice(last, m.index));
    const [full, sigil, token] = m;
    const href = sigil === "@" ? `/u/${token.toLowerCase()}` : `/t/${token.toLowerCase()}`;
    out.push(<Link key={`t${i++}`} href={href} className="post-card__mention">{sigil}{token}</Link>);
    last = m.index + full.length;
  }
  if (last < body.length) out.push(body.slice(last));
  return out;
}

function avatarUser(c: FeedComment) {
  const a = c.authorFull;
  return {
    id: c.author.id,
    avatar_source: (a?.avatarSource as AvatarSource | null) ?? "dicebear",
    avatar_seed: a?.avatarSeed ?? null,
    avatar_options: (a?.avatarOptions as Record<string, string> | null) ?? null,
    discord_avatar: a?.discordAvatar ?? null,
    twitch_avatar: a?.twitchAvatar ?? null,
  };
}

interface Handlers {
  currentUserId: string;
  onLike: (id: string) => void;
  onReply: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  /** Post a GIF or sticker as a reply. Without it, no GIF button. */
  onReplyAttach?: (id: string, attachment: Attachment) => void;
  /** Add or take back a reaction (an emoji or "s:<sticker id>"). Without them, no reactions under comments. */
  onReact?: (id: string, key: string) => void;
  onUnreact?: (id: string, key: string) => void;
}

function CommentNode({ c, depth, h }: { c: FeedComment; depth: number; h: Handlers }) {
  const [replying, setReplying] = useState(false);
  const [reporting, setReporting] = useState(false);
  const username = c.authorFull?.username ?? null;
  const nameColor = c.authorFull?.nameColor ?? undefined;
  const isOwn = c.author.id === h.currentUserId;

  const nameNode = username ? (
    <Link href={`/u/${username}`} className="ct__name" style={nameColor ? { color: nameColor } : undefined}>{c.author.name}</Link>
  ) : (
    <span className="ct__name" style={nameColor ? { color: nameColor } : undefined}>{c.author.name}</span>
  );

  const avatar = <UserAvatar user={avatarUser(c)} size={32} alt={c.author.name} />;

  return (
    <div className="ct__item">
      <span className="ct__avatar">
        {username ? <Link href={`/u/${username}`} aria-label={c.author.name}>{avatar}</Link> : avatar}
      </span>
      <div className="ct__col">
        <div className={`ct__bubble${!c.content && c.attachment ? " ct__bubble--media" : ""}`}>
          {nameNode}
          {c.content ? <div className="ct__text">{renderText(c.content)}</div> : null}
          {c.attachment ? <div className="ct__attach"><GifAttachment att={c.attachment} /></div> : null}
        </div>
        <div className="ct__meta">
          <button type="button" className={`ct__act${c.likedByMe ? " is-liked" : ""}`} onClick={() => h.onLike(c.id)}>
            {c.likedByMe ? "Liked" : "Like"}{c.likes > 0 ? ` · ${c.likes}` : ""}
          </button>
          {depth < MAX_DEPTH && (
            <button type="button" className="ct__act" onClick={() => setReplying((r) => !r)}>Reply</button>
          )}
          <span className="ct__time">{relativeTime(c.timestamp)}</span>
          {isOwn && (
            <button type="button" className="ct__act ct__act--danger" onClick={() => h.onDelete(c.id)} aria-label="Delete comment" title="Delete">
              <Icon name="trash" size="14" />
            </button>
          )}
          {!isOwn && h.currentUserId && (
            <button type="button" className="ct__act" onClick={() => setReporting(true)}>Report</button>
          )}
          {h.onReact && h.onUnreact && !c.reactions?.length && (
            <ReactionRow size="comment" reactions={[]} addText="React" addClassName="ct__act" onReact={(key) => h.onReact!(c.id, key)} onRemove={(key) => h.onUnreact!(c.id, key)} />
          )}
        </div>
        {h.onReact && h.onUnreact && !!c.reactions?.length && (
          <ReactionRow
            size="comment"
            className="ct__reactions"
            reactions={c.reactions ?? []}
            onReact={(key) => h.onReact!(c.id, key)}
            onRemove={(key) => h.onUnreact!(c.id, key)}
          />
        )}
        {reporting && (
          <ReportContentModal
            targetType={c.attachment?.kind === "gif" ? "gif" : "comment"}
            targetId={c.attachment?.kind === "gif" ? c.attachment.gif.id : c.id}
            open={reporting}
            onClose={() => setReporting(false)}
          />
        )}
        {replying && h.currentUserId && (
          <div className="ct__reply-box ct__compose">
            <CommentInput
              currentUser={{ id: h.currentUserId, name: "You" }}
              placeholder="Write a reply…"
              autoFocus
              onSubmit={(content) => { h.onReply(c.id, content); setReplying(false); }}
            />
            {h.onReplyAttach ? <GifButton onPick={(p) => { h.onReplyAttach!(c.id, p.attachment); setReplying(false); }} /> : null}
          </div>
        )}
        {c.replies && c.replies.length > 0 && (
          <div className="ct__replies">
            {c.replies.map((r) => <CommentNode key={r.id} c={r} depth={depth + 1} h={h} />)}
          </div>
        )}
      </div>
    </div>
  );
}

export function CommentTree({
  comments,
  currentUserId,
  onLike,
  onReply,
  onDelete,
  onReplyAttach,
  onReact,
  onUnreact,
}: {
  comments: FeedComment[];
  currentUserId: string;
  onLike: (id: string) => void;
  onReply: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onReplyAttach?: (id: string, attachment: Attachment) => void;
  onReact?: (id: string, key: string) => void;
  onUnreact?: (id: string, key: string) => void;
}) {
  const h: Handlers = { currentUserId, onLike, onReply, onDelete, onReplyAttach, onReact, onUnreact };
  return (
    <div className="ct">
      {comments.map((c) => <CommentNode key={c.id} c={c} depth={0} h={h} />)}
    </div>
  );
}
