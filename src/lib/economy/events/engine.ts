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
import { resolvePartners, type PartnerIdentity } from "./partners";
import {
  buildBaseVars,
  prefetchHeavyVars,
  renderTemplate,
  type TemplateContext,
} from "@/lib/templates/resolver";
import type { ChatAuthority } from "@/lib/twitch/commands/authority";
import { logSignal } from "@/lib/engagement/signals";

export type EventSurface = "chaos" | "random" | "both";
export type ConsequenceType = "token_delta" | "modifier" | "challenge" | "story";

/** How partners are chosen for an event.
 *  - `none`           — single-party (default, backwards compat).
 *  - `mention`        — caller @-mentions one target; event_key
 *                       doubles as the chat command.
 *  - `random_active`  — engine picks one recent active viewer.
 *  - `random_n`       — engine picks `partner_count` random
 *                       consenting viewers (fanout).
 *  - `all_active`     — engine fans out to up to `partner_count`
 *                       active viewers (consent-gated for token-
 *                       negative consequences). */
export type PartnerMode =
  | "none"
  | "mention"
  | "random_active"
  | "random_n"
  | "all_active";

/** Which party a consequence applies to. `actor` = caller (from),
 *  `partner` = mentioned/selected target (to), `both` = independently
 *  applied to each. */
export type ConsequenceTarget = "actor" | "partner" | "both";

/** Alias of the 4-tier `ChatAuthority` ladder defined in
 *  `@/lib/twitch/commands/authority`. Exposed under this name for
 *  legacy callers (admin API, admin UI, override UI) that import
 *  `EventAuthority` from this module. */
export type EventAuthority = ChatAuthority;

export interface EventRow {
  id: string;
  event_key: string;
  surface: EventSurface;
  flavor_tmpl: string;
  weight: number;
  game_scope: string | null;
  enabled: boolean;
  partner_mode: PartnerMode;
  /** K for `random_n`, soft cap for `all_active`. NULL for the
   *  modes where the count is implicit (0 or 1). */
  partner_count: number | null;
  /** When TRUE, the `event_key` is also a valid direct chat
   *  command (`!event_key` fires the event). Mention-mode events
   *  are always direct-triggerable; this column matters for the
   *  non-mention modes. */
  trigger_directly: boolean;
  /** Minimum authority to fire this event DIRECTLY. Ignored when
   *  drawn via `!chaos` / `!random`. */
  min_authority: EventAuthority;
}

/** Per-community pin on a platform event. Streamers can disable
 *  events, swap the flavor template, or flip `trigger_directly`
 *  on/off without admin intervention. */
export interface EventOverrideRow {
  community_id: string;
  event_id: string;
  enabled: boolean;
  flavor_tmpl_override: string | null;
  trigger_directly_override: boolean | null;
}

export interface ConsequenceRow {
  id: string;
  event_id: string;
  ctype: ConsequenceType;
  payload: Record<string, unknown>;
  target: ConsequenceTarget;
}

export interface AppliedConsequence {
  ctype: ConsequenceType;
  /** Which party (or parties) this consequence landed on. */
  target: ConsequenceTarget;
  /** For token_delta with target=actor/both: the signed delta the
   *  actor received. Undefined when this consequence didn't touch
   *  the actor. */
  tokenDelta?: number;
  /** For token_delta with target=partner/both: signed deltas per
   *  partner, in the same order as the resolved partner list. For
   *  2-party events this is a single-element array; for fanout
   *  events it's one entry per partner. */
  partnerTokenDeltas?: number[];
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
  reason: "no_eligible_event" | "partner_required" | "partner_unavailable";
}

/**
 * Pull eligible events for the surface + (optional) game and pick
 * one by weight. Returns null if no event matches.
 */
export async function drawEvent(args: {
  surface: "chaos" | "random";
  gameKey: string | null;
  /** Community firing the event — used to filter out events the
   *  streamer has overridden to disabled. Optional for system
   *  paths that don't have a community context. */
  communityId?: string;
}): Promise<EventRow | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_events")
    .select(
      "id, event_key, surface, flavor_tmpl, weight, game_scope, enabled, partner_mode, partner_count, trigger_directly, min_authority",
    )
    .eq("enabled", true)
    .in("surface", [args.surface, "both"]);
  const all = ((data as EventRow[] | null) ?? []) as EventRow[];

  // Pull every override for this community in one query, then
  // apply per-event. Absence = use platform fields.
  const overrides = args.communityId
    ? await loadOverridesForCommunity(args.communityId, all.map((e) => e.id))
    : new Map<string, EventOverrideRow>();

  const eligible = all
    .map((e) => applyEventOverride(e, overrides.get(e.id) ?? null))
    .filter((e): e is EventRow => e !== null)
    .filter((e) => {
      if (e.game_scope !== null && e.game_scope !== args.gameKey) return false;
      // Mention-mode events are only reachable through the
      // dispatcher fallback, never through a `!chaos` / `!random`
      // draw — the caller's @user mention is part of the input
      // contract.
      if (e.partner_mode === "mention") return false;
      return true;
    });
  if (eligible.length === 0) return null;
  return weightedPick(eligible);
}

