"use client";

/**
 * Hook for "what should chrome render as the user's identity?".
 *
 * Returns:
 *   - `{ kind: "real", ... }` — show the real user's identity (default)
 *   - `{ kind: "fixture", ... }` — show the impersonation fixture (staff
 *     impersonating a tier)
 *   - `{ kind: "unauth" }` — render the logged-out variant of chrome
 *     (staff viewing-as-unauthenticated; UserMenu shows "Log In", etc.)
 *
 * Server-side identity (auth.uid(), RLS, ownership) is unaffected by
 * this hook. It exists purely so chrome doesn't leak the staff member's
 * real name/avatar during demo / dogfooding / support-shadowing sessions.
 *
 * Per gs-staff-tier-impersonation-spec.md follow-up.
 */

import type { User } from "@supabase/supabase-js";
import type { AvatarSource, UserAvatarUser } from "@/components/UserAvatar";
import { useImpersonation } from "@/components/staff/ImpersonationContext";

export interface DisplayIdentityRealUser {
  /** Real Supabase user — pass through whatever you have. */
  user: User;
  /** Profile snapshot the caller already has (avatar bits + display_name). */
  profile?: {
    avatar_source?: AvatarSource | string | null;
    avatar_seed?: string | null;
    avatar_options?: Record<string, string> | null;
    discord_avatar?: string | null;
    twitch_avatar?: string | null;
  } | null;
}

export type DisplayIdentity =
  | {
      kind: "real";
      displayName: string;
      email: string | null;
      avatarUser: UserAvatarUser;
    }
  | {
      kind: "fixture";
      displayName: string;
      email: string;
      avatarUser: UserAvatarUser;
    }
  | { kind: "unauth" };

/**
 * Resolve the identity to display in chrome. Pass the real user + their
 * profile snapshot; the hook layers the impersonation context on top.
 *
 * If `user` is null and impersonation isn't active, returns `unauth` so
 * chrome can render the logged-out state. Callers can also pass the real
 * user with no profile and still get a sensible fallback.
 */
export function useDisplayIdentity(input: {
  user: User | null;
  profile?: DisplayIdentityRealUser["profile"];
}): DisplayIdentity {
  const { state, fixture, isViewingAsUnauth } = useImpersonation();

  // Staff viewing-as-unauthenticated → render logged-out chrome.
  if (isViewingAsUnauth) return { kind: "unauth" };

  // Staff viewing-as-tier → render the fixture identity.
  if (state.kind === "tier" && fixture) {
    return {
      kind: "fixture",
      displayName: fixture.displayName,
      email: fixture.email,
      avatarUser: {
        // The synthetic user_id below is purely for DiceBear's seed
        // fallback. It never travels to the server, never appears in any
        // ownership check, and never gets persisted.
        id: `impersonation:${state.tier}`,
        avatar_source: fixture.avatarSource,
        avatar_seed: fixture.avatarSeed,
        avatar_options: null,
        discord_avatar: null,
        twitch_avatar: null,
      },
    };
  }

  // Default: render the real user's identity.
  if (!input.user) return { kind: "unauth" };

  const realDisplayName =
    (input.user.user_metadata?.display_name as string | undefined) ||
    input.user.email?.split("@")[0] ||
    "User";

  return {
    kind: "real",
    displayName: realDisplayName,
    email: input.user.email ?? null,
    avatarUser: {
      id: input.user.id,
      avatar_source: input.profile?.avatar_source ?? "dicebear",
      avatar_seed: input.profile?.avatar_seed ?? null,
      avatar_options:
        (input.profile?.avatar_options as
          | Record<string, string>
          | null
          | undefined) ?? null,
      twitch_avatar: input.profile?.twitch_avatar ?? null,
      discord_avatar: input.profile?.discord_avatar ?? null,
    },
  };
}
