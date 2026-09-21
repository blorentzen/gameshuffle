/**
 * GET /api/account/profile-status → { status, nowPlaying }
 * PUT /api/account/profile-status  body: { status?, nowPlaying? } → clean + save
 *
 * Stored on `users.profile_status` + `users.profile_now_playing`. Authenticated.
 * Plain text only — normalized through the resolvers on read + write.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveProfileStatus, resolveNowPlaying } from "@/lib/profile/status";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const admin = createServiceClient();
  const { data } = await admin.from("users").select("profile_status, profile_now_playing").eq("id", user.id).maybeSingle();
  const row = (data ?? {}) as { profile_status?: unknown; profile_now_playing?: unknown };
  return NextResponse.json({ ok: true, status: resolveProfileStatus(row.profile_status), nowPlaying: resolveNowPlaying(row.profile_now_playing) });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { status?: unknown; nowPlaying?: unknown } | null;
  const status = resolveProfileStatus(body?.status);
  const nowPlaying = resolveNowPlaying(body?.nowPlaying);

  const admin = createServiceClient();
  const { error } = await admin.from("users").update({ profile_status: status, profile_now_playing: nowPlaying }).eq("id", user.id);
  if (error) return NextResponse.json({ error: "migration_pending" }, { status: 503 });
  return NextResponse.json({ ok: true, status, nowPlaying });
}