/** Bulk-load `gs_event_overrides` rows for a community. Returns a
 *  Map keyed by event_id for O(1) merge into the catalog rows. */
async function loadOverridesForCommunity(
  communityId: string,
  eventIds: string[],
): Promise<Map<string, EventOverrideRow>> {
  if (eventIds.length === 0) return new Map();
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_event_overrides")
    .select(
      "community_id, event_id, enabled, flavor_tmpl_override, trigger_directly_override",
    )
    .eq("community_id", communityId)
    .in("event_id", eventIds);
  const rows = (data as EventOverrideRow[] | null) ?? [];
  const map = new Map<string, EventOverrideRow>();
  for (const r of rows) map.set(r.event_id, r);
  return map;
}

/** Apply a streamer override to a platform event row. Returns the
 *  effective row, or `null` when the streamer pinned it Off. */
function applyEventOverride(
  event: EventRow,
  override: EventOverrideRow | null,
): EventRow | null {
  if (!override) return event;
  if (!override.enabled) return null;
  return {
    ...event,
    flavor_tmpl: override.flavor_tmpl_override ?? event.flavor_tmpl,
    trigger_directly:
      override.trigger_directly_override ?? event.trigger_directly,
  };
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
    .select("id, event_id, ctype, payload, target")
    .eq("event_id", eventId);
  return ((data as ConsequenceRow[] | null) ?? []) as ConsequenceRow[];
}

/**
 * Look up an event by its key + partner mode — used by the mention-
 * mode chat fallback (`!hug @user` → `event_key='hug' AND
 * partner_mode='mention'`). Applies the community override so
 * disabled / re-templated events behave correctly per-streamer.
 */
export async function findMentionEventByKey(
  eventKey: string,
  communityId?: string,
): Promise<EventRow | null> {
  const event = await loadEventByKey(eventKey, "mention");
  if (!event) return null;
  if (!communityId) return event;
  const override = await loadSingleOverride(communityId, event.id);
  return applyEventOverride(event, override);
}

/**
 * Look up a non-mention event whose `event_key` is being typed as
 * a direct chat command (`!tornado` → `event_key='tornado' AND
 * trigger_directly` after override). Returns the effective event
 * after the community's override is applied; `null` when no match
 * or when the streamer disabled it.
 */
export async function findDirectEventByKey(
  eventKey: string,
  communityId?: string,
): Promise<EventRow | null> {
  const event = await loadEventByKey(eventKey, null);
  if (!event) return null;
  // Direct-trigger lookups skip mention events — those go through
  // findMentionEventByKey.
  if (event.partner_mode === "mention") return null;
  const override = communityId
    ? await loadSingleOverride(communityId, event.id)
    : null;
  const effective = applyEventOverride(event, override);
  if (!effective) return null;
  if (!effective.trigger_directly) return null;
  return effective;
}

/** Single-event load by key, optionally filtered by partner_mode. */
async function loadEventByKey(
  eventKey: string,
  partnerMode: PartnerMode | null,
): Promise<EventRow | null> {
  const admin = createServiceClient();
  let q = admin
    .from("gs_events")
    .select(
      "id, event_key, surface, flavor_tmpl, weight, game_scope, enabled, partner_mode, partner_count, trigger_directly, min_authority",
    )
    .eq("event_key", eventKey)
    .eq("enabled", true);
  if (partnerMode) q = q.eq("partner_mode", partnerMode);
  const { data } = await q.maybeSingle();
  return (data as EventRow | null) ?? null;
}

async function loadSingleOverride(
  communityId: string,
  eventId: string,
): Promise<EventOverrideRow | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_event_overrides")
    .select(
      "community_id, event_id, enabled, flavor_tmpl_override, trigger_directly_override",
    )
    .eq("community_id", communityId)
    .eq("event_id", eventId)
    .maybeSingle();
  return (data as EventOverrideRow | null) ?? null;
}

