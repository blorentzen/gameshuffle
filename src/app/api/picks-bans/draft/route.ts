/**
 * GET / POST /api/picks-bans/draft
 *
 * Evergreen per-(session, game, viewer) draft state. Viewers can build
 * their pick/ban selections at any time during a live GS session —
 * even before a round opens. When a round opens, the draft seeds the
 * picker's initial state. Locking commits a ballot AND mirrors the
 * locked state to the draft so the viewer's selections carry into the
 * next round.
 *
 * Identity model mirrors /api/picks-bans/ballot: authed (Twitch via
 * Supabase) wins when present, otherwise the client-supplied
 * `anonSessionId` UUID is used.
 *
 * GET (read draft):
 *   ?sessionId=...&gameSlug=...&anonSessionId=... (anon)
 *   → { ok: true, draft: PicksBansDraft | null }
 *
 * POST (upsert draft):
 *   {
 *     sessionId, gameSlug,
 *     anonSessionId?,            // required when not authed
 *     picks_tracks?, bans_tracks?,
 *     picks_item_modes?, bans_item_modes?,
 *     picks_item_literal?, bans_item_literal?
 *   }
 *   → { ok: true, draft: PicksBansDraft }
 *
 * Rate-limited per-IP (shared bucket with ballot writes — drafts are
 * the staging side and should respect the same cadence).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { checkAndConsumeRateLimit } from "@/lib/picks-bans/rateLimit";
import type { PicksBansDraft } from "@/lib/picks-bans/types";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface DraftInput {
  sessionId?: unknown;
  gameSlug?: unknown;
  anonSessionId?: unknown;
  picks_tracks?: unknown;
  bans_tracks?: unknown;
  picks_rallies?: unknown;
  bans_rallies?: unknown;
  picks_item_modes?: unknown;
  bans_item_modes?: unknown;
  picks_item_literal?: unknown;
  bans_item_literal?: unknown;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
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
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

/** Resolve viewer identity from the request. Authed wins; anon fallback
 *  validates the supplied UUID shape. Returns null+error response if
 *  neither produces a valid identity. */
async function resolveViewer(args: {
  anonSessionIdRaw: unknown;
}): Promise<
  | { ok: true; twitchUserId: string | null; anonSessionId: string | null }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let twitchUserId: string | null = null;
  if (user) {
    const admin = createServiceClient();
    const { data: profile } = await admin
      .from("users")
      .select("twitch_id")
      .eq("id", user.id)
      .maybeSingle();
    twitchUserId = (profile?.twitch_id as string | null) ?? null;
  }

  if (twitchUserId) {
    return { ok: true, twitchUserId, anonSessionId: null };
  }

  const raw =
    typeof args.anonSessionIdRaw === "string"
      ? args.anonSessionIdRaw.trim()
      : "";
  if (!raw || !UUID_RE.test(raw)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error:
            "Anonymous viewers must supply a valid `anonSessionId` UUID. Sign in with Twitch for a persistent identity instead.",
        },
        { status: 400 },
      ),
    };
  }
  return { ok: true, twitchUserId: null, anonSessionId: raw };
}

const DRAFT_COLUMNS =
  "id, session_id, game_slug, viewer_twitch_user_id, anon_session_id, picks_tracks, bans_tracks, picks_rallies, bans_rallies, picks_item_modes, bans_item_modes, picks_item_literal, bans_item_literal, created_at, updated_at";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId")?.trim() ?? "";
  const gameSlug = url.searchParams.get("gameSlug")?.trim() ?? "";
  if (!sessionId || !gameSlug) {
    return NextResponse.json(
      { ok: false, error: "sessionId_and_gameSlug_required" },
      { status: 400 },
    );
  }

  const viewer = await resolveViewer({
    anonSessionIdRaw: url.searchParams.get("anonSessionId"),
  });
  if (!viewer.ok) return viewer.response;

  const admin = createServiceClient();
  let q = admin
    .from("session_picks_bans_drafts")
    .select(DRAFT_COLUMNS)
    .eq("session_id", sessionId)
    .eq("game_slug", gameSlug);
  if (viewer.twitchUserId) {
    q = q.eq("viewer_twitch_user_id", viewer.twitchUserId);
  } else if (viewer.anonSessionId) {
    q = q.eq("anon_session_id", viewer.anonSessionId);
  }
  const { data, error } = await q.maybeSingle();
  if (error) {
    console.error("[picks-bans/draft] read failed:", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({
    ok: true,
    draft: (data as PicksBansDraft | null) ?? null,
  });
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limited = checkAndConsumeRateLimit(`draft:${ip}`);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", retryAfter: limited.retryAfterMs },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)),
        },
      },
    );
  }

  let body: DraftInput;
  try {
    body = (await request.json()) as DraftInput;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_body" },
      { status: 400 },
    );
  }

  const sessionId =
    typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const gameSlug =
    typeof body.gameSlug === "string" ? body.gameSlug.trim() : "";
  if (!sessionId || !gameSlug) {
    return NextResponse.json(
      { ok: false, error: "sessionId_and_gameSlug_required" },
      { status: 400 },
    );
  }

  const viewer = await resolveViewer({ anonSessionIdRaw: body.anonSessionId });
  if (!viewer.ok) return viewer.response;

  // Gate: session must be active or ending — no point staging drafts
  // for a session that's already over.
  const admin = createServiceClient();
  const { data: session } = await admin
    .from("gs_sessions")
    .select("id, status")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "session_not_found" },
      { status: 404 },
    );
  }
  const sessionStatus = (session as { status: string }).status;
  if (sessionStatus !== "active" && sessionStatus !== "ending") {
    return NextResponse.json(
      { ok: false, error: "session_not_active" },
      { status: 409 },
    );
  }

  const payload = {
    session_id: sessionId,
    game_slug: gameSlug,
    viewer_twitch_user_id: viewer.twitchUserId,
    anon_session_id: viewer.anonSessionId,
    picks_tracks: asStringArray(body.picks_tracks),
    bans_tracks: asStringArray(body.bans_tracks),
    picks_rallies: asStringArray(body.picks_rallies),
    bans_rallies: asStringArray(body.bans_rallies),
    picks_item_modes: asStringArray(body.picks_item_modes),
    bans_item_modes: asStringArray(body.bans_item_modes),
    picks_item_literal: asStringArray(body.picks_item_literal),
    bans_item_literal: asStringArray(body.bans_item_literal),
  };

  // Upsert by the appropriate partial unique index. PostgREST's onConflict
  // option needs the column list; we send the right one based on identity.
  const onConflict = viewer.twitchUserId
    ? "session_id,game_slug,viewer_twitch_user_id"
    : "session_id,game_slug,anon_session_id";

  const { data, error } = await admin
    .from("session_picks_bans_drafts")
    .upsert(payload, { onConflict })
    .select(DRAFT_COLUMNS)
    .single();
  if (error || !data) {
    console.error("[picks-bans/draft] upsert failed:", error);
    return NextResponse.json(
      { ok: false, error: error?.message ?? "upsert_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, draft: data as PicksBansDraft });
}
