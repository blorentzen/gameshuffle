"use client";

/**
 * Community Hub shell (`/communities`). Desktop: a two-column grid — feed in the
 * main column, Discover / Tournaments / Online stacked in the rail (Discover on
 * top). Mobile: the same four sections become a tab bar (Feed / Tournaments /
 * Discover / Online) so each gets the full width. One DOM, switched by CSS + an
 * active tab; the tab class only bites inside the mobile media query, so desktop
 * shows all panels at once.
 */

import { useState } from "react";
import { Icon } from "@empac/cascadeds";
import { SocialFeed } from "@/components/social/SocialFeed";
import { PostList } from "@/components/social/PostList";
import { DiscoverRail } from "@/components/social/DiscoverRail";
import { TournamentsRail } from "@/components/social/TournamentsRail";
import { OnlineRail } from "@/components/social/OnlineRail";
import type { DiscoverCommunity, HubTournaments } from "@/lib/communities/discover";
import type { FeedPost } from "@/lib/social/feed";
import type { OnlineConnection } from "@/lib/social/follows";

type Tab = "feed" | "tournaments" | "discover" | "online";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "feed", label: "Feed", icon: "home" },
  { id: "tournaments", label: "Tournaments", icon: "award" },
  { id: "discover", label: "Discover", icon: "compass" },
  { id: "online", label: "Online", icon: "users" },
];

export function CommunityHubShell({
  discover,
  tournaments,
  online,
  isAuthed,
  previewPosts = [],
}: {
  discover: DiscoverCommunity[];
  tournaments: HubTournaments;
  online: OnlineConnection[];
  isAuthed: boolean;
  /** Signed-out only: a small read-only sample of the feed. */
  previewPosts?: FeedPost[];
}) {
  const [tab, setTab] = useState<Tab>("feed");

  return (
    <div className="hub">
      <nav className="hub__tabs" role="tablist" aria-label="Community sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`hub__tab${tab === t.id ? " is-active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            <Icon name={t.icon} size="18" />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <div className={`hub__panel hub__main${tab === "feed" ? " is-active" : ""}`} data-tab="feed">
        {isAuthed ? (
          <SocialFeed />
        ) : (
          <>
            <PostList posts={previewPosts} currentUserId="" readOnly emptyMessage="No posts yet. Be the first when you join." />
            {previewPosts.length > 0 && (
              <a href="/signup?redirect=/communities" className="hub-preview-more">
                Sign up to see the full feed and join the conversation →
              </a>
            )}
          </>
        )}
      </div>

      <aside className="hub__rail">
        <div className={`hub__panel${tab === "discover" ? " is-active" : ""}`} data-tab="discover">
          <DiscoverRail communities={discover} isAuthed={isAuthed} />
        </div>
        <div className={`hub__panel${tab === "tournaments" ? " is-active" : ""}`} data-tab="tournaments">
          <TournamentsRail tournaments={tournaments} />
        </div>
        <div className={`hub__panel${tab === "online" ? " is-active" : ""}`} data-tab="online">
          <OnlineRail people={online} />
        </div>
      </aside>
    </div>
  );
}
