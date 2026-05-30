/**
 * Event engine — Spec 04.
 *
 * Draws a random eligible event from `gs_events` by weight, then
 * applies each `gs_event_consequences` row. Phase 1 supports
 * `token_delta` (bounded credit/spend) and `story` (cosmetic).
 * `modifier` and `challenge` consequence types are accepted at the
 * schema level for forward compatibility; the engine treats them as
 * story (no mechanical effect) until Phase 2 ships the active-
 * instance tracking.
 *
 * Per Spec 04 §3 / §4:
 *   - `!chaos`  draws from `surface in ('chaos','both')`
 *   - `!random` draws from `surface in ('random','both')`
 *
 * Per the closed-loop constraint, the deck's aggregate EV across
 * enabled events stays roughly neutral or mildly negative — events
 * are NOT a faucet. Validation script is a TODO.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { credit, spend } from "@/lib/economy/tokens";

export type EventSurface = "chaos" | "random" | "both";
export type ConsequenceType = "token_delta" | "modifier" | "challenge" | "story";

export interface EventRow {
  id: string;
  event_key: string;
  surface: EventSurface;
  flavor_tmpl: string;
  weight: number;
  game_scope: string | null;
  enabled: boolean;
}

export interface ConsequenceRow {
  id: string;
  event_id: string;
  ctype: ConsequenceType;
  payload: Record<string, unknown>;
}

export interface AppliedConsequence {
  ctype: ConsequenceType;
  /** For token_delta: signed delta applied (+ credit, - spend, 0 no-op). */
  tokenDelta?: number;
  /** Notes for the chat-side renderer. */
  detail?: string;
}

export interface FireEventResult {
  ok: true;
  event: EventRow;
  flavor: string;
  consequences: AppliedConsequence[];
}

export interface FireEventRejection {
  ok: false;
  reason: "no_eligible_event";
}

/**
 * Pull eligible events for the surface + (optional) game and pick
 * one by weight. Returns null if no event matches.
 */
export async function drawEvent(args: {
  surface: "chaos" | "random";
  gameKey: string | null;
}): Promise<EventRow | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_events")
    .select("id, event_key, surface, flavor_tmpl, weight, game_scope, enabled")
    .eq("enabled", true)
    .in("surface", [args.surface, "both"]);
  const all = ((data as EventRow[] | null) ?? []) as EventRow[];
  const eligible = all.filter(
    (e) => e.game_scope === null || e.game_scope === args.gameKey,
  );
  if (eligible.length === 0) return null;
  return weightedPick(eligible);
}

function weightedPick(rows: EventRow[]): EventRow {
  const total = rows.reduce((acc, r) => acc + r.weight, 0);
  let pick = Math.random() * total;
  for (const r of rows) {
    pick -= r.weight;
    if (pick <= 0) return r;
  }
  return rows[rows.length - 1];
}

async function loadConsequences(eventId: string): Promise<ConsequenceRow[]> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_event_consequences")
    .select("id, event_id, ctype, payload")
    .eq("event_id", eventId);
  return ((data as ConsequenceRow[] | null) ?? []) as ConsequenceRow[];
}

export interface FireEventArgs {
  surface: "chaos" | "random";
  gameKey: string | null;
  /** The identity the event acts on — for `!chaos` the firer, for
   *  `!random` (system-fired) often the streamer or null. */
  targetIdentityId: string;
  targetDisplayName: string;
  communityId: string;
  streamId: string | null;
  sessionId: string | null;
  /** Where the trigger came from — 'system' / 'chat'. Stored in
   *  token_event meta for telemetry. */
  trigger: "system" | "chat";
}

/**
 * Draw an event + apply its consequences. The flavor template is
 * rendered with `{user}` and `{delta}` substitutions and returned
 * for the caller (chat handler) to post.
 */
