"use server";

/**
 * Server Actions for /hub/sessions/new — session creation form.
 *
 * Per gs-pro-v1-phase-4b-spec.md §4.4. The action validates input,
 * checks capability + draft-uniqueness, builds the platforms + config
 * payloads, and routes through `createSession` (which writes draft or
 * scheduled status depending on whether `scheduledAt` is set).
 *
 * After creation, redirects to the new session's detail page; the user
 * then clicks "Activate" from there to start a "Start now" session.
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { createSession } from "@/lib/sessions/service";
import type { SessionPlatforms, SessionConfig } from "@/lib/sessions/types";
import {
  hasCapability,
  normalizeTier,
  type CapabilityUser,
} from "@/lib/subscription";
import { getStaffImpersonationState } from "@/lib/capabilities/staff-impersonation";

export interface CreateSessionFormResult {
  ok: boolean;
  /** Field name → first error message; rendered inline next to the field. */
  fieldErrors?: Record<string, string>;
  /** Top-level error not tied to a specific field. */
  error?: string;
}

interface ParsedInput {
  name: string;
  description: string | null;
  attachTwitch: boolean;
  scheduleMode: "now" | "later";
  scheduledAt: string | null;
  scheduledEligibilityWindowHours: number;
  isTestSession: boolean;
}

function parseFormInput(formData: FormData): {
  parsed?: ParsedInput;
  fieldErrors?: Record<string, string>;
} {
  const fieldErrors: Record<string, string> = {};

  const name = String(formData.get("name") ?? "").trim();
  if (!name) fieldErrors.name = "Name is required";
  if (name.length > 120) fieldErrors.name = "Name must be 120 characters or fewer";

  const description = String(formData.get("description") ?? "").trim() || null;

  const attachTwitch = formData.get("attach_twitch") === "on";

  const scheduleMode =
    formData.get("schedule_mode") === "later" ? ("later" as const) : ("now" as const);

  let scheduledAt: string | null = null;
  let scheduledEligibilityWindowHours = 4;
  if (scheduleMode === "later") {
    const raw = String(formData.get("scheduled_at") ?? "").trim();
    if (!raw) {
      fieldErrors.scheduled_at = "Pick a date and time";
    } else {
      const ms = Date.parse(raw);
      if (!Number.isFinite(ms)) {
        fieldErrors.scheduled_at = "Invalid date";
      } else if (ms <= Date.now()) {
        fieldErrors.scheduled_at = "Schedule a time in the future";
      } else {
        scheduledAt = new Date(ms).toISOString();
      }
    }
    const windowRaw = formData.get("eligibility_window_hours");
    if (windowRaw) {
      const n = parseInt(String(windowRaw), 10);
      if (Number.isFinite(n) && n > 0 && n <= 24) {
        scheduledEligibilityWindowHours = n;
      }
    }
  }

  const isTestSession = formData.get("is_test_session") === "on";

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
  return {
    parsed: {
      name,
      description,
      attachTwitch,
      scheduleMode,
      scheduledAt,
      scheduledEligibilityWindowHours,
      isTestSession,
    },
  };
}

async function resolveAuthorizedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

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
  if (impersonation.viewingAsUnauth) return null;

  const capabilityUser: CapabilityUser = {
    tier: rawTier,
    role,
    viewingAsTier:
      role === "staff" || role === "admin"
        ? impersonation.viewingAsTier ?? undefined
        : undefined,
  };
  if (!hasCapability(capabilityUser, "hub.access")) return null;
  return { userId: user.id };
}

export async function createSessionAction(
  _prevState: CreateSessionFormResult | null,
  formData: FormData
): Promise<CreateSessionFormResult> {
  const auth = await resolveAuthorizedUser();
  if (!auth) {
    return { ok: false, error: "You must be signed in as a Pro user." };
  }

  const { parsed, fieldErrors } = parseFormInput(formData);
  if (!parsed) return { ok: false, fieldErrors };

  // Enforce the new unique-draft constraint at the application layer
  // too — the DB index is the durable check, but a friendly inline
  // error beats a 23505 surfaced as "internal error". We intentionally
  // race-tolerant: if the DB rejects with 23505 below, we recover.
  const admin = createServiceClient();
  const { data: existingDraft } = await admin
    .from("gs_sessions")
    .select("slug")
    .eq("owner_user_id", auth.userId)
    .eq("status", "draft")
    .maybeSingle();
  if (existingDraft) {
    return {
      ok: false,
      error: `You already have a draft session in progress. Continue it at /hub/sessions/${(existingDraft as { slug: string }).slug} or activate/cancel it before starting a new one.`,
    };
  }

  // Build platforms + config from form input.
  const platforms: SessionPlatforms = {};
  if (parsed.attachTwitch) {
    // Look up the Twitch connection to record category_id (if any) at
    // creation time. The webhook will keep this in sync after activation
    // via channel.update events.
    const { data: connection } = await admin
      .from("twitch_connections")
      .select("twitch_user_id")
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (!connection) {
      return {
        ok: false,
        fieldErrors: {
          attach_twitch:
            "Twitch isn't connected. Set up the streamer integration in Account → Integrations first.",
        },
      };
    }
    platforms.streaming = { type: "twitch" };
  }

  const config: SessionConfig = {};

  let newSession;
  try {
    newSession = await createSession({
      ownerUserId: auth.userId,
      name: parsed.name,
      description: parsed.description,
      platforms,
      config,
      isTestSession: parsed.isTestSession,
      scheduledAt: parsed.scheduledAt,
      scheduledEligibilityWindowHours: parsed.scheduledEligibilityWindowHours,
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "23505") {
      // Race lost the unique-draft index — another tab created a draft
      // between our select above and our insert here.
      return {
        ok: false,
        error:
          "You already have a draft session in progress. Refresh the Hub to find it.",
      };
    }
    console.error("[hub/sessions/new] createSession failed:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not create the session.",
    };
  }

  revalidatePath("/hub");
  redirect(`/hub/sessions/${newSession.slug}`);
}
