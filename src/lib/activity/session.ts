/**
 * The Discord Activity's own session (server only).
 *
 * Inside Discord the page is served from <app id>.discordsays.com in a
 * third-party iframe, so gameshuffle.co's Supabase cookies never arrive. After
 * the Discord sign-in exchange (/api/activity/token) we hand the page a short
 * signed token instead, sent back as `Authorization: Bearer …` on every
 * /api/activity/* call. It names the Discord user, their gs_identity (Daily
 * results and Chat Brain answers are keyed to it) and the GameShuffle account
 * that signs in with that Discord user, when there is one.
 *
 * Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256). The key is
 * ACTIVITY_SESSION_SECRET, or one derived from the service role key so nothing
 * new has to be configured.
 */

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export interface ActivitySession {
  /** Discord user id. */
  did: string;
  /** gs_identities id for that Discord user. */
  iid: string;
  /** GameShuffle account signed in with that Discord user, if any. */
  uid: string | null;
  /** Display name, for the header. */
  name: string;
  /** Discord avatar hash, if set. */
  avatar: string | null;
  /** The server channel and server this launch is in, as Discord confirmed it (the results card); absent in DMs. */
  cid?: string | null;
  gid?: string | null;
  /** Expiry, seconds since epoch. */
  exp: number;
}

/** Long enough for an evening of play; a relaunch signs in again silently. */
export const SESSION_SECONDS = 12 * 60 * 60;

function key(): string {
  const own = process.env.ACTIVITY_SESSION_SECRET;
  if (own) return own;
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error("ACTIVITY_SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY must be set");
  return createHmac("sha256", base).update("gs-discord-activity-session").digest("base64url");
}

function mac(body: string): string {
  return createHmac("sha256", key()).update(body).digest("base64url");
}

export function signSession(s: Omit<ActivitySession, "exp">, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...s, exp: Math.floor(now / 1000) + SESSION_SECONDS })).toString("base64url");
  return `${body}.${mac(body)}`;
}

export function verifySession(token: string | null | undefined, now = Date.now()): ActivitySession | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const a = Buffer.from(sig), b = Buffer.from(mac(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ActivitySession;
    if (!s.did || !s.iid || typeof s.exp !== "number" || s.exp * 1000 < now) return null;
    return s;
  } catch {
    return null;
  }
}

/** The session on a request, from its Bearer header. */
export function sessionFrom(req: Request): ActivitySession | null {
  const h = req.headers.get("authorization") ?? "";
  return verifySession(h.startsWith("Bearer ") ? h.slice(7) : null);
}
