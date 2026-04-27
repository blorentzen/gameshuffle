/**
 * Session service — platform-agnostic CRUD + state machine for `gs_sessions`.
 *
 * Phase 1 ships only the data layer. No platform integration (Phase 3), no
 * lifecycle automation / cron / timeouts (Phase 2), no UI (Phase 4). Every
 * method here is callable from API routes today; the same API will be the
 * one Phase 2 wires lifecycle hooks into and Phase 3 wires adapter callbacks
 * into.
 *
 * All writes go through the service-role admin client because writes are
 * trusted (route-level capability checks have already passed) and we
 * need to bypass RLS for cross-user / system writes (e.g. EventSub
 * webhook creating a session for a streamer).
 */

import { createServiceClient } from "@/lib/supabase/admin";
import type {
  ActivationVia,
  EndedVia,
  GsSession,
  SessionConfig,
  SessionFeatureFlags,
  SessionPlatforms,
  SessionStatus,
} from "./types";

// ---- Admin client ---------------------------------------------------------

let _admin: ReturnType<typeof createServiceClient> | null = null;
function admin() {
  if (_admin) return _admin;
  _admin = createServiceClient();
  return _admin;
}

// ---- State transition matrix (architecture doc §4.4) ---------------------

const VALID_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  draft: ["scheduled", "active", "cancelled"],
  scheduled: ["ready", "cancelled"],
  ready: ["active", "scheduled", "cancelled"],
  active: ["ending"],
  ending: ["ended"],
  ended: [],
  cancelled: [],
};

