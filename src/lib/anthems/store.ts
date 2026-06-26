/**
 * Walk-Up Anthems — server-side data access + the trigger resolver.
 *
 * User-scoped reads/writes go through the RLS-bound server client (owner can
 * only touch their own row). Cross-user resolution (the overlay/event handler
 * playing viewer A's anthem on streamer B's channel) goes through the
 * service-role client.
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { servableProviderIds, isProviderServable } from "./providers/registry";
import {
  ANTHEM_MIN_DURATION_MS,
  ANTHEM_MAX_DURATION_MS,
  type AnthemRole,
  type AnthemTrack,
  type AnthemTrigger,
  type ChannelAnthemPolicy,
  type ResolvedAnthem,
  type UserAnthem,
  type UserAnthemInput,
} from "./types";

// ── Row mappers ────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToTrack(r: any): AnthemTrack {
  return {
    id: r.id,
    provider: r.provider,
    providerTrackId: r.provider_track_id,
    title: r.title,
    artist: r.artist ?? null,
    genre: r.genre ?? null,
    durationMs: r.duration_ms ?? null,
    audioUrl: r.audio_url,
    artworkUrl: r.artwork_url ?? null,
    license: r.license ?? null,
    attribution: r.attribution ?? null,
    suggestedStartMs: r.suggested_start_ms ?? 0,
    isActive: r.is_active ?? true,
  };
}

function rowToUserAnthem(r: any): UserAnthem {
  return {
    userId: r.user_id,
    trackId: r.track_id ?? null,
    startMs: r.start_ms ?? 0,
    durationMs: r.duration_ms ?? 15000,
    volume: r.volume ?? 0.8,
    enabled: r.enabled ?? true,
    updatedAt: r.updated_at,
  };
}

function rowToPolicy(r: any): ChannelAnthemPolicy {
  return {
    ownerUserId: r.owner_user_id,
    enabled: r.enabled ?? false,
    trigger: (r.trigger ?? "first_chat") as AnthemTrigger,
    eligibleRoles: (r.eligible_roles ?? ["subscriber", "vip", "moderator"]) as AnthemRole[],
    allowCustom: r.allow_custom ?? false,
    volume: r.volume ?? 0.8,
    cooldownSeconds: r.cooldown_seconds ?? 0,
    maxDurationMs: r.max_duration_ms ?? 15000,
    updatedAt: r.updated_at ?? null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function defaultPolicy(ownerUserId: string): ChannelAnthemPolicy {
  return {
    ownerUserId,
    enabled: false,
    trigger: "first_chat",
    eligibleRoles: ["subscriber", "vip", "moderator"],
    allowCustom: false,
    volume: 0.8,
    cooldownSeconds: 0,
    maxDurationMs: 15000,
    updatedAt: null,
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// ── Catalog ────────────────────────────────────────────────────────

export async function listCatalog(opts?: {
  provider?: string;
  servableOnly?: boolean;
}): Promise<AnthemTrack[]> {
  const supabase = createServiceClient();
  let query = supabase.from("gs_anthem_tracks").select("*").eq("is_active", true);
  if (opts?.provider) query = query.eq("provider", opts.provider);
  if (opts?.servableOnly !== false) {
    const ids = servableProviderIds();
    if (ids.length === 0) return [];
    query = query.in("provider", ids);
  }
  const { data, error } = await query.order("title");
  if (error || !data) return [];
  return data.map(rowToTrack);
}

export async function getTrack(trackId: string): Promise<AnthemTrack | null> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("gs_anthem_tracks").select("*").eq("id", trackId).maybeSingle();
  return data ? rowToTrack(data) : null;
}

// ── Personal anthem (owner-scoped) ─────────────────────────────────

export async function getUserAnthem(userId: string): Promise<UserAnthem | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("gs_user_anthems").select("*").eq("user_id", userId).maybeSingle();
  return data ? rowToUserAnthem(data) : null;
}

export async function upsertUserAnthem(userId: string, input: UserAnthemInput): Promise<UserAnthem | null> {
  const supabase = await createClient();
  const durationMs = clamp(Math.round(input.durationMs), ANTHEM_MIN_DURATION_MS, ANTHEM_MAX_DURATION_MS);
  const startMs = Math.max(0, Math.round(input.startMs));
  const volume = clamp(input.volume, 0, 1);
  const { data, error } = await supabase
    .from("gs_user_anthems")
    .upsert(
      {
        user_id: userId,
        track_id: input.trackId,
        start_ms: startMs,
        duration_ms: durationMs,
        volume,
        enabled: input.enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .maybeSingle();
  if (error || !data) return null;
  return rowToUserAnthem(data);
}

// ── Channel policy (streamer-scoped) ───────────────────────────────

export async function getChannelPolicy(ownerUserId: string): Promise<ChannelAnthemPolicy> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("gs_channel_anthem_policy")
    .select("*")
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();
  return data ? rowToPolicy(data) : defaultPolicy(ownerUserId);
}

export async function upsertChannelPolicy(
  ownerUserId: string,
  input: Partial<Omit<ChannelAnthemPolicy, "ownerUserId" | "updatedAt">>,
): Promise<ChannelAnthemPolicy | null> {
  const supabase = await createClient();
  const current = await getChannelPolicy(ownerUserId);
  const merged = { ...current, ...input };
  const { data, error } = await supabase
    .from("gs_channel_anthem_policy")
    .upsert(
      {
        owner_user_id: ownerUserId,
        enabled: merged.enabled,
        trigger: merged.trigger,
        eligible_roles: merged.eligibleRoles,
        allow_custom: merged.allowCustom,
        volume: clamp(merged.volume, 0, 1),
        cooldown_seconds: Math.max(0, Math.round(merged.cooldownSeconds)),
        max_duration_ms: clamp(Math.round(merged.maxDurationMs), ANTHEM_MIN_DURATION_MS, ANTHEM_MAX_DURATION_MS),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_user_id" },
    )
    .select("*")
    .maybeSingle();
  if (error || !data) return null;
  return rowToPolicy(data);
}

// ── Trigger resolver (the seam the event handler calls) ────────────

/**
 * Decide whether — and what — to play when a trigger fires for a viewer on a
 * channel. Pure read; the caller records the play (see recordAnthemPlay) after
 * the overlay confirms, mirroring the wheel announce-deferral pattern.
 *
 * Returns null when any gate fails: channel disabled, wrong trigger, viewer not
 * an eligible role, no/disabled personal anthem, track inactive, provider not
 * servable (and custom not allowed), or still within per-viewer cooldown.
 */
