/**
 * Brand-colored badge for the platform a session is bound to.
 *
 * CDS Badge accepts a className, so we use the existing component but
 * override its background with the platform's official brand color
 * (per platform branding guidelines). Foreground is white for every
 * platform except Kick — its lime green needs a dark foreground for
 * legibility.
 *
 * Used in:
 *   - /hub session list cards (compact identifier of session platform)
 *   - /hub/sessions/[slug] platform connections section
 *   - Anywhere a platform identity needs to be visually obvious
 */

import { Badge } from "@empac/cascadeds";

export type PlatformIdentity = "twitch" | "discord" | "youtube" | "kick";

interface PlatformBadgeProps {
  platform: PlatformIdentity | string;
  size?: "small" | "default";
}

const PLATFORM_LABEL: Record<PlatformIdentity, string> = {
  twitch: "Twitch",
  discord: "Discord",
  youtube: "YouTube",
  kick: "Kick",
};

const PLATFORM_CLASS: Record<PlatformIdentity, string> = {
  twitch: "platform-badge platform-badge--twitch",
  discord: "platform-badge platform-badge--discord",
  youtube: "platform-badge platform-badge--youtube",
  kick: "platform-badge platform-badge--kick",
};

function isKnownPlatform(value: string): value is PlatformIdentity {
  return value === "twitch" || value === "discord" || value === "youtube" || value === "kick";
}

export function PlatformBadge({ platform, size = "small" }: PlatformBadgeProps) {
  if (!isKnownPlatform(platform)) {
    return (
      <Badge variant="default" size={size}>
        {platform}
      </Badge>
    );
  }
  return (
    <Badge variant="default" size={size} className={PLATFORM_CLASS[platform]}>
      {PLATFORM_LABEL[platform]}
    </Badge>
  );
}
