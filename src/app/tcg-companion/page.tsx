import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { isBetaModeOn } from "@/lib/companion/beta";
import {
  effectiveTier,
  hasCapability,
  normalizeTier,
  type SubscriptionTier,
} from "@/lib/subscription";
import type { CompanionSavedState } from "@/lib/companion/saveStates";
import { CompanionShell } from "./CompanionShell";

export const metadata: Metadata = {
  title: "TCG Companion",
  description:
    "A TCG-agnostic digital accessory kit — damage counters, condition tracking, prize counts, coin flips, and dice for the table. Ships with Pokémon Mode.",
  // Beta-only surface — keep it out of crawls until launch.
  robots: { index: false, follow: false },
};

/**
 * Server entry for /companion.
 *
 * Reads auth state + the COMPANION_BETA_MODE env flag and passes the
 * resolved facts down to the client shell. The actual gate-vs-board
 * decision happens in <CompanionShell> because it depends on
 * localStorage (`gs_companion_beta_access`) and sessionStorage
 * (`gs_companion_guest`) — both client-only.
 *
 * IMPORTANT: betaModeOn is the server's truth. The client uses the
 * localStorage flag ONLY when betaModeOn is true; flipping the env
 * var off cleanly invalidates any stale tester flag.
 */
interface PageProps {
  searchParams?: Promise<{ resume?: string | string[] }>;
}

export default async function Page({ searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // `?resume=<save-id>` deep link from the Account page's My Stuff
  // tab. Single-value strings only — array form is ignored. The
  // client shell dispatches LOAD_SAVED_STATE on mount when set,
  // skipping the resume picker.
  const params = (await searchParams) ?? {};
  const resumeIdRaw = params.resume;
  const resumeId =
    typeof resumeIdRaw === "string" && resumeIdRaw.length > 0
      ? resumeIdRaw
      : null;

  // Best-effort display name — falls back to the email local-part so
  // there's always something. The full account UI is outside scope.
  const displayName =
    (user?.user_metadata?.display_name as string | undefined) ??
    user?.user_metadata?.full_name ??
    (user?.email ? user.email.split("@")[0] : null);

  // Resolve effective subscription tier for the Companion's gating
  // surfaces (save state, online play, full customization). Staff
  // accounts inherit the highest tier automatically per the
  // capability module.
  let tier: SubscriptionTier | undefined;
  let resolvedTier: SubscriptionTier = "free";
  let role: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("subscription_tier, role")
      .eq("id", user.id)
      .maybeSingle();
    role = (profile?.role as string | null) ?? null;
    resolvedTier = effectiveTier({
      tier: normalizeTier(profile?.subscription_tier as string | null),
      role,
    });
    tier = resolvedTier;
  }

  // Fetch the user's saved games for the Resume picker. Only runs
  // when the user is authenticated AND has the save_state
  // capability. RLS scopes the rows server-side; the explicit user
  // check is a cheap fast-path.
  let savedGames: CompanionSavedState[] = [];
  if (
    user &&
    hasCapability({ tier: resolvedTier, role }, "companion.save_state")
  ) {
    const { data: rows } = await supabase
      .from("companion_save_states")
      .select(
        "id, name, mode, game_settings, session_data, state_version, updated_at, created_at",
      )
      .eq("account_id", user.id)
      .order("updated_at", { ascending: false });
    savedGames = (rows ?? []).map((r) => ({
      id: r.id as string,
      name: (r.name as string | null) ?? null,
      mode: r.mode as string,
      gameSettings: r.game_settings as CompanionSavedState["gameSettings"],
      sessionData: r.session_data as CompanionSavedState["sessionData"],
      stateVersion: r.state_version as number,
      updatedAt: r.updated_at as string,
      createdAt: r.created_at as string,
    }));
  }

  // Resolve the autoResume save (if any) — must belong to this user
  // by both RLS and an explicit `account_id` filter. If it doesn't
  // match a save (deleted, mistyped, cross-user), the field stays
  // null and the resume picker / settings flow renders normally.
  let autoResume: CompanionSavedState | null = null;
  if (resumeId && user) {
    autoResume = savedGames.find((s) => s.id === resumeId) ?? null;
  }

  return (
    <CompanionShell
      isAuthenticated={!!user}
      displayName={displayName ?? null}
      tier={tier}
      savedGames={savedGames}
      autoResume={autoResume}
      betaModeOn={isBetaModeOn()}
    />
  );
}
