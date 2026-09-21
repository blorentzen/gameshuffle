/**
 * Profile status + now-playing for /u. Client-safe.
 *
 * SECURITY: plain-text only, length-capped. React escapes the values on render;
 * no URLs, no markup, no keys — nothing to inject. Normalize on read and write.
 */

const STATUS_MAX = 120;
const GAME_MAX = 60;

function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  // Drop control chars (incl. newlines), collapse whitespace, trim, cap length,
  // so a status stays a single tidy line with nothing exotic in it.
  const stripped = Array.from(v)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
    .join("");
  const s = stripped.replace(/\s+/g, " ").trim().slice(0, max);
  return s || null;
}

export function resolveProfileStatus(v: unknown): string | null {
  return cleanText(v, STATUS_MAX);
}

export function resolveNowPlaying(v: unknown): string | null {
  return cleanText(v, GAME_MAX);
}
