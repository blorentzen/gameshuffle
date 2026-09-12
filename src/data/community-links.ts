/**
 * Community links — the creator-managed "where to find us / where we go live"
 * links shown on a community's /c home. Distinct from profile `socials`
 * (personal content handles): these are the channel's live + community
 * destinations, so viewers can find a creator wherever they broadcast.
 *
 * Icon keys reuse PLATFORM_ICONS (src/components/PlatformIcon.tsx) where they
 * exist; the rest fall back to a generic link glyph. Stored as full URLs.
 */

export interface CommunityLink {
  platform: string;
  url: string;
}

export const COMMUNITY_LINK_PLATFORMS = [
  { key: "twitch", label: "Twitch", placeholder: "https://twitch.tv/yourchannel" },
  { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/@yourchannel" },
  { key: "kick", label: "Kick", placeholder: "https://kick.com/yourchannel" },
  { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@yourhandle" },
  { key: "discord", label: "Discord", placeholder: "https://discord.gg/your-invite" },
  { key: "twitter", label: "Twitter / X", placeholder: "https://x.com/yourhandle" },
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/yourhandle" },
  { key: "website", label: "Website", placeholder: "https://yoursite.com" },
] as const;

export type CommunityLinkPlatform = (typeof COMMUNITY_LINK_PLATFORMS)[number]["key"];

export const COMMUNITY_LINK_LABEL: Record<string, string> = Object.fromEntries(
  COMMUNITY_LINK_PLATFORMS.map((p) => [p.key, p.label]),
);

const MAX_LINKS = 8;

/** Validate + normalize a links array from untrusted input. Keeps only known
 *  platforms with a valid http(s) URL, dedupes by platform, caps the count. */
export function sanitizeCommunityLinks(input: unknown): CommunityLink[] {
  if (!Array.isArray(input)) return [];
  const known = new Set(COMMUNITY_LINK_PLATFORMS.map((p) => p.key as string));
  const seen = new Set<string>();
  const out: CommunityLink[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const platform = String((raw as { platform?: unknown }).platform ?? "").trim();
    let url = String((raw as { url?: unknown }).url ?? "").trim();
    if (!known.has(platform) || seen.has(platform) || !url) continue;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
    } catch {
      continue;
    }
    seen.add(platform);
    out.push({ platform, url });
    if (out.length >= MAX_LINKS) break;
  }
  return out;
}