export async function fireEvent(
  args: FireEventArgs,
): Promise<FireEventResult | FireEventRejection> {
  const event = await drawEvent({
    surface: args.surface,
    gameKey: args.gameKey,
  });
  if (!event) return { ok: false, reason: "no_eligible_event" };

  const consequences = await loadConsequences(event.id);
  const applied: AppliedConsequence[] = [];

  for (const c of consequences) {
    if (c.ctype === "token_delta") {
      const delta = await applyTokenDelta({
        payload: c.payload,
        targetIdentityId: args.targetIdentityId,
        communityId: args.communityId,
        streamId: args.streamId,
        sessionId: args.sessionId,
        eventId: event.id,
        trigger: args.trigger,
      });
      applied.push({ ctype: "token_delta", tokenDelta: delta });
    } else if (c.ctype === "story") {
      applied.push({ ctype: "story" });
    } else if (c.ctype === "modifier") {
      const result = await applyModifier({
        payload: c.payload,
        eventId: event.id,
        communityId: args.communityId,
        streamId: args.streamId,
        sessionId: args.sessionId,
        firedBy: args.targetIdentityId,
      });
      applied.push({
        ctype: "modifier",
        detail: result.ok
          ? `${result.effect} for ${result.duration}s`
          : `(modifier failed: ${result.reason})`,
      });
    } else if (c.ctype === "challenge") {
      const result = await applyChallenge({
        payload: c.payload,
        eventId: event.id,
        communityId: args.communityId,
        streamId: args.streamId,
        sessionId: args.sessionId,
      });
      applied.push({
        ctype: "challenge",
        detail: result.ok
          ? `challenge issued (${result.visibility})`
          : `(challenge failed: ${result.reason})`,
      });
    }
  }

  // Build the rendered flavor. Delta substitution: use the largest
  // absolute token delta from this event's consequences. (Most
  // events ship a single token_delta; if there are multiple, this
  // picks the largest in magnitude — the most chat-worthy.)
  const deltaForFlavor = applied
    .filter((a) => a.tokenDelta !== undefined)
    .map((a) => a.tokenDelta as number)
    .reduce<number | null>(
      (acc, v) =>
        acc === null || Math.abs(v) > Math.abs(acc) ? v : acc,
      null,
    );
  const flavor = renderFlavor(event.flavor_tmpl, {
    user: args.targetDisplayName,
    delta: deltaForFlavor === null ? "" : Math.abs(deltaForFlavor).toString(),
  });

  return { ok: true, event, flavor, consequences: applied };
}

interface TokenDeltaPayload {
  min: number;
  max: number;
}

async function applyTokenDelta(args: {
  payload: Record<string, unknown>;
  targetIdentityId: string;
  communityId: string;
  streamId: string | null;
  sessionId: string | null;
  eventId: string;
  trigger: "system" | "chat";
}): Promise<number> {
  if (
    typeof args.payload.min !== "number" ||
    typeof args.payload.max !== "number"
  ) {
    return 0;
  }
  const { min, max } = args.payload as unknown as TokenDeltaPayload;
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const delta = Math.round(lo + Math.random() * (hi - lo));
  if (delta === 0) return 0;

  const meta = {
    source: "event",
    trigger: args.trigger,
  };

  if (delta > 0) {
    await credit({
      identityId: args.targetIdentityId,
      amount: delta,
      type: "event_delta",
      ctx: {
        communityId: args.communityId,
        streamId: args.streamId,
        sessionId: args.sessionId,
        meta,
      },
    });
    return delta;
  } else {
    // Bounded loss — the spend will reject cleanly if balance is
    // too low, capped at 0 from the bettor's perspective.
    const result = await spend({
      identityId: args.targetIdentityId,
      amount: Math.abs(delta),
      type: "event_delta",
      ctx: {
        communityId: args.communityId,
        streamId: args.streamId,
        sessionId: args.sessionId,
        meta,
      },
    });
    // If the spend failed (insufficient balance), the consequence
    // effectively applies a 0 delta — the viewer was already at 0
    // and the event's "loss" was absorbed.
    return result.ok ? delta : 0;
  }
}

function renderFlavor(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key) => vars[key] ?? `{${key}}`);
}

// ---------------------------------------------------------------------------
// Modifier consequence — Spec 04 §2 (Phase 2)
// ---------------------------------------------------------------------------

interface ModifierPayload {
  effect?: string;
  scope?: "seconds" | "round" | "chapter";
  duration?: number;
}

async function applyModifier(args: {
  payload: Record<string, unknown>;
  eventId: string;
  communityId: string;
  streamId: string | null;
  sessionId: string | null;
  firedBy: string;
}): Promise<
  | { ok: true; effect: string; duration: number }
  | { ok: false; reason: string }
