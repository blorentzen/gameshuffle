import { UserAvatar, type AvatarSource } from "@/components/UserAvatar";
import { UserIdentity } from "@/components/profile/UserIdentity";
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

  // Linked tiles become a profile-card door (hover/tap → card, which offers
  // View profile / Message). The settings editor passes linked={false} → plain.
  if (linked && friend.username) {
    return (
      <UserIdentity userId={friend.id} name={name}>
        <span className="friend-tile">{inner}</span>
      </UserIdentity>
    );
  }
  return <span className="friend-tile">{inner}</span>;
}
