import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import {
  effectiveTier,
  hasCapability,
  normalizeTier,
  type SubscriptionTier,
} from "@/lib/subscription";
import type { CompanionSavedState } from "@/lib/companion/saveStates";
import { CompanionShell } from "./CompanionShell";
import { normalizeCode } from "@/lib/companion/liveRules";
import { SITE_URL } from "@/lib/seo";

// The app itself (sign-in chooser, then the board): kept out of search so the
// landing page, /pokemon-tcg-companion, is the one that ranks. Links still count.
export const metadata: Metadata = {
  title: "TCG Companion",
  description:
    "Open the free GameShuffle TCG Companion: damage counters, condition tracking, prize counts, coin flips and dice for your Pokémon TCG table.",
  alternates: { canonical: `${SITE_URL}/tcg-companion` },
  robots: { index: false, follow: true },
};

/**
 * Server entry for /companion.
 *
 * Reads auth state and passes the resolved facts down to the client
 * shell. The board-vs-chooser decision happens in <CompanionShell>
 * because it depends on sessionStorage (`gs_companion_guest`) — a
 * client-only signal for the "continue as guest" opt-in.
 */
interface PageProps {
  searchParams?: Promise<{ resume?: string | string[]; play?: string | string[]; deck?: string | string[] }>;
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
      .select("subscription_tier, role, circuit_tier, circuit_status")
      .eq("id", user.id)
      .maybeSingle();
    role = (profile?.role as string | null) ?? null;
    resolvedTier = effectiveTier({
      tier: normalizeTier(profile?.subscription_tier as string | null),
      role,
      circuitTier: (profile?.circuit_tier as string | null) ?? null,
      circuitStatus: (profile?.circuit_status as string | null) ?? null,
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

  // Play together: `?play=CODE` joins (or gets back into) a shared game.
  const liveCode = normalizeCode(typeof params.play === "string" ? params.play : null);
  // "Play in the companion" from a saved deck list (the deck API checks it's theirs).
  const startDeck = user && typeof params.deck === "string" && /^[0-9a-f-]{36}$/i.test(params.deck) ? params.deck : null;

  return (
    <CompanionShell
      isAuthenticated={!!user}
      displayName={displayName ?? null}
      tier={tier}
      savedGames={savedGames}
      autoResume={autoResume}
      liveCode={liveCode}
      startDeck={startDeck}
    />
  );
}