export interface FireEventArgs {
  surface: "chaos" | "random";
  gameKey: string | null;
  /** The actor (caller, `{from}`). Always required. For 1-party
   *  events this is also the only target. */
  actorIdentityId: string;
  actorDisplayName: string;
  /** Pre-resolved partners — used by the mention path where the
   *  chat dispatcher already knows the target identity. For draws
   *  (`!chaos` / `!random`), omit this and the engine resolves
   *  partners internally per the drawn event's `partner_mode`. */
  partners?: Array<{ identityId: string; displayName: string }>;
  /** Broadcaster's display name — exposed as `{streamer}` to flavor
   *  templates. */
  streamerDisplayName: string;
  communityId: string;
  streamId: string | null;
  sessionId: string | null;
  /** Where the trigger came from — 'system' / 'chat'. Stored in
   *  token_event meta for telemetry. */
  trigger: "system" | "chat";
  /** When provided, skip the draw and fire this exact event — used
   *  by the mention-mode chat fallback after resolving `!hug` to the
   *  matching catalog row. */
  preselectedEvent?: EventRow;
  /** Optional Twitch IDs for heavy-variable resolution in the
   *  flavor template (`{uptime}`, `{followage}`, `{discord_invite}`,
   *  gamertags, …). The chat-fire path (`!chaos` / `!random` /
   *  mention) passes these so flavor lines can reference the same
   *  variables custom commands can. System-triggered fires can omit
   *  them — affected variables resolve to "(unavailable)" /
   *  empty string instead. */
  chatContext?: {
    /** Streamer's GS user_id — needed for profile / gamertag /
     *  social variables. */
    streamerUserId: string;
    /** Caller's Twitch user ID — needed for {followage} / {accountage}. */
    senderTwitchId: string;
    /** Broadcaster's Twitch user ID — needed for {uptime}. */
    broadcasterTwitchId: string;
    /** Raw chat args (mention parsing for {touser} fallback). */
    rawArgs: string;
  };
}

/**
 * Draw an event + apply its consequences. The flavor template is
 * rendered with `{from}` / `{to}` (and the back-compat `{user}`)
 * substitutions and returned for the caller (chat handler) to post.
 *
 * Two firing patterns share this function:
 *   - draw-based (bare `!chaos`, `!random`) — caller omits
 *     `preselectedEvent`; the engine draws by weight from events
 *     matching the surface + (no-)partner combo.
 *   - mention-based (`!hug @bob`) — chat dispatcher looked up the
 *     event by its event_key + partner_mode='mention' and passes it
 *     in via `preselectedEvent` along with the @-resolved partner.
 */
