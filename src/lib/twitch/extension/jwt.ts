import "server-only";

/**
 * The Twitch extension's signed token (HS256, signed with the extension's
 * secret from the Twitch developer console, base64-encoded). Twitch hands it
 * to the extension in `onAuthorized`; the extension sends it as a Bearer token
 * and the routes under /api/twitch-ext/* check it here.
 *
 * Claims: `channel_id` (the stream the extension is on), `opaque_user_id`
 * ("U…" signed in, "A…" anonymous), `user_id` only once the viewer has shared
 * their Twitch id, and `role` (broadcaster, moderator, viewer, external).
 *
 * In development, without TWITCH_EXTENSION_SECRET, a fixed local secret lets
 * the extension's local stand-in sign its own tokens (/api/twitch-ext/dev-token).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export type ExtRole = "broadcaster" | "moderator" | "viewer" | "external";

export interface ExtClaims {
  exp: number;
  channel_id: string;
  opaque_user_id: string;
  user_id?: string;
  role: ExtRole;
  is_unlinked?: boolean;
  pubsub_perms?: { listen?: string[]; send?: string[] };
}

const DEV_SECRET = Buffer.from("gameshuffle-extension-local-dev-secret").toString("base64");

/** The extension secret, or null when it isn't set (outside development). */
export function extSecret(): Buffer | null {
  const raw = process.env.TWITCH_EXTENSION_SECRET;
  if (raw) return Buffer.from(raw, "base64");
  return process.env.NODE_ENV === "development" ? Buffer.from(DEV_SECRET, "base64") : null;
}

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/** Signs claims with the extension secret (the local stand-in, and Extension PubSub messages). */
export function signExtToken(claims: Record<string, unknown>): string | null {
  const secret = extSecret();
  if (!secret) return null;
  const head = b64url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64url(Buffer.from(JSON.stringify(claims)));
  const sig = b64url(createHmac("sha256", secret).update(`${head}.${body}`).digest());
  return `${head}.${body}.${sig}`;
}

/** A valid, unexpired extension token's claims, or null. */
export function verifyExtToken(token: string | null | undefined, now = Date.now()): ExtClaims | null {
  const secret = extSecret();
  if (!secret || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  try {
    const header = JSON.parse(fromB64url(head).toString("utf8")) as { alg?: string };
    if (header.alg !== "HS256") return null;
    const want = createHmac("sha256", secret).update(`${head}.${body}`).digest();
    const got = fromB64url(sig);
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
    const claims = JSON.parse(fromB64url(body).toString("utf8")) as Partial<ExtClaims>;
    if (typeof claims.exp !== "number" || claims.exp * 1000 < now) return null;
    if (typeof claims.channel_id !== "string" || !/^\d{1,20}$/.test(claims.channel_id)) return null;
    if (typeof claims.opaque_user_id !== "string") return null;
    if (claims.user_id !== undefined && (typeof claims.user_id !== "string" || !/^\d{1,20}$/.test(claims.user_id))) return null;
    const role = claims.role;
    if (role !== "broadcaster" && role !== "moderator" && role !== "viewer" && role !== "external") return null;
    return claims as ExtClaims;
  } catch {
    return null;
  }
}

/** The claims from a request's `Authorization: Bearer …` header. */
export function claimsFrom(req: Request): ExtClaims | null {
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return m ? verifyExtToken(m[1]) : null;
}
