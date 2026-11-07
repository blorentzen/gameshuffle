/**
 * Server replies (/gs-tag and Streaming ▸ Discord bot ▸ Server replies) share one set of rules, so a reply made in one
 * place can always be used and edited in the other (they differed until 2026-11-05: 80 characters in Discord, 32 on
 * the web). Client-safe.
 */

/** Lowercase letters and numbers first, then letters, numbers, spaces, dashes or underscores; 32 characters at most. */
export const TAG_NAME = /^[a-z0-9][a-z0-9 _-]{0,31}$/;
export const TAG_NAME_MAX = 32;
/** What the bot posts. Under Discord's 2,000-character message limit, with room to spare. */
export const TAG_CONTENT_MAX = 1900;
export const TAG_NAME_RULE = "Names are up to 32 lowercase letters, numbers, spaces, dashes or underscores.";

export const tidyTagName = (raw: unknown) => String(raw ?? "").trim().toLowerCase();
