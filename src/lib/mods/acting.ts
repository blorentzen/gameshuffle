/**
 * Whose stream a request acts on: the signed-in account's own, or, for a
 * mod with Full access, the streamer whose mod page they're on.
 *
 * A mod's page (/mod/<streamer>) reuses the stream hub's controls (rolls,
 * picks and bans, overlay tools, live games). Those controls and their
 * routes act on "the signed-in streamer", so instead of threading a
 * streamer id through every call, the checks behind them ask
 * `streamOwnerFor(userId)`:
 *
 *   - Server actions post to the page they're called from, and the
 *     middleware stamps every page request with `x-pathname` (overwriting
 *     anything the browser sent), so an action fired on /mod/nova says so.
 *   - Fetches to /api/* carry the page as their Referer (the site's
 *     Referrer-Policy sends the full URL to our own origin).
 *
 * Either way the page only names a streamer: access comes from the
 * database (an active `streamer_mods` row with `access = 'full'`), so a
 * forged header can only reach a streamer the caller already runs streams
 * for. Anyone else, and every other page, acts on their own account.
 *
 * Ending, editing or restarting the stream never goes through this: those
 * actions keep checking the signed-in owner.
 */

import "server-only";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/admin";

/** A mod page: /mod/<slug> and nothing deeper (/mod/join/x and /mod/invite/x are other pages). */
const MOD_PAGE = /^\/mod\/([^/]+)\/?$/;

export type ModAccess = "standard" | "full";

/** The streamer slug of the mod page this request came from, if any. */
async function modPageSlug(): Promise<string | null> {
  let h: Headers;
  try {
    h = await headers();
  } catch {
    return null; // outside a request (scripts, crons)
  }
  const fromPath = h.get("x-pathname")?.match(MOD_PAGE)?.[1];
  if (fromPath) return decodeURIComponent(fromPath);
  const referer = h.get("referer");
  if (!referer) return null;
  try {
    const url = new URL(referer);
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host && url.host !== host) return null;
    const slug = url.pathname.match(MOD_PAGE)?.[1];
    return slug ? decodeURIComponent(slug) : null;
  } catch {
    return null;
  }
}

/** Streamer account for a /live or /mod slug: the GameShuffle handle first, then the Twitch login. */
export async function streamerIdForSlug(slug: string): Promise<string | null> {
  const admin = createServiceClient();
  const { data } = await admin.from("users").select("id").eq("username", slug.toLowerCase()).maybeSingle();
  if (data) return (data as { id: string }).id;
  const { data: byTwitch } = await admin.from("users").select("id").eq("twitch_username", slug).maybeSingle();
  return (byTwitch as { id: string } | null)?.id ?? null;
}

/**
 * A mod's access for a streamer: null when they aren't an active mod.
 * Before supabase/mod-access-m1.sql runs every active mod reads as standard.
 */
export async function modAccess(streamerUserId: string, userId: string): Promise<ModAccess | null> {
  const admin = createServiceClient();
  const row = (columns: string) =>
    admin.from("streamer_mods").select(columns).eq("streamer_user_id", streamerUserId).eq("gs_user_id", userId).eq("status", "active").limit(1);
  const { data, error } = await row("access");
  if (error) {
    const { data: plain } = await row("id");
    return plain && plain.length ? "standard" : null;
  }
  const access = (data as unknown as { access: string }[] | null)?.[0]?.access;
  if (!access) return null;
  return access === "full" ? "full" : "standard";
}

export interface StreamOwner {
  /** The account whose stream this acts on (every write uses it). */
  ownerUserId: string;
  /** True when a Full-access mod is acting for that streamer. */
  viaMod: boolean;
}

/** Whose stream the signed-in `userId` is acting on for this request. */
export async function streamOwnerFor(userId: string): Promise<StreamOwner> {
  const self: StreamOwner = { ownerUserId: userId, viaMod: false };
  const slug = await modPageSlug();
  if (!slug) return self;
  const streamerId = await streamerIdForSlug(slug);
  if (!streamerId || streamerId === userId) return self;
  return (await modAccess(streamerId, userId)) === "full" ? { ownerUserId: streamerId, viaMod: true } : self;
}

/** How a mod is named on the overlay and in chat ("Sam (mod)"), from their profile. */
export async function modLabel(userId: string): Promise<string> {
  const { data } = await createServiceClient().from("users").select("display_name, username, twitch_username").eq("id", userId).maybeSingle();
  const p = data as { display_name: string | null; username: string | null; twitch_username: string | null } | null;
  const name = p?.display_name || p?.twitch_username || p?.username || "A mod";
  return `${name} (mod)`;
}
