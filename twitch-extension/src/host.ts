/**
 * The extension's one link to Twitch: the Extension Helper (Twitch.ext) when it
 * runs inside Twitch, a stand-in everywhere else (local testing against the dev
 * server), so the rest of the app never checks where it is.
 *
 * Twitch hands us a signed token (onAuthorized) naming the channel and the
 * viewer. Viewers are anonymous until they share their Twitch id; the first
 * time they play, `requestShare` asks Twitch to show its share prompt, and on a
 * yes Twitch calls onAuthorized again with a token that carries their id.
 *
 * Local stand-in: http://localhost:8788/card.html?channel=196723 plays as an
 * anonymous viewer on Nova's dev channel; add &user=<Twitch id> to play as a
 * viewer who already shared, &role=broadcaster for the streamer. "Share" in the
 * stand-in switches to user 700000001 (a made-up viewer).
 */

// Replaced at build time by scripts/build-twitch-extension.ts (esbuild define).
export const BASE = process.env.GS_API_BASE ?? "https://www.gameshuffle.co";

export interface ExtAuth {
  channelId: string;
  token: string;
  /** Twitch's opaque id: "U…" signed in to Twitch, "A…" logged out. */
  opaqueId: string;
  /** The viewer's real Twitch id once they've shared it, else null. */
  userId: string | null;
  role: "broadcaster" | "moderator" | "viewer" | "external";
}

interface TwitchAuth { channelId: string; clientId: string; token: string; userId: string; helixToken?: string }
interface TwitchExt {
  onAuthorized(cb: (auth: TwitchAuth) => void): void;
  onContext(cb: (ctx: { theme?: "light" | "dark"; mode?: string }, changed: string[]) => void): void;
  onVisibilityChanged(cb: (visible: boolean) => void): void;
  viewer: { id: string | null; opaqueId: string; role: string; isLinked: boolean };
  actions: { requestIdShare(): void };
}

declare global {
  interface Window { Twitch?: { ext?: TwitchExt } }
}

export interface ExtHost {
  inTwitch: boolean;
  /** Calls back with every new token (first load, after a share, on refresh). */
  onAuth(cb: (auth: ExtAuth) => void): void;
  /** False while the card is closed or the tab is hidden: stop asking the server then. */
  onVisible(cb: (visible: boolean) => void): void;
  /** Asks Twitch to share the viewer's id. False when the viewer isn't logged in to Twitch. */
  requestShare(): boolean;
}

/** The role and shared id inside the token (Twitch puts them there; the helper's own copy can lag a token behind). */
function claimsOf(token: string): { role: ExtAuth["role"]; userId: string | null } {
  try {
    const body = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { role?: string; user_id?: string };
    const role = body.role === "broadcaster" || body.role === "moderator" || body.role === "external" ? body.role : "viewer";
    return { role, userId: typeof body.user_id === "string" && body.user_id ? body.user_id : null };
  } catch {
    return { role: "viewer", userId: null };
  }
}

function twitchHost(ext: TwitchExt): ExtHost {
  return {
    inTwitch: true,
    onAuth(cb) {
      ext.onAuthorized((a) => cb({ channelId: a.channelId, token: a.token, opaqueId: a.userId, ...claimsOf(a.token) }));
    },
    onVisible(cb) { ext.onVisibilityChanged((v) => cb(v)); },
    requestShare() {
      if (!ext.viewer.opaqueId?.startsWith("U")) return false;
      ext.actions.requestIdShare();
      return true;
    },
  };
}

function localHost(): ExtHost {
  const q = new URLSearchParams(location.search);
  const channel = q.get("channel") ?? "196723";
  const role = q.get("role") ?? "viewer";
  let user = q.get("user") ?? "";
  let listener: ((a: ExtAuth) => void) | null = null;
  const fetchToken = async () => {
    const res = await fetch(`${BASE}/api/twitch-ext/dev-token?${new URLSearchParams({ channel, user, role })}`);
    const d = (await res.json().catch(() => null)) as { ok?: boolean; token?: string; userId?: string } | null;
    if (!d?.ok || !d.token) { console.error("[extension] the dev server didn't sign a token (is it running?)"); return; }
    listener?.({ channelId: channel, token: d.token, opaqueId: d.userId ?? "ATESTVIEWER", ...claimsOf(d.token) });
  };
  return {
    inTwitch: false,
    onAuth(cb) { listener = cb; void fetchToken(); },
    onVisible(cb) { document.addEventListener("visibilitychange", () => cb(document.visibilityState === "visible")); },
    requestShare() {
      user = user || "700000001";
      void fetchToken();
      return true;
    },
  };
}

let made: ExtHost | null = null;
export function extHost(): ExtHost {
  if (made) return made;
  // The helper script defines Twitch.ext anywhere it loads, so only trust it on Twitch's own host.
  const ext = typeof window !== "undefined" && location.hostname.endsWith(".ext-twitch.tv") ? window.Twitch?.ext : undefined;
  made = ext ? twitchHost(ext) : localHost();
  return made;
}
