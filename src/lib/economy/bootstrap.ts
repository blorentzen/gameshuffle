/**
 * Lazy bootstrap for a streamer's economy presence.
 *
 * The /twitch/modules + /twitch/commands management pages require
 * a gs_identities + gs_communities row pair. In production those
 * rows are created by webhook events (stream.online) or first chat
 * hits — but on localhost without Twitch webhooks reaching us,
 * neither has happened yet. The pages would 404.
 *
 * This helper resolves the signed-in user's Twitch identity (from
 * Supabase Auth's identities[] or twitch_connections), lazy-creates
 * the gs_identities row + gs_communities row with module + custom-
 * command defaults, and returns the resolved community.
 *
 * Returns null when:
 *   - The signed-in user has no Twitch OAuth identity AND no
 *     twitch_connections row (they haven't connected Twitch yet).
 *   - The community creation fails for any reason.
 */

import "server-only";
import type { User } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveIdentity } from "@/lib/economy/identity";
import { ensureCommunity } from "@/lib/economy/community";

export interface StreamerEconomyPresence {
  identityId: string;
  communityId: string;
  communitySlug: string;
  communityDisplayName: string | null;
}

export async function ensureStreamerEconomyPresence(
  user: User,
): Promise<StreamerEconomyPresence | null> {
  const admin = createServiceClient();

  // 1. Find the streamer's Twitch user id. Two possible sources:
  //    (a) auth.users.identities[] when they OAuth-signed-in via Twitch
  //    (b) twitch_connections (streamer integration flow)
  let twitchUserId: string | null = null;
  let twitchLogin: string | null = null;
  let twitchDisplayName: string | null = null;

  const oauthIdentity = (user.identities ?? []).find(
    (i) => i.provider === "twitch",
  );
  if (oauthIdentity) {
    const d = oauthIdentity.identity_data as Record<string, unknown> | undefined;
    twitchUserId =
      (d?.sub as string | undefined) ??
      (d?.provider_id as string | undefined) ??
      null;
    twitchLogin =
      (d?.preferred_username as string | undefined) ??
      (d?.nickname as string | undefined) ??
      null;
    twitchDisplayName = (d?.name as string | undefined) ?? null;
  }

  if (!twitchUserId) {
    const { data: conn } = await admin
      .from("twitch_connections")
      .select("twitch_user_id, twitch_login, twitch_display_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (conn) {
      const c = conn as {
        twitch_user_id: string;
        twitch_login: string | null;
        twitch_display_name: string | null;
      };
      twitchUserId = c.twitch_user_id;
      twitchLogin = c.twitch_login;
      twitchDisplayName = c.twitch_display_name;
    }
  }

  if (!twitchUserId) return null;

  // 2. Resolve the streamer's slug. Per /live convention: users.username
  //    first (canonical custom slug), twitch_username fallback,
  //    twitch_login from the connection as last resort.
  const { data: profile } = await admin
    .from("users")
    .select("username, twitch_username, display_name")
    .eq("id", user.id)
    .maybeSingle();
  const slug =
    ((profile?.username as string | null) ?? null) ||
    ((profile?.twitch_username as string | null) ?? null) ||
    twitchLogin ||
    twitchUserId;
  const displayName =
    ((profile?.display_name as string | null) ?? null) ||
    twitchDisplayName ||
    twitchLogin ||
    slug;

  // 3. Lazy-create the gs_identities row + fire the starting grant
  //    if first contact.
  const resolved = await resolveIdentity({
    platform: "twitch",
    platformId: twitchUserId,
    displayName,
  });

  // 4. Lazy-create the community. ensureCommunity also seeds the
  //    module catalog + custom-command defaults on first creation.
  const community = await ensureCommunity({
    ownerIdentityId: resolved.identityId,
    slug,
    displayName,
  });

  // 5. Idempotently ensure modules are seeded for this community
  //    (handles communities created before the modules migration).
  try {
    const { seedDefaultsForCommunity: seedModules } = await import(
      "@/lib/economy/modules/registry"
    );
    await seedModules(community.id);
  } catch (err) {
    console.error("[ensureStreamerEconomyPresence] modules seed failed", err);
  }

  // 6. Same for custom-command defaults.
  try {
    const { seedDefaultsForCommunity: seedCustomCommands } = await import(
      "@/lib/twitch/commands/customCommands"
    );
    await seedCustomCommands(community.id);
  } catch (err) {
    console.error("[ensureStreamerEconomyPresence] custom-command seed failed", err);
  }

  // 7. The streamer's gs_identities row should be LINKED to their
  //    auth.users.id. If the upgrade hasn't happened yet (e.g. they
  //    just signed in but the merge hook didn't run), do it now.
  try {
    const { upgradeIdentityToAccount } = await import("@/lib/economy/identity");
    await upgradeIdentityToAccount({
      identityId: resolved.identityId,
      gsAccountId: user.id,
    });
  } catch (err) {
    console.error("[ensureStreamerEconomyPresence] identity upgrade failed", err);
  }

  return {
    identityId: resolved.identityId,
    communityId: community.id,
    communitySlug: community.slug,
    communityDisplayName: community.display_name,
  };
}
