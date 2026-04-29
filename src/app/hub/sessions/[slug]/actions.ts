"use server";

/**
 * Server Actions for /hub/sessions/[slug] state transitions.
 *
 * Per gs-pro-v1-phase-4a-spec.md §§5.5, 6. Each action verifies
 * ownership + capability, then routes through the session service so
 * the audit log + adapter dispatch fire uniformly.
 *
 * Actions return { ok, error?, redirectTo? } so the client component can
 * surface errors inline + navigate after a restart.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  createSession,
  getSessionBySlug,
  transitionSessionStatus,
} from "@/lib/sessions/service";
import {
  hasCapability,
  normalizeTier,
  type CapabilityUser,
} from "@/lib/subscription";
import { getStaffImpersonationState } from "@/lib/capabilities/staff-impersonation";

export interface ActionResult {
  ok: boolean;
  error?: string;
  redirectTo?: string;
}

async function resolveAuthorizedUser(): Promise<
  | { ok: true; userId: string; capabilityUser: CapabilityUser }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("users")
    .select("subscription_tier, role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (profile?.role as string | null) ?? null;
  const rawTier = normalizeTier(
    (profile?.subscription_tier as string | null) ?? null
  );

  const impersonation = await getStaffImpersonationState();
  if (impersonation.viewingAsUnauth) return { ok: false, error: "unauthenticated" };

  const capabilityUser: CapabilityUser = {
    tier: rawTier,
    role,
    viewingAsTier:
      role === "staff" || role === "admin"
        ? impersonation.viewingAsTier ?? undefined
        : undefined,
  };
  if (!hasCapability(capabilityUser, "hub.access")) {
    return { ok: false, error: "capability_required" };
  }
  return { ok: true, userId: user.id, capabilityUser };
}

async function loadSessionForOwner(slug: string, userId: string) {
  const session = await getSessionBySlug(slug);
  if (!session) return null;
  if (session.owner_user_id !== userId) return null;
  return session;
}

export async function activateSessionAction(slug: string): Promise<ActionResult> {
  const auth = await resolveAuthorizedUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const session = await loadSessionForOwner(slug, auth.userId);
  if (!session) return { ok: false, error: "not_found" };

  try {
    await transitionSessionStatus({
      id: session.id,
      newStatus: "active",
      via: "manual",
      actorType: "streamer",
      actorId: auth.userId,
      payload: { source: "hub_ui" },
    });
    revalidatePath(`/hub/sessions/${slug}`);
    revalidatePath("/hub");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "transition_failed",
    };
  }
}

export async function cancelSessionAction(slug: string): Promise<ActionResult> {
  const auth = await resolveAuthorizedUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const session = await loadSessionForOwner(slug, auth.userId);
  if (!session) return { ok: false, error: "not_found" };

  try {
    await transitionSessionStatus({
      id: session.id,
      newStatus: "cancelled",
      via: null,
      actorType: "streamer",
      actorId: auth.userId,
      payload: { source: "hub_ui" },
    });
    revalidatePath(`/hub/sessions/${slug}`);
    revalidatePath("/hub");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "transition_failed",
    };
  }
}

export async function endSessionAction(slug: string): Promise<ActionResult> {
  const auth = await resolveAuthorizedUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const session = await loadSessionForOwner(slug, auth.userId);
  if (!session) return { ok: false, error: "not_found" };

  try {
    await transitionSessionStatus({
      id: session.id,
      newStatus: "ending",
      via: "manual",
      actorType: "streamer",
      actorId: auth.userId,
      payload: { source: "hub_ui" },
    });
    revalidatePath(`/hub/sessions/${slug}`);
    revalidatePath("/hub");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "transition_failed",
    };
  }
}

export async function restartSessionAction(slug: string): Promise<ActionResult> {
  const auth = await resolveAuthorizedUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const source = await loadSessionForOwner(slug, auth.userId);
  if (!source) return { ok: false, error: "not_found" };
  if (source.status !== "ended" && source.status !== "cancelled") {
    return { ok: false, error: "session_not_terminal" };
  }

  try {
    const newSession = await createSession({
      ownerUserId: auth.userId,
      name: `${source.name} (Restart)`,
      description: source.description,
      platforms: source.platforms,
      config: source.config,
    });
    revalidatePath("/hub");
    return { ok: true, redirectTo: `/hub/sessions/${newSession.slug}` };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "restart_failed",
    };
  }
}
