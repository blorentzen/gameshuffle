/**
 * Client-safe profile-card shape (Spec 1). Split out of the server-only
 * profileCard.ts so the `<ProfileCard>` component + client cache can import it.
 */

export interface ProfileCardData {
  userId: string;
  displayName: string;
  username: string | null;
  isPublic: boolean;
  /** Non-null when suspended/banned → the card renders a tombstone. */
  moderationStatus: string | null;

  // Avatar raw fields — rendered via the shared UserAvatar path.
  avatarSource: string | null;
  avatarSeed: string | null;
  avatarOptions: Record<string, unknown> | null;
  discordAvatar: string | null;
  twitchAvatar: string | null;

  // Global badges.
  isStaff: boolean;
  isPro: boolean;
  isStreamer: boolean;
  isLive: boolean;

  /** Coarse presence fallback; live Realtime presence layers on later. */
  isOnline: boolean;

  // Cheap stats.
  memberSince: string | null;
  configCount: number;
  tournamentCount: number;

  // Viewer-relative.
  isSelf: boolean;
  blockedByViewer: boolean;
  blocksViewer: boolean;
  canMessage: boolean;
}

export type ProfileCardResult =
  | { ok: true; card: ProfileCardData }
  | { ok: false; reason: "not_found" };
