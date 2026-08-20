/**
 * Community hub — the signed-in social home (`/community`). The social feed is
 * the centerpiece; "Your people" (live presence) and Find Players discovery sit
 * below it. Built on CDS social primitives + the feed data layer.
 *
 * Server component: friends are server-loaded; the feed, discovery, and live
 * presence dots are client islands.
 */

import { FriendTile } from "@/components/social/FriendTile";
import { PlayersDirectory } from "@/components/social/PlayersDirectory";
import { SocialFeed } from "@/components/social/SocialFeed";
import type { FriendProfile } from "@/lib/social/topFriends";

export function CommunityHub({ friends }: { friends: FriendProfile[] }) {
  const onlineCount = friends.filter((f) => f.isOnline).length;
  const sorted = [...friends].sort((a, b) => Number(b.isOnline) - Number(a.isOnline));

  return (
    <div className="community">
      <header className="community__head">
        <h1 className="community__title">Community</h1>
        <p className="community__lead">
          Share what you&apos;re playing, see who&apos;s around, and find new players to game with.
        </p>
      </header>

      <section className="community__section">
        <SocialFeed />
      </section>

      <section className="community__section">
        <div className="community__section-head">
          <h2 className="community__section-title">Your people</h2>
          {friends.length > 0 && <span className="community__count">{onlineCount} online</span>}
        </div>
        {sorted.length === 0 ? (
          <p className="community__empty">
            You&apos;re not following anyone yet. Find players below and follow them to build your circle.
          </p>
        ) : (
          <div className="community__friends">
            {sorted.slice(0, 18).map((f) => (
              <FriendTile key={f.id} friend={f} size={56} />
            ))}
          </div>
        )}
      </section>

      <section className="community__section">
        <div className="community__section-head">
          <h2 className="community__section-title">Find players</h2>
        </div>
        <PlayersDirectory />
      </section>
    </div>
  );
}
