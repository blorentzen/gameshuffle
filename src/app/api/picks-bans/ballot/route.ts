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
import { saveBallot } from "@/lib/picks-bans/ballot";
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

  const r = await saveBallot({
    roundId,
    viewerTwitchUserId,
    anonSessionId,
    displayName: viewerDisplayName,
    fields: {
      picks_tracks: asStringArray(body.picks_tracks),
      bans_tracks: asStringArray(body.bans_tracks),
      picks_rallies: asStringArray(body.picks_rallies),
      bans_rallies: asStringArray(body.bans_rallies),
      picks_item_modes: asStringArray(body.picks_item_modes),
      bans_item_modes: asStringArray(body.bans_item_modes),
      picks_item_literal: asStringArray(body.picks_item_literal),
      bans_item_literal: asStringArray(body.bans_item_literal),
    },
    lock: body.lock === true,
  });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  if (r.alreadyLocked) return NextResponse.json({ ok: true, ballotId: r.ballotId, locked: true, message: "Ballot already locked." });
  return NextResponse.json({ ok: true, ballotId: r.ballotId, locked: r.locked });
}