export async function fireEvent(
  args: FireEventArgs,
): Promise<FireEventResult | FireEventRejection> {
  const event =
    args.preselectedEvent ??
    (await drawEvent({
      surface: args.surface,
      gameKey: args.gameKey,
      communityId: args.communityId,
    }));
  if (!event) return { ok: false, reason: "no_eligible_event" };

  const consequences = await loadConsequences(event.id);

  // Resolve the partner list. The mention path passes pre-resolved
  // partners (single entry, dispatcher already looked up @user).
  // For all other modes, the engine resolves internally based on
  // the drawn event's `partner_mode`.
  let partners: PartnerIdentity[];
  if (event.partner_mode === "none") {
    partners = [];
  } else if (args.partners && args.partners.length > 0) {
    partners = args.partners;
  } else {
    const resolved = await resolvePartners({
      event,
      consequences,
      actorIdentityId: args.actorIdentityId,
      communityId: args.communityId,
    });
    if (resolved === null) {
      return { ok: false, reason: "partner_unavailable" };
    }
    partners = resolved;
  }

  // Mention-mode events still require an explicit partner — guards
  // against the dispatcher passing an empty list by accident.
  if (event.partner_mode === "mention" && partners.length === 0) {
    return { ok: false, reason: "partner_required" };
  }

  const applied: AppliedConsequence[] = [];

  for (const c of consequences) {
    if (c.ctype === "token_delta") {
      const actorDelta =
        c.target === "actor" || c.target === "both"
          ? await applyTokenDelta({
              payload: c.payload,
              targetIdentityId: args.actorIdentityId,
              communityId: args.communityId,
              streamId: args.streamId,
              sessionId: args.sessionId,
              eventId: event.id,
              trigger: args.trigger,
            })
          : undefined;
      // Fan the partner delta out across every resolved partner.
      // Each call rolls independently — `[3, 5]` from a 2-7 range
      // is possible and that's the realistic "everyone got
      // something different" feel for community events.
      let partnerDeltas: number[] | undefined;
      if (
        (c.target === "partner" || c.target === "both") &&
        partners.length > 0
      ) {
        partnerDeltas = [];
        for (const p of partners) {
          partnerDeltas.push(
            await applyTokenDelta({
              payload: c.payload,
              targetIdentityId: p.identityId,
              communityId: args.communityId,
              streamId: args.streamId,
              sessionId: args.sessionId,
              eventId: event.id,
              trigger: args.trigger,
            }),
          );
        }
      }
      applied.push({
        ctype: "token_delta",
        target: c.target,
        tokenDelta: actorDelta,
        partnerTokenDeltas: partnerDeltas,
      });
    } else if (c.ctype === "story") {
      applied.push({ ctype: "story", target: c.target });
    } else if (c.ctype === "modifier") {
      const result = await applyModifier({
        payload: c.payload,
        eventId: event.id,
        communityId: args.communityId,
        streamId: args.streamId,
        sessionId: args.sessionId,
        firedBy: args.actorIdentityId,
      });
      applied.push({
        ctype: "modifier",
        target: c.target,
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
        target: c.target,
        detail: result.ok
          ? `challenge issued (${result.visibility})`
          : `(challenge failed: ${result.reason})`,
      });
    }
  }

  const actorHeadlineDelta = pickHeadlineDelta(applied, "actor");
  const partnerHeadlineDelta = pickHeadlineDelta(applied, "partner");
  const partnerTotal = sumPartnerDeltas(applied);

  // Compose vars: shared BASE (user, streamer, game, touser,
  // random, count?) + HEAVY (uptime, followage, profiles — if
  // chatContext provided) + event-specific (from, to, delta,
  // to_count, to_total, etc.). Resolver substitutes both `$name`
  // and `{name}` syntaxes from the merged map.
  const ctx: TemplateContext = {
    senderDisplayName: args.actorDisplayName,
    args: args.chatContext?.rawArgs ?? "",
    streamerDisplayName: args.streamerDisplayName,
    activeGameSlug: args.gameKey,
    userId: args.chatContext?.streamerUserId,
    broadcasterTwitchId: args.chatContext?.broadcasterTwitchId,
    senderTwitchId: args.chatContext?.senderTwitchId,
  };
  const heavy = await prefetchHeavyVars(event.flavor_tmpl, ctx);
  const partnerDisplayList = renderPartnerList(partners);
  const baseVars = buildBaseVars(ctx, {
    // For mention events / fanout, treat the partner list as the
    // touser fallback so legacy `$touser` templates still work.
    touser: partnerDisplayList || undefined,
  });
  const eventVars = buildEventSpecificVars({
    partners,
    partnerDisplayList,
    actorDelta: actorHeadlineDelta,
    partnerDelta: partnerHeadlineDelta,
    partnerTotal,
  });
  const flavor = renderTemplate(event.flavor_tmpl, {
    ...baseVars,
    ...heavy,
    ...eventVars,
  });

  // Engagement signal — fire-and-forget. Story-only events count
  // as social_action; anything that moved tokens or applied a
  // modifier counts as event_fired (slightly higher weight). Errors
  // inside the log path are swallowed by logSignal so they can't
  // tank chat behavior.
  const touchedSomething = applied.some(
    (a) =>
      (typeof a.tokenDelta === "number" && a.tokenDelta !== 0) ||
      (Array.isArray(a.partnerTokenDeltas) &&
        a.partnerTokenDeltas.some((d) => d !== 0)) ||
      a.ctype === "modifier" ||
      a.ctype === "challenge",
  );
  void logSignal({
    identityId: args.actorIdentityId,
    communityId: args.communityId,
    signalType: touchedSomething ? "event_fired" : "social_action",
    sessionId: args.sessionId,
    streamId: args.streamId,
    meta: { event_key: event.event_key, partner_mode: event.partner_mode },
  });

  return { ok: true, event, flavor, consequences: applied };
}

/** Pick the chat-worthiest delta (largest magnitude) for a given
 *  party — fills `{delta}` / `{from_delta}` / `{to_delta}`.
 *
 *  For fanout events the partner side iterates over every recipient
 *  across every partner-targeted consequence; the headline is the
 *  single largest-magnitude delta so chat reads as the standout
 *  number (`"someone lost 7!"`) rather than an average. */
