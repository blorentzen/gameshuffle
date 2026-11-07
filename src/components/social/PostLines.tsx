/**
 * Posts as short lines (game spaces step 3): a face, "Name in Game", how long ago, and one line of what they said,
 * opening the post. Used by a game space's Now tab (without the game: you're in it) and by "From your people" on the
 * home's rail. A few lines, never an endless feed; the full feed is the space's Posts tab.
 */

import Link from "next/link";
import { UserAvatar } from "@/components/UserAvatar";
import type { FeedAuthor, FeedPostGame } from "@/lib/social/feed";
import "@/styles/people.css";

export interface PostLineItem { id: string; author: FeedAuthor; game?: FeedPostGame | null; text: string; createdAt: string; href: string }

function ago(iso: string): string {
  const m = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d} d` : new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function PostLines({ posts, label, size = 40 }: { posts: PostLineItem[]; label: string; size?: number }) {
  return (
    <ul className="people-list post-lines" aria-label={label}>
      {posts.map((p) => (
        <li key={p.id} className="person-row post-line">
          <span className="person-row__face">
            <UserAvatar
              user={{ id: p.author.id, avatar_source: p.author.avatarSource, avatar_seed: p.author.avatarSeed, avatar_options: p.author.avatarOptions as Record<string, string> | null, discord_avatar: p.author.discordAvatar, twitch_avatar: p.author.twitchAvatar }}
              size={size}
            />
          </span>
          <span className="person-row__text">
            <span className="post-line__who">
              <b>{p.author.name}</b>
              {p.game && <> in {p.game.name}</>}
              <span className="post-line__when"> · {ago(p.createdAt)}</span>
            </span>
            <Link href={p.href} className="post-line__text">{p.text}</Link>
          </span>
        </li>
      ))}
    </ul>
  );
}
