/**
 * Streamer-profile social handles. Distinct from `Gamertags` —
 * gamertags are gaming-platform IDs (PSN, NSO, etc.); socials are
 * content platforms (YouTube, Twitter/X, etc.). Both serve as
 * source data for custom-command template variables.
 *
 * Signup/login stays Twitch + Discord + email. Socials are profile
 * metadata only — never used as auth identities.
 *
 * Adding a new platform requires:
 *   1. New key on the `Socials` interface
 *   2. New row in `SOCIAL_PLATFORMS`
 *   3. New branch in `resolveProfileVar` (src/lib/twitch/commands/customCommands.ts)
 *   4. New chip in the modal's Socials picker
 */

export interface Socials {
  youtube?: string;
  twitter?: string;
  tiktok?: string;
  instagram?: string;
  bluesky?: string;
  threads?: string;
}

export const SOCIAL_PLATFORMS = [
  { key: "youtube", label: "YouTube", placeholder: "@channel-handle" },
  { key: "twitter", label: "Twitter / X", placeholder: "@handle" },
  { key: "tiktok", label: "TikTok", placeholder: "@handle" },
  { key: "instagram", label: "Instagram", placeholder: "@handle" },
  { key: "bluesky", label: "Bluesky", placeholder: "@handle.bsky.social" },
  { key: "threads", label: "Threads", placeholder: "@handle" },
] as const;

export type SocialPlatformKey = (typeof SOCIAL_PLATFORMS)[number]["key"];