function pickHeadlineDelta(
  applied: AppliedConsequence[],
  party: "actor" | "partner",
): number | null {
  const deltas: number[] = [];
  for (const a of applied) {
    if (a.ctype !== "token_delta") continue;
    if (party === "actor") {
      if (
        (a.target === "actor" || a.target === "both") &&
        typeof a.tokenDelta === "number"
      ) {
        deltas.push(a.tokenDelta);
      }
    } else {
      if (
        (a.target === "partner" || a.target === "both") &&
        Array.isArray(a.partnerTokenDeltas)
      ) {
        for (const d of a.partnerTokenDeltas) deltas.push(d);
      }
    }
  }
  if (deltas.length === 0) return null;
  return deltas.reduce(
    (acc, v) => (Math.abs(v) > Math.abs(acc) ? v : acc),
    deltas[0],
  );
}

/** Sum of every partner-side delta across every consequence —
 *  surfaces as `{to_total}` for fanout chat lines like
 *  "Happy hour! 47 tokens given out to 12 viewers". */
function sumPartnerDeltas(applied: AppliedConsequence[]): number {
  let total = 0;
  for (const a of applied) {
    if (a.ctype !== "token_delta") continue;
    if (a.target !== "partner" && a.target !== "both") continue;
    if (!Array.isArray(a.partnerTokenDeltas)) continue;
    for (const d of a.partnerTokenDeltas) total += d;
  }
  return total;
}

/**
 * Build the event-specific portion of the substitution map. The
 * shared resolver (`@/lib/templates/resolver`) handles the base
 * variables (`{user}`, `{streamer}`, `{game}`, `{touser}`,
 * `{random}`) and heavy variables (`{uptime}`, `{followage}`,
 * profiles, gamertags). This function only owns the delta /
 * partner-list family that's intrinsic to event firing.
 *
 * Naming:
 *   - `{from}` / `{to}`     — display names. `{to}` is comma-joined
 *                             for fanout events, truncates past 5.
 *   - `{to_count}`          — number of resolved partners.
 *   - `{to_total}`          — sum of partner deltas (fanout headline).
 *   - `{from_delta}` / `{to_delta}`               — abs deltas
 *   - `{from_delta_signed}` / `{to_delta_signed}` — signed deltas
 *   - `{from_verb}` / `{to_verb}`                 — gained/lost/""
 *   - `{delta}` / `{delta_signed}` / `{verb}`     — actor aliases
 */
function buildEventSpecificVars(args: {
  partners: PartnerIdentity[];
  partnerDisplayList: string;
  actorDelta: number | null;
  partnerDelta: number | null;
  partnerTotal: number;
}): Record<string, string> {
  const fromAbs =
    args.actorDelta === null ? "" : Math.abs(args.actorDelta).toString();
  const fromSigned = signedString(args.actorDelta);
  const fromVerb = verbFor(args.actorDelta);
  const toAbs =
    args.partnerDelta === null ? "" : Math.abs(args.partnerDelta).toString();
  const toSigned = signedString(args.partnerDelta);
  const toVerb = verbFor(args.partnerDelta);
  return {
    // `{from}` is the actor — same as `{user}` from base vars but
    // explicit for 2-party narratives.
    to: args.partnerDisplayList,
    to_count: args.partners.length.toString(),
    to_total:
      args.partnerTotal === 0
        ? ""
        : Math.abs(args.partnerTotal).toString(),
    from_delta: fromAbs,
    to_delta: toAbs,
    from_delta_signed: fromSigned,
    to_delta_signed: toSigned,
    from_verb: fromVerb,
    to_verb: toVerb,
    // Actor-side aliases for 1-party templates.
    delta: fromAbs,
    delta_signed: fromSigned,
    verb: fromVerb,
  };
}

/** Comma-join display names for `{to}`. Past 5 partners we switch
 *  to a count + sample so chat doesn't post a 60-name wall of
 *  shouts ("alice, bob, carol, dave, eve + 42 more"). */
function renderPartnerList(partners: PartnerIdentity[]): string {
  if (partners.length === 0) return "";
  if (partners.length <= 5) {
    return partners.map((p) => p.displayName).join(", ");
  }
  const head = partners.slice(0, 5).map((p) => p.displayName).join(", ");
  return `${head} + ${partners.length - 5} more`;
}

function signedString(n: number | null): string {
  if (n === null) return "";
  return n >= 0 ? `+${n}` : `${n}`;
}

function verbFor(n: number | null): string {
  if (n === null || n === 0) return "";
  return n > 0 ? "gained" : "lost";
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
