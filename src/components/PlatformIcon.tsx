import { Icon } from "@empac/cascadeds";

/**
 * Shared platform glyphs — gamertag services + social platforms. Keys match
 * GAMERTAG_PLATFORMS.key (src/data/gamertag-types.ts) and SOCIAL_PLATFORMS.key
 * (src/data/socials-types.ts). Used in account settings and on public /u.
 */
export const PLATFORM_ICONS: Record<string, string> = {
  discord: "/images/icons/discord.svg",
  twitch: "/images/icons/twitch.svg",
  psn: "/images/icons/playstation.svg",
  nso: "/images/icons/nintendo-switch.svg",
  xbox: "/images/icons/xbox.svg",
  steam: "/images/icons/steam.svg",
  epic: "/images/icons/epic.svg",
  // Socials — same icon pattern, keys match SOCIAL_PLATFORMS.
  youtube: "/images/icons/youtube.svg",
  twitter: "/images/icons/twitter.svg",
  tiktok: "/images/icons/tiktok.svg",
  instagram: "/images/icons/instagram.svg",
  bluesky: "/images/icons/bluesky.svg",
  threads: "/images/icons/threads.svg",
  discord_invite: "/images/icons/discord.svg",
};

export function PlatformIcon({
  platform,
  size = 16,
  dim = true,
}: {
  platform: string;
  size?: number;
  dim?: boolean;
}) {
  const src = PLATFORM_ICONS[platform];
  if (src) {
    return (
      <img
        src={src}
        alt={platform}
        className="gs-platform-icon"
        style={{ width: size, height: size, flexShrink: 0, opacity: dim ? 0.6 : 1 }}
      />
    );
  }
  return <Icon name="link" size="16" />;
}
