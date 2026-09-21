/**
 * Profile link buttons + spotlight embed for /u. Client-safe.
 *
 * SECURITY:
 *  - Link URLs are accepted ONLY as `https:` (parsed with URL) — never
 *    `javascript:`/`data:`/etc. Labels are plain text (React escapes them).
 *  - The spotlight stores a `{kind, value}` where `value` is a PARSED ID
 *    (YouTube video id, Twitch channel name, or Twitch clip slug), never a raw
 *    URL. The embed URL is constructed by us from that id, so an attacker can't
 *    point an iframe at an arbitrary origin. Run the resolvers on read + write.
 */

export interface ProfileLink { label: string; url: string }
export const MAX_LINKS = 8;

const LABEL_MAX = 40;
const URL_MAX = 400;

/** An `https:` URL (parsed) within length, else null. The only link scheme. */
export function safeLinkUrl(v: unknown): string | null {
  if (typeof v !== "string" || v.length > URL_MAX) return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function resolveProfileLinks(raw: unknown): ProfileLink[] {
  if (!Array.isArray(raw)) return [];
  const out: ProfileLink[] = [];
  for (const item of raw) {
    if (out.length >= MAX_LINKS) break;
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const url = safeLinkUrl(obj.url);
    if (!url) continue;
    const label = (typeof obj.label === "string" ? obj.label : "").trim().slice(0, LABEL_MAX) || url.replace(/^https:\/\//, "").replace(/\/$/, "").slice(0, LABEL_MAX);
    out.push({ label, url });
  }
  return out;
}

// ── Spotlight ───────────────────────────────────────────────────────────────

export type SpotlightKind = "none" | "youtube" | "twitch_clip" | "twitch_channel";
export interface ProfileSpotlight { kind: SpotlightKind; value: string | null }
export const DEFAULT_SPOTLIGHT: ProfileSpotlight = { kind: "none", value: null };

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const TW_CHANNEL = /^[A-Za-z0-9_]{3,25}$/;
const TW_CLIP = /^[A-Za-z0-9_-]{4,120}$/;

/** Pull the id/slug/name out of a pasted URL or bare value for a given kind. */
export function parseSpotlightInput(kind: SpotlightKind, input: string): string | null {
  const raw = (input || "").trim();
  if (!raw) return null;
  if (kind === "youtube") {
    if (YT_ID.test(raw)) return raw;
    try {
      const u = new URL(raw);
      const v = u.searchParams.get("v");
      if (v && YT_ID.test(v)) return v;
      const seg = u.pathname.split("/").filter(Boolean).pop() ?? "";
      return YT_ID.test(seg) ? seg : null;
    } catch { return null; }
  }
  if (kind === "twitch_channel") {
    if (TW_CHANNEL.test(raw)) return raw;
    try { const seg = new URL(raw).pathname.split("/").filter(Boolean)[0] ?? ""; return TW_CHANNEL.test(seg) ? seg : null; } catch { return null; }
  }
  if (kind === "twitch_clip") {
    if (TW_CLIP.test(raw) && !raw.includes("/")) return raw;
    try {
      const u = new URL(raw);
      const seg = u.pathname.split("/").filter(Boolean).pop() ?? "";
      return TW_CLIP.test(seg) ? seg : null;
    } catch { return null; }
  }
  return null;
}

export function resolveProfileSpotlight(raw: unknown): ProfileSpotlight {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SPOTLIGHT };
  const obj = raw as Record<string, unknown>;
  const kind = obj.kind;
  const value = typeof obj.value === "string" ? obj.value : "";
  if (kind === "youtube" && YT_ID.test(value)) return { kind, value };
  if (kind === "twitch_channel" && TW_CHANNEL.test(value)) return { kind, value };
  if (kind === "twitch_clip" && TW_CLIP.test(value)) return { kind, value };
  return { ...DEFAULT_SPOTLIGHT };
}

/**
 * Build the embed URL from the validated {kind, value}. `parents` are the host
 * names the iframe is embedded on (required by Twitch). We construct the URL —
 * the stored value only ever contributes an id/slug/name.
 */
export function spotlightEmbedUrl(sp: ProfileSpotlight, parents: string[]): string | null {
  if (sp.kind === "none" || !sp.value) return null;
  if (sp.kind === "youtube") return `https://www.youtube-nocookie.com/embed/${sp.value}?rel=0`;
  const parentQs = parents.filter(Boolean).map((p) => `parent=${encodeURIComponent(p)}`).join("&");
  if (sp.kind === "twitch_channel") return `https://player.twitch.tv/?channel=${encodeURIComponent(sp.value)}&${parentQs}&autoplay=false&muted=true`;
  if (sp.kind === "twitch_clip") return `https://clips.twitch.tv/embed?clip=${encodeURIComponent(sp.value)}&${parentQs}&autoplay=false`;
  return null;
}
