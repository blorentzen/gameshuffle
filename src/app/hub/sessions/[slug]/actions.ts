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
import { ensureBroadcasterSeatedForTwitchSession } from "@/lib/sessions/twitch-platform";
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
    // Auto-seat the broadcaster on Twitch-bound sessions so the streamer
    // is in the lobby the moment the session activates — same invariant
    // the webhook + test-session endpoint enforce. No-op for non-Twitch.
    await ensureBroadcasterSeatedForTwitchSession({
      sessionId: session.id,
      ownerUserId: auth.userId,
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

export interface UpdateSessionDetailsInput {
  name?: string;
  description?: string | null;
  scheduledAt?: string | null;
  scheduledEligibilityWindowHours?: number;
  game?: string | null;
  isTestSession?: boolean;
}

/**
 * Update editable session metadata. Field-by-field permission model:
 *   - name + description: always editable
 *   - game (config.game), scheduledAt, scheduledEligibilityWindowHours,
 *     test_session: editable only while status is draft / scheduled / ready
 *   - everything else: not editable here (use the dedicated state-
 *     transition actions instead)
 *
 * Scheduling change side-effect: setting scheduledAt on a draft moves the
 * session to status='scheduled'; clearing scheduledAt on a scheduled
 * session moves it back to draft. Active/ended sessions can't reschedule.
 */
export async function updateSessionDetailsAction(
  slug: string,
  input: UpdateSessionDetailsInput
): Promise<ActionResult> {
  const auth = await resolveAuthorizedUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const session = await loadSessionForOwner(slug, auth.userId);
  if (!session) return { ok: false, error: "not_found" };

  const editableForState =
    session.status === "draft" ||
    session.status === "scheduled" ||
    session.status === "ready";

  const update: Record<string, unknown> = {};

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) return { ok: false, error: "Name is required" };
    if (trimmed.length > 120) {
      return { ok: false, error: "Name must be 120 characters or fewer" };
    }
    update.name = trimmed;
  }

  if (input.description !== undefined) {
    update.description = input.description?.trim() || null;
  }

  if (
    input.game !== undefined ||
    input.scheduledAt !== undefined ||
    input.scheduledEligibilityWindowHours !== undefined ||
    input.isTestSession !== undefined
  ) {
    if (!editableForState) {
      return {
        ok: false,
        error: `Game / schedule / test-session can't change after the session ${session.status === "active" ? "starts" : "ends"}.`,
      };
    }
  }

  if (input.game !== undefined) {
    const game = (input.game || "").trim() || null;
    const nextConfig = {
      ...((session.config as Record<string, unknown> | null) ?? {}),
      game,
    };
    update.config = nextConfig;
  }

  if (input.scheduledAt !== undefined) {
    if (input.scheduledAt) {
      const ms = Date.parse(input.scheduledAt);
      if (!Number.isFinite(ms)) {
        return { ok: false, error: "Invalid scheduled date" };
      }
      if (ms <= Date.now()) {
        return { ok: false, error: "Schedule a time in the future" };
      }
      update.scheduled_at = new Date(ms).toISOString();
      // draft → scheduled when a date is added.
      if (session.status === "draft") update.status = "scheduled";
    } else {
      update.scheduled_at = null;
      // scheduled → draft when the date is cleared.
      if (session.status === "scheduled" || session.status === "ready") {
        update.status = "draft";
      }
    }
  }

  if (
    input.scheduledEligibilityWindowHours !== undefined &&
    Number.isFinite(input.scheduledEligibilityWindowHours)
  ) {
    const hours = Math.max(
      1,
      Math.min(24, Math.floor(input.scheduledEligibilityWindowHours))
    );
    update.scheduled_eligibility_window_hours = hours;
  }

  if (input.isTestSession !== undefined) {
    const flags = {
      ...((session.feature_flags as Record<string, unknown> | null) ?? {}),
      test_session: input.isTestSession,
    };
    update.feature_flags = flags;
  }

  if (Object.keys(update).length === 0) {
    return { ok: true };
  }

  // The unique-draft-per-owner index will reject a draft transition if a
  // sibling draft already exists. Surface that as a friendly error.
  const admin = createServiceClient();
  const { error: updateErr } = await admin
    .from("gs_sessions")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", session.id);
  if (updateErr) {
    if ((updateErr as { code?: string }).code === "23505") {
      return {
        ok: false,
        error:
          "You already have another draft session — finish or cancel it before clearing this one's schedule.",
      };
    }
    console.error("[hub/sessions] updateSessionDetails failed:", updateErr);
    return { ok: false, error: updateErr.message };
  }

  // Audit any state changes triggered by scheduling edits.
  if (update.status && update.status !== session.status) {
    await import("@/lib/sessions/service").then(({ recordEvent }) =>
      recordEvent({
        sessionId: session.id,
        eventType: "state_change",
        actorType: "streamer",
        actorId: auth.userId,
        payload: {
          from: session.status,
          to: update.status,
          source: "configure_page",
          reason: input.scheduledAt ? "scheduled_set" : "scheduled_cleared",
        },
      })
    );
  }

  revalidatePath(`/hub/sessions/${slug}`);
  revalidatePath(`/hub/sessions/${slug}/configure`);
  revalidatePath("/hub");
  return { ok: true };
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
