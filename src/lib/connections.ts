/**
 * Unified "Connection" view per gs-connections-architecture.md §4.1.
 *
 * Combines data from three sources:
 *   - auth.identities (Supabase OAuth — sign-in identity)
 *   - public.users (display avatar URLs, gamertag visibility)
 *   - public.twitch_connections (streamer-scope integration row)
 *
 * Used by:
 *   - GET /api/account/connections (the canonical Profile-tab Connections card)
 *   - Sign-in Methods read-only summary (Security tab)
 *   - Integrations tab three-state Twitch card (future refactor)
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

export type ConnectionProvider = "discord" | "twitch";

export const ALL_CONNECTION_PROVIDERS: ConnectionProvider[] = ["discord", "twitch"];

export interface ConnectionRoles {
  /** Listed in auth.identities — the user can sign in via this provider. */
  signIn: boolean;
  /** Avatar URL is on file and selectable in the avatar picker. */
  profileDisplay: boolean;
  /** twitch_connections row exists with the streamer scope bundle (Twitch only today). */
  streamerIntegration: boolean;
}

export interface Connection {
  provider: ConnectionProvider;
  isLinked: boolean;
  /** Supabase identity id (for unlink calls). Null if not linked. */
  authIdentityId: string | null;
  /** External login (e.g. "blorentz") — pulled from identity_data. */
  externalUsername: string | null;
  externalDisplayName: string | null;
  externalAvatarUrl: string | null;
  roles: ConnectionRoles;
  /** True when removing this connection is safe (user retains a sign-in path). */
  canDisconnect: boolean;
}

export interface AccountConnectionsView {
  hasPassword: boolean;
  email: string | null;
  connections: Connection[];
}

/**
 * Best-effort identity-data extraction. OAuth providers each name fields
 * differently — Discord uses `username`/`global_name`, Twitch uses
 * `preferred_username`/`name`/`full_name`.
 */
function pickName(d: Record<string, unknown> | undefined, keys: string[]): string | null {
  if (!d) return null;
  for (const k of keys) {
    const v = d[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

/**
 * Resolve every known provider's connection state for `userId`.
 *
 * Always returns the full ALL_CONNECTION_PROVIDERS list — providers the
 * user hasn't linked appear with `isLinked: false` so the UI can render
 * a "Connect" affordance for each.
 */
export async function getConnections(userId: string): Promise<AccountConnectionsView> {
  const admin = createServiceClient();

  const [adminView, profileRes, twitchConnRes] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin
      .from("users")
      .select("discord_avatar, twitch_avatar")
      .eq("id", userId)
      .maybeSingle(),
    admin
      .from("twitch_connections")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (adminView.error || !adminView.data?.user) {
    throw new Error(`[connections] admin lookup failed: ${adminView.error?.message ?? "no user"}`);
  }
  const adminUser = adminView.data.user;

  const appProviders = Array.isArray(adminUser.app_metadata?.providers)
    ? (adminUser.app_metadata!.providers as string[])
    : [];
  const hasPassword = appProviders.includes("email");
  const identities = adminUser.identities ?? [];

  const profile = (profileRes.data as { discord_avatar: string | null; twitch_avatar: string | null } | null) ?? null;
  const hasStreamerIntegration = !!twitchConnRes.data?.id;

  // For each known provider, build the unified view.
  const connections: Connection[] = ALL_CONNECTION_PROVIDERS.map((provider) => {
    const identity = identities.find((i) => i.provider === provider);
    const isLinked = !!identity;
    const data = (identity?.identity_data ?? undefined) as Record<string, unknown> | undefined;

    const externalUsername =
      provider === "discord"
        ? pickName(data, ["username", "preferred_username", "name"])
        : pickName(data, ["preferred_username", "login", "name"]);
    const externalDisplayName =
      provider === "discord"
        ? pickName(data, ["global_name", "full_name", "name", "username"])
        : pickName(data, ["name", "display_name", "full_name", "preferred_username"]);

    const externalAvatarUrl =
      provider === "discord"
        ? profile?.discord_avatar ?? pickName(data, ["avatar_url", "picture"])
        : profile?.twitch_avatar ?? pickName(data, ["avatar_url", "picture"]);

    const roles: ConnectionRoles = {
      signIn: isLinked,
      profileDisplay: !!externalAvatarUrl,
      streamerIntegration: provider === "twitch" ? hasStreamerIntegration : false,
    };

    // Safe to disconnect when the user retains another way to sign in:
    // either a password, OR another OAuth provider beyond this one.
    const otherSignInExists =
      hasPassword || identities.some((i) => i.provider !== provider);
    const canDisconnect = isLinked && otherSignInExists;

    return {
      provider,
      isLinked,
      authIdentityId: identity?.identity_id ?? identity?.id ?? null,
      externalUsername,
      externalDisplayName,
      externalAvatarUrl,
      roles,
      canDisconnect,
    };
  });

  return {
    hasPassword,
    email: adminUser.email ?? null,
    connections,
  };
}
