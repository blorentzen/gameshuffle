/**
 * Players page addresses (round 2, 1A): /time-trials/players/<username> for accounts with a public
 * profile, /time-trials/players/u-<id> for other accounts and /time-trials/players/i-<id> for Discord
 * players without an account. /time-trials/players/me is your own. Client-safe.
 */

export function playerPagePath(player: string, profile: string | null): string {
  const m = profile?.match(/^\/u\/([^/?#]+)/);
  if (m) return `/time-trials/players/${m[1]}`;
  if (player.startsWith("u:")) return `/time-trials/players/u-${player.slice(2)}`;
  if (player.startsWith("i:")) return `/time-trials/players/i-${player.slice(2)}`;
  return "/time-trials";
}

export type PlayerSlug = { kind: "me" } | { kind: "key"; player: string } | { kind: "username"; username: string };

export function readPlayerSlug(slug: string): PlayerSlug | null {
  const s = decodeURIComponent(slug).trim();
  if (s === "me") return { kind: "me" };
  const k = s.match(/^([ui])-([0-9a-f-]{36})$/);
  if (k) return { kind: "key", player: `${k[1]}:${k[2]}` };
  if (/^[a-z0-9_.-]{2,40}$/i.test(s)) return { kind: "username", username: s.toLowerCase() };
  return null;
}
