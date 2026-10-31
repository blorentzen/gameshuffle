import "server-only";

/**
 * Who is adding or looking up a time: a signed-in account on the site, or a
 * Discord player (their account when Discord is linked to one, else their chat
 * identity, like the dailies' `i:` players).
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveIdentity } from "@/lib/economy/identity";
import { accountForDiscord } from "@/lib/daily/results";
import { ttPlayer, type TtPlayer } from "./rules";

export interface TtActor {
  player: TtPlayer; userId: string | null; identityId: string | null; name: string;
  /** Site only: whether the account has Discord connected (without it, /gs-tt times and server boards don't join up). */
  discordLinked?: boolean;
}

/** The signed-in account, or null. */
export async function siteActor(): Promise<TtActor | null> {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return null;
  return { player: ttPlayer("u", user.id), userId: user.id, identityId: null, name: "", discordLinked: (user.identities ?? []).some((i) => i.provider === "discord") };
}

/** A Discord user as a time trial player. */
export async function discordActor(user: { id: string; username: string; global_name?: string | null }): Promise<TtActor> {
  const name = (user.global_name || user.username || "A Discord player").slice(0, 80);
  const account = await accountForDiscord(user.id);
  if (account) return { player: ttPlayer("u", account), userId: account, identityId: null, name };
  const { identityId } = await resolveIdentity({ platform: "discord", platformId: user.id, displayName: name });
  return { player: ttPlayer("i", identityId), userId: null, identityId, name };
}

/**
 * The names the signed-in person might go by on a Quaxly list (3A): GameShuffle display name and
 * username, and their Discord display name and username when Discord is connected.
 */
export async function siteNames(): Promise<string[]> {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return [];
  const { data } = await createServiceClient().from("users").select("display_name, username, discord_username, gamertags").eq("id", user.id).maybeSingle();
  const u = data as { display_name: string | null; username: string | null; discord_username?: string | null; gamertags?: { discord?: string } | null } | null;
  const discord = (user.identities ?? []).find((i) => i.provider === "discord")?.identity_data as { full_name?: string; name?: string; custom_claims?: { global_name?: string } } | undefined;
  const names = [u?.display_name, u?.username, u?.discord_username, u?.gamertags?.discord, discord?.custom_claims?.global_name, discord?.full_name, discord?.name?.replace(/#0$/, "")];
  return [...new Set(names.filter((n): n is string => !!n && n.trim().length > 0))];
}
