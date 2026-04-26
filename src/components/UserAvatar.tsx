"use client";

/**
 * Single source of truth for rendering a user's avatar.
 *
 * Per gs-avatars-spec.md §4. Resolves the avatar source in this order:
 *   - 'twitch'   → user.twitch_avatar URL  (if available)
 *   - 'discord'  → user.discord_avatar URL (if available)
 *   - 'dicebear' → DiceBear Adventurer SVG (deterministic from seed)
 *   - 'initials' → legacy alias for 'dicebear' (treated identically)
 *
 * Falls back to DiceBear whenever the chosen source has no URL — keeps
 * the UI from showing a broken image when an OAuth provider is in a
 * partially-disconnected state.
 *
 * SVG is generated client-side via DiceBear and inlined via
 * dangerouslySetInnerHTML — DiceBear output is from a trusted library
 * with no user-controlled HTML, so this is safe.
 */

import { useMemo } from "react";
import { generateDicebearAvatar, type AvatarOptions } from "@/lib/avatar/dicebear";

export type AvatarSource = "initials" | "dicebear" | "twitch" | "discord";

export interface UserAvatarUser {
  id: string;
  avatar_source?: AvatarSource | string | null;
  avatar_seed?: string | null;
  /** Per-feature overrides applied on top of the seed (Phase 2.1 customization). */
  avatar_options?: AvatarOptions | null;
  twitch_avatar?: string | null;
  discord_avatar?: string | null;
}

export interface UserAvatarProps {
  user: UserAvatarUser;
  /** Pixel size — sets both width and height. */
  size?: number;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function UserAvatar({ user, size = 40, alt = "", className, style }: UserAvatarProps) {
  const source = (user.avatar_source as AvatarSource | undefined) ?? "dicebear";
  const seed = user.avatar_seed?.trim() || user.id;
  const options = user.avatar_options ?? null;

  // Memo the SVG so repeated renders in long lists (tournament participants,
  // session lobbies) don't re-run DiceBear's generator on every paint.
  // Options object is fingerprinted via JSON to avoid memo invalidation when
  // a parent passes a fresh-but-equal options reference each render.
  const optionsKey = useMemo(() => (options ? JSON.stringify(options) : ""), [options]);
  const dicebearSvg = useMemo(
    () => generateDicebearAvatar(seed, options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seed, optionsKey]
  );

  const baseStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    overflow: "hidden",
    flexShrink: 0,
    display: "inline-block",
    ...style,
  };

  // External URL paths (Twitch / Discord profile images)
  if (source === "twitch" && user.twitch_avatar) {
    return (
      <img
        src={user.twitch_avatar}
        width={size}
        height={size}
        alt={alt}
        className={className}
        style={{ ...baseStyle, objectFit: "cover" }}
        loading="lazy"
      />
    );
  }
  if (source === "discord" && user.discord_avatar) {
    return (
      <img
        src={user.discord_avatar}
        width={size}
        height={size}
        alt={alt}
        className={className}
        style={{ ...baseStyle, objectFit: "cover" }}
        loading="lazy"
      />
    );
  }

  // DiceBear fallback (also handles legacy 'initials' source values)
  return (
    <span
      className={className}
      style={baseStyle}
      role="img"
      aria-label={alt}
      dangerouslySetInnerHTML={{ __html: dicebearSvg }}
    />
  );
}
