import "server-only";

/**
 * The viewer behind an extension token. Anonymous until they share their
 * Twitch id (Twitch.ext.actions.requestIdShare); after that they're the same
 * player as in chat: the `twitch` identity keyed by their Twitch user id, so
 * the same tokens, scores and answers. If that Twitch account is linked to a
 * GameShuffle account, `accountUserId` is it (bingo cards and draft captains
 * already know accounts, so /live and the extension share one card).
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { resolveIdentity } from "@/lib/economy/identity";
import type { ExtClaims } from "./jwt";
import { twitchName } from "./context";

export interface ExtViewer {
  platform: "twitch";
  /** Twitch user id. */
  viewer: string;
  name: string;
  accountUserId: string | null;
}

const known = new Map<string, { at: number; value: ExtViewer }>();

export async function extViewer(claims: ExtClaims): Promise<ExtViewer | null> {
  const id = claims.user_id;
  if (!id) return null;
  const hit = known.get(id);
  if (hit && Date.now() - hit.at < 300_000) return hit.value;
  const svc = createServiceClient();
  const [{ data: ident }, { data: acct }] = await Promise.all([
    svc.from("gs_identities").select("display_name").eq("platform", "twitch").eq("platform_id", id).maybeSingle(),
    svc.from("users").select("id").eq("twitch_id", id).maybeSingle(),
  ]);
  const name = ((ident as { display_name: string | null } | null)?.display_name || (await twitchName(id))).slice(0, 40);
  const value: ExtViewer = { platform: "twitch", viewer: id, name, accountUserId: (acct as { id: string } | null)?.id ?? null };
  known.set(id, { at: Date.now(), value });
  if (known.size > 5000) known.delete(known.keys().next().value!);
  return value;
}

/** The viewer's chat identity (made on first play, like a first chat message). */
export async function extIdentityId(v: ExtViewer): Promise<string> {
  const r = await resolveIdentity({ platform: "twitch", platformId: v.viewer, displayName: v.name });
  return r.identityId;
}