> {
  const p = args.payload as unknown as ModifierPayload;
  if (!p.effect || typeof p.effect !== "string") {
    return { ok: false, reason: "missing_effect" };
  }
  const duration = Number(p.duration ?? 60);
  if (!Number.isInteger(duration) || duration <= 0) {
    return { ok: false, reason: "invalid_duration" };
  }
  const scope = (p.scope ?? "seconds") as "seconds" | "round" | "chapter";
  // v1: every scope resolves to a wall-clock expiry. Round / chapter
  // scopes use `duration` as a rough seconds-equivalent until the
  // chapter mechanic ships.
  const expiresAt = new Date(Date.now() + duration * 1000).toISOString();

  const admin = createServiceClient();
  const { error } = await admin.from("gs_event_modifiers").insert({
    community_id: args.communityId,
    stream_id: args.streamId,
    session_id: args.sessionId,
    event_id: args.eventId,
    effect: p.effect,
    scope,
    duration,
    expires_at: expiresAt,
    fired_by: args.firedBy,
  });
  if (error) {
    return { ok: false, reason: error.message };
  }
  return { ok: true, effect: p.effect, duration };
}

/**
 * Read active modifiers (expires_at > now) for a stream — the live
 * page renders them as floating callouts ("⚡ reverse_controls — 38s").
 */
export async function listActiveModifiers(
  streamId: string,
): Promise<
  Array<{
    id: string;
    effect: string;
    scope: string;
    expiresAt: string;
    eventId: string;
  }>
> {
  const admin = createServiceClient();
  const nowIso = new Date().toISOString();
  const { data } = await admin
    .from("gs_event_modifiers")
    .select("id, effect, scope, expires_at, event_id")
    .eq("stream_id", streamId)
    .gt("expires_at", nowIso)
    .order("expires_at", { ascending: true });
  return ((data as Array<{
    id: string;
    effect: string;
    scope: string;
    expires_at: string;
    event_id: string;
  }> | null) ?? []).map((r) => ({
    id: r.id,
    effect: r.effect,
    scope: r.scope,
    expiresAt: r.expires_at,
    eventId: r.event_id,
  }));
}

/** Cron-driven cleanup. Expired modifiers stay in the table for
 *  audit but the active query already filters them out — this just
 *  trims older-than-7d entries so the table doesn't grow forever. */
export async function pruneExpiredModifiers(): Promise<{ pruned: number }> {
  const admin = createServiceClient();
  const cutoff = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { count } = await admin
    .from("gs_event_modifiers")
    .delete({ count: "exact" })
    .lt("expires_at", cutoff);
  return { pruned: count ?? 0 };
}

// ---------------------------------------------------------------------------
// Challenge consequence — Spec 04 §2 + §5 (Phase 2)
// ---------------------------------------------------------------------------

interface ChallengePayload {
  variable_type?: "binary" | "placement" | "pickone" | "count";
  condition?: Record<string, unknown>;
  reward?: number;
  penalty?: number;
  visibility?: "public" | "secret";
  target_identity_id?: string | null;
}

async function applyChallenge(args: {
  payload: Record<string, unknown>;
  eventId: string;
  communityId: string;
  streamId: string | null;
  sessionId: string | null;
}): Promise<
  | { ok: true; visibility: "public" | "secret" }
  | { ok: false; reason: string }
> {
  const p = args.payload as unknown as ChallengePayload;
  if (!p.variable_type) return { ok: false, reason: "missing_variable_type" };
  if (!p.condition || typeof p.condition !== "object") {
    return { ok: false, reason: "missing_condition" };
  }
  const visibility = (p.visibility ?? "public") as "public" | "secret";
  // Reward + penalty are optional; without them the challenge is
  // a pure social call-out with no economy impact.
  const reward = p.reward !== undefined ? Number(p.reward) : null;
  const penalty = p.penalty !== undefined ? Number(p.penalty) : null;
  if (reward !== null && (!Number.isInteger(reward) || reward < 0)) {
    return { ok: false, reason: "invalid_reward" };
  }
  if (penalty !== null && (!Number.isInteger(penalty) || penalty < 0)) {
    return { ok: false, reason: "invalid_penalty" };
  }

  const admin = createServiceClient();
  const { error } = await admin.from("gs_event_challenges").insert({
    community_id: args.communityId,
    stream_id: args.streamId,
    session_id: args.sessionId,
    chapter: null,
    event_id: args.eventId,
    variable_type: p.variable_type,
    condition: p.condition,
    reward,
    penalty,
    visibility,
    target_identity_id: p.target_identity_id ?? null,
  });
  if (error) {
    return { ok: false, reason: error.message };
  }
  return { ok: true, visibility };
}
