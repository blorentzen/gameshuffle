import { UserAvatar, type AvatarSource } from "@/components/UserAvatar";
import type { FriendProfile } from "@/lib/social/topFriends";

/**
 * Compact friend tile — avatar (+ online dot) + name, linking to their
 * profile. Shared by the /u Top Friends grid and the settings editor.
 */
export function FriendTile({
  friend,
  size = 64,
  linked = true,
}: {
  friend: FriendProfile;
  size?: number;
  linked?: boolean;
}) {
  const name = friend.displayName || friend.username || "User";
  const inner = (
    <>
      <span className="friend-tile__avatar">
        <UserAvatar
          user={{
            id: friend.id,
            avatar_source: (friend.avatarSource as AvatarSource | null) ?? "dicebear",
            avatar_seed: friend.avatarSeed,
            avatar_options: friend.avatarOptions,
            discord_avatar: friend.discordAvatar,
            twitch_avatar: friend.twitchAvatar,
          }}
          size={size}
          alt={name}
        />
        {friend.isOnline && <span className="friend-tile__dot" aria-label="Online" />}
      </span>
      <span className="friend-tile__name">{name}</span>
    </>
  );

  return linked && friend.username ? (
    <a href={`/u/${friend.username}`} className="friend-tile">
      {inner}
    </a>
  ) : (
    <span className="friend-tile">{inner}</span>
  );
}