export async function resolveAnthemForTrigger(args: {
  streamerOwnerId: string;
  viewerUserId: string;
  roles: AnthemRole[];
  trigger: AnthemTrigger;
}): Promise<ResolvedAnthem | null> {
  const supabase = createServiceClient();

  const { data: policyRow } = await supabase
    .from("gs_channel_anthem_policy")
    .select("*")
    .eq("owner_user_id", args.streamerOwnerId)
    .maybeSingle();
  const policy = policyRow ? rowToPolicy(policyRow) : defaultPolicy(args.streamerOwnerId);

  if (!policy.enabled) return null;
  if (policy.trigger !== args.trigger) return null;

  const eligible =
    policy.eligibleRoles.includes("everyone") ||
    args.roles.some((r) => policy.eligibleRoles.includes(r));
  if (!eligible) return null;

  const { data: anthemRow } = await supabase
    .from("gs_user_anthems")
    .select("*")
    .eq("user_id", args.viewerUserId)
    .maybeSingle();
  if (!anthemRow) return null;
  const anthem = rowToUserAnthem(anthemRow);
  if (!anthem.enabled || !anthem.trackId) return null;

  const { data: trackRow } = await supabase
    .from("gs_anthem_tracks")
    .select("*")
    .eq("id", anthem.trackId)
    .maybeSingle();
  if (!trackRow) return null;
  const track = rowToTrack(trackRow);
  if (!track.isActive) return null;

  // Servability gate: only play cleared-provider tracks unless the streamer
  // has explicitly opted into custom/non-cleared anthems on their channel.
  if (!isProviderServable(track.provider) && !policy.allowCustom) return null;

  // Per-viewer cooldown.
  if (policy.cooldownSeconds > 0) {
    const since = new Date(Date.now() - policy.cooldownSeconds * 1000).toISOString();
    const { data: recent } = await supabase
      .from("gs_anthem_plays")
      .select("id")
      .eq("owner_user_id", args.streamerOwnerId)
      .eq("viewer_user_id", args.viewerUserId)
      .gte("created_at", since)
      .limit(1);
    if (recent && recent.length > 0) return null;
  }

  const durationMs = clamp(anthem.durationMs, ANTHEM_MIN_DURATION_MS, Math.min(ANTHEM_MAX_DURATION_MS, policy.maxDurationMs));

  return {
    trackId: track.id,
    audioUrl: track.audioUrl,
    title: track.title,
    artist: track.artist,
    artworkUrl: track.artworkUrl,
    startMs: anthem.startMs,
    durationMs,
    volume: clamp(anthem.volume * policy.volume, 0, 1),
    attribution: track.attribution,
  };
}

/** Record an anthem play (audit + cooldown). Service-role write. */
export async function recordAnthemPlay(args: {
  streamerOwnerId: string;
  viewerUserId: string;
  trackId: string;
  trigger: AnthemTrigger;
}): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("gs_anthem_plays").insert({
    owner_user_id: args.streamerOwnerId,
    viewer_user_id: args.viewerUserId,
    track_id: args.trackId,
    trigger: args.trigger,
  });
}