export class InvalidTransitionError extends Error {
  constructor(public from: SessionStatus, public to: SessionStatus) {
    super(`Invalid session transition: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export class SessionNotFoundError extends Error {
  constructor(public id: string) {
    super(`Session not found: ${id}`);
    this.name = "SessionNotFoundError";
  }
}

export function isValidTransition(from: SessionStatus, to: SessionStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

// ---- Slug generation ------------------------------------------------------

const SLUG_NONWORD = /[^a-z0-9]+/g;
const MAX_SLUG_LEN = 48;

function slugify(input: string): string {
  const base = input.toLowerCase().replace(SLUG_NONWORD, "-").replace(/(^-|-$)/g, "");
  return base.slice(0, MAX_SLUG_LEN) || "session";
}

async function generateUniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  // Try the base slug first, then with a 4-char suffix, retrying up to 5 times.
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${randomSuffix()}`;
    const { data } = await admin()
      .from("gs_sessions")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  // Fallback — collisions on five tries means a wildly contended base; just
  // append a longer random tail.
  return `${base}-${randomSuffix(8)}`;
}

function randomSuffix(len = 4): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

// ---- Public API -----------------------------------------------------------

export interface CreateSessionInput {
  ownerUserId: string;
  name: string;
  description?: string | null;
  platforms?: SessionPlatforms;
  config?: SessionConfig;
  isTestSession?: boolean;
  /** Optional pre-existing slug (mostly for tests). */
  slug?: string;
}

export async function createSession(input: CreateSessionInput): Promise<GsSession> {
  const slug = input.slug ?? (await generateUniqueSlug(input.name));
  const featureFlags: SessionFeatureFlags = input.isTestSession ? { test_session: true } : {};

  const { data, error } = await admin()
    .from("gs_sessions")
    .insert({
      owner_user_id: input.ownerUserId,
      name: input.name,
      slug,
      description: input.description ?? null,
      status: "draft",
      platforms: (input.platforms ?? {}) as unknown as Record<string, unknown>,
      config: (input.config ?? {}) as unknown as Record<string, unknown>,
      tier_required: "pro",
      feature_flags: featureFlags as unknown as Record<string, unknown>,
    })
    .select("*")
    .single();
  if (error) throw error;

  await recordEvent({
    sessionId: (data as { id: string }).id,
    eventType: "state_change",
    actorType: "system",
    actorId: input.ownerUserId,
    payload: { from: null, to: "draft" },
  });

  return data as unknown as GsSession;
}

export async function getSession(id: string): Promise<GsSession | null> {
  const { data, error } = await admin()
    .from("gs_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as GsSession | null) ?? null;
}

export async function getSessionBySlug(slug: string): Promise<GsSession | null> {
  const { data, error } = await admin()
    .from("gs_sessions")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as GsSession | null) ?? null;
}

export async function listSessionsForOwner(
  ownerUserId: string,
  opts: { statuses?: SessionStatus[]; limit?: number } = {}
): Promise<GsSession[]> {
  let query = admin()
    .from("gs_sessions")
    .select("*")
    .eq("owner_user_id", ownerUserId)
    .order("updated_at", { ascending: false });
  if (opts.statuses && opts.statuses.length > 0) {
    query = query.in("status", opts.statuses);
  }
  if (opts.limit) {
    query = query.limit(opts.limit);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as GsSession[]) ?? [];
}

/**
 * Find the one session in `active` or `ending` status for an owner. The
 * unique partial index on `gs_sessions` enforces "one at a time" — this
 * is the canonical lookup for "is the streamer currently in a session?"
 */
export async function getActiveSessionForOwner(
  ownerUserId: string
): Promise<GsSession | null> {
  const { data, error } = await admin()
    .from("gs_sessions")
    .select("*")
    .eq("owner_user_id", ownerUserId)
    .in("status", ["active", "ending"])
    .order("activated_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as GsSession | null) ?? null;
}

export type UpdateSessionInput = Partial<{
  name: string;
  description: string | null;
  platforms: SessionPlatforms;
  config: SessionConfig;
  scheduled_at: string | null;
  scheduled_eligibility_window_hours: number;
}>;

export async function updateSessionConfig(
  id: string,
  patch: UpdateSessionInput
): Promise<GsSession> {
  const { data, error } = await admin()
    .from("gs_sessions")
    .update({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.platforms !== undefined
        ? { platforms: patch.platforms as unknown as Record<string, unknown> }
        : {}),
      ...(patch.config !== undefined
        ? { config: patch.config as unknown as Record<string, unknown> }
        : {}),
      ...(patch.scheduled_at !== undefined ? { scheduled_at: patch.scheduled_at } : {}),
      ...(patch.scheduled_eligibility_window_hours !== undefined
        ? {
            scheduled_eligibility_window_hours:
              patch.scheduled_eligibility_window_hours,
          }
        : {}),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as GsSession;
}

export interface TransitionInput {
  id: string;
  newStatus: SessionStatus;
  via?: ActivationVia | EndedVia | null;
  /** Used as the actor for the recorded event. */
  actorId?: string;
  actorType?: "streamer" | "mod" | "viewer" | "system";
}

export async function transitionSessionStatus(input: TransitionInput): Promise<GsSession> {
  const session = await getSession(input.id);
  if (!session) throw new SessionNotFoundError(input.id);

  if (!isValidTransition(session.status, input.newStatus)) {
    throw new InvalidTransitionError(session.status, input.newStatus);
  }

  const patch: Record<string, unknown> = { status: input.newStatus };
  if (input.newStatus === "active") {
    patch.activated_at = new Date().toISOString();
    if (input.via) patch.activated_via = input.via;
  }
  if (input.newStatus === "ended" || input.newStatus === "ending") {
    patch.ended_at = new Date().toISOString();
    if (input.via) patch.ended_via = input.via;
  }

  const { data, error } = await admin()
    .from("gs_sessions")
    .update(patch)
    .eq("id", input.id)
    .select("*")
    .single();
  if (error) throw error;

  await recordEvent({
    sessionId: input.id,
    eventType: "state_change",
    actorType: input.actorType ?? "system",
    actorId: input.actorId,
    payload: { from: session.status, to: input.newStatus, via: input.via ?? null },
  });

  return data as unknown as GsSession;
}

export async function deleteSession(id: string): Promise<void> {
  const { error } = await admin().from("gs_sessions").delete().eq("id", id);
  if (error) throw error;
}

// ---- Events ---------------------------------------------------------------

export interface RecordEventInput {
  sessionId: string;
  eventType: string;
  actorType?: "streamer" | "mod" | "viewer" | "system";
  actorId?: string;
  payload?: Record<string, unknown>;
}

export async function recordEvent(input: RecordEventInput): Promise<void> {
  const { error } = await admin()
    .from("session_events")
    .insert({
      session_id: input.sessionId,
      event_type: input.eventType,
      actor_type: input.actorType ?? null,
      actor_id: input.actorId ?? null,
      payload: input.payload ?? {},
    });
  if (error) throw error;
}
