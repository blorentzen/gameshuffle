/**
 * GET /api/account/schedule → { schedule } (normalized, or null)
 * PUT /api/account/schedule  body: { schedule } → validate + save (or clear)
 *
 * Stored on `users.stream_schedule`. Authenticated. Normalized through
 * resolveStreamSchedule on read + write.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveStreamSchedule } from "@/lib/schedule/streamSchedule";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const admin = createServiceClient();
  const { data } = await admin.from("users").select("stream_schedule").eq("id", user.id).maybeSingle();
  return NextResponse.json({ ok: true, schedule: resolveStreamSchedule((data as { stream_schedule?: unknown } | null)?.stream_schedule) });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { schedule?: unknown } | null;
  const schedule = resolveStreamSchedule(body?.schedule); // null when empty/invalid → clears

  const admin = createServiceClient();
  const { error } = await admin.from("users").update({ stream_schedule: schedule }).eq("id", user.id);
  if (error) return NextResponse.json({ error: "migration_pending" }, { status: 503 });
  return NextResponse.json({ ok: true, schedule });
}
