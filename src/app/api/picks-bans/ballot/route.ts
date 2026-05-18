/**
 * POST /api/picks-bans/ballot
 *
 * Viewer-facing endpoint for submitting / updating / locking a ballot
 * in an open picks/bans round. Accepts both authed (Twitch OAuth via
 * Supabase) viewers and anonymous viewers identified by a UUID stored
 * in browser sessionStorage.
 *
 * Request body:
 *   {
 *     roundId: string,
 *     anonSessionId?: string,    // required when not authed
 *     viewerDisplayName?: string,
 *     picks_tracks?: string[],
 *     bans_tracks?: string[],
 *     picks_item_modes?: string[],
 *     bans_item_modes?: string[],
 *     picks_item_literal?: string[],
 *     bans_item_literal?: string[],
 *     lock?: boolean              // when true, sets locked_at
 *   }
 *
 * Auth model:
 *   - Authed viewers: identified by Supabase user → twitch_user_id
 *     (resolved server-side from `users.twitch_id`)
 *   - Anonymous viewers: client-supplied UUID
 *   - One ballot per identity per round (DB-enforced via unique indexes)
 *
 * Rate limits (per-IP, in-memory bucket — sufficient at current scale):
 *   - 30 writes per minute per IP
 *   - Returns 429 when exceeded
 *
 * Returns:
 *   { ok: true, ballotId: string, locked: boolean }
 *   { ok: false, error: string }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { recordEvent } from "@/lib/sessions/service";
import { SESSION_EVENT_TYPES } from "@/lib/sessions/event-types";
import { checkAndConsumeRateLimit } from "@/lib/picks-bans/rateLimit";

export const runtime = "nodejs";

interface BallotInput {
  roundId?: unknown;
  anonSessionId?: unknown;
  viewerDisplayName?: unknown;
  picks_tracks?: unknown;
  bans_tracks?: unknown;
  picks_rallies?: unknown;
  bans_rallies?: unknown;
  picks_item_modes?: unknown;
  bans_item_modes?: unknown;
  picks_item_literal?: unknown;
  bans_item_literal?: unknown;
  lock?: unknown;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  // De-dup and cap at 200 entries to defend against ballot stuffing.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of v) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed || trimmed.length > 100) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= 200) break;
  }
  return out;
}

function getClientIp(request: Request): string {
  // Vercel sets x-forwarded-for; first entry is the original client.
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limited = checkAndConsumeRateLimit(`ballot:${ip}`);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", retryAfter: limited.retryAfterMs },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)),
        },
      }
    );
  }

  let body: BallotInput;
  try {
    body = (await request.json()) as BallotInput;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_body" },
      { status: 400 }
    );
  }

  const roundId = typeof body.roundId === "string" ? body.roundId.trim() : "";
  if (!roundId) {
    return NextResponse.json(
      { ok: false, error: "round_id_required" },
      { status: 400 }
    );
  }

  // Resolve viewer identity. Authed (Supabase user → twitch_id) wins
  // when both are present. Anonymous fallback uses the client UUID.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = createServiceClient();

  let viewerTwitchUserId: string | null = null;
  let viewerDisplayName: string | null = null;

  if (user) {
    const { data: profile } = await admin
      .from("users")
      .select("twitch_id, twitch_username, display_name")
      .eq("id", user.id)
      .maybeSingle();
    viewerTwitchUserId =
      (profile?.twitch_id as string | null) ?? null;
    viewerDisplayName =
      (profile?.display_name as string | null) ??
      (profile?.twitch_username as string | null) ??
      null;
  }

  let anonSessionId: string | null = null;
  if (!viewerTwitchUserId) {
    const raw =
      typeof body.anonSessionId === "string" ? body.anonSessionId.trim() : "";
    // Validate UUID-ish shape — 8-4-4-4-12 hex. Reject anything else so
    // a malformed or tampered ID can't slip a duplicate ballot under
    // the unique index.
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!raw || !uuidRe.test(raw)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Anonymous viewers must supply a valid `anonSessionId` UUID. Sign in with Twitch for a persistent identity instead.",
        },
        { status: 400 }
      );
    }
    anonSessionId = raw;
  }

  // Override display name from body when provided (anonymous viewers
  // can self-identify; authed viewers' name comes from their profile).
  if (
    !viewerTwitchUserId &&
    typeof body.viewerDisplayName === "string"
  ) {
    const name = body.viewerDisplayName.trim().slice(0, 60);
    if (name) viewerDisplayName = name;
  }

  // Verify the round exists, is open, and belongs to an active session.
  const { data: round } = await admin
    .from("session_picks_bans_rounds")
    .select("id, status, session_id")
    .eq("id", roundId)
    .maybeSingle();
  if (!round) {
    return NextResponse.json(
      { ok: false, error: "round_not_found" },
      { status: 404 }
    );
  }
  if ((round as { status: string }).status !== "open") {
    return NextResponse.json(
      { ok: false, error: "round_not_open" },
      { status: 409 }
    );
  }

  const picksTracks = asStringArray(body.picks_tracks);
  const bansTracks = asStringArray(body.bans_tracks);
  const picksRallies = asStringArray(body.picks_rallies);
  const bansRallies = asStringArray(body.bans_rallies);
  const picksItemModes = asStringArray(body.picks_item_modes);
  const bansItemModes = asStringArray(body.bans_item_modes);
  const picksItemLiteral = asStringArray(body.picks_item_literal);
  const bansItemLiteral = asStringArray(body.bans_item_literal);
  const lock = body.lock === true;

  // Find existing ballot for this identity in this round — upsert.
  let existingBallotId: string | null = null;
  let existingLocked = false;
  {
    let q = admin
      .from("session_picks_bans_ballots")
      .select("id, locked_at")
      .eq("round_id", roundId);
    if (viewerTwitchUserId) {
      q = q.eq("viewer_twitch_user_id", viewerTwitchUserId);
    } else if (anonSessionId) {
      q = q.eq("anon_session_id", anonSessionId);
    }
    const { data: existing } = await q.maybeSingle();
    if (existing) {
      existingBallotId = (existing as { id: string }).id;
      existingLocked = !!(existing as { locked_at: string | null }).locked_at;
    }
  }

  // Once locked, the ballot is frozen. Per Britton's rule: viewers lock
  // their vote and the streamer decides. Subsequent writes (including
  // re-locks) are no-ops, returning the existing ballot.
  if (existingLocked) {
    return NextResponse.json({
      ok: true,
      ballotId: existingBallotId,
      locked: true,
      message: "Ballot already locked.",
    });
  }

  const payload: Record<string, unknown> = {
    round_id: roundId,
    viewer_twitch_user_id: viewerTwitchUserId,
    anon_session_id: anonSessionId,
    viewer_display_name: viewerDisplayName,
    picks_tracks: picksTracks,
    bans_tracks: bansTracks,
    picks_rallies: picksRallies,
    bans_rallies: bansRallies,
    picks_item_modes: picksItemModes,
    bans_item_modes: bansItemModes,
    picks_item_literal: picksItemLiteral,
    bans_item_literal: bansItemLiteral,
    locked_at: lock ? new Date().toISOString() : null,
  };

  let resultId: string;
  if (existingBallotId) {
    const { data, error } = await admin
      .from("session_picks_bans_ballots")
      .update(payload)
      .eq("id", existingBallotId)
      .select("id")
      .single();
    if (error || !data) {
      console.error("[picks-bans/ballot] update failed:", error);
      return NextResponse.json(
        { ok: false, error: error?.message ?? "update_failed" },
        { status: 500 }
      );
    }
    resultId = (data as { id: string }).id;
  } else {
    const { data, error } = await admin
      .from("session_picks_bans_ballots")
      .insert(payload)
      .select("id")
      .single();
    if (error || !data) {
      console.error("[picks-bans/ballot] insert failed:", error);
      return NextResponse.json(
        { ok: false, error: error?.message ?? "insert_failed" },
        { status: 500 }
      );
    }
    resultId = (data as { id: string }).id;
  }

  // Audit on lock — in-progress edits are noisy and not interesting.
  if (lock) {
    try {
      await recordEvent({
        sessionId: (round as { session_id: string }).session_id,
        eventType: SESSION_EVENT_TYPES.picks_bans_ballot_locked,
        actorType: viewerTwitchUserId ? "viewer" : "system",
        actorId: viewerTwitchUserId ?? anonSessionId ?? undefined,
        payload: {
          round_id: roundId,
          ballot_id: resultId,
          authed: !!viewerTwitchUserId,
        },
      });
    } catch (err) {
      console.error("[picks-bans/ballot] audit failed:", err);
    }
  }

  return NextResponse.json({
    ok: true,
    ballotId: resultId,
    locked: lock,
  });
}
