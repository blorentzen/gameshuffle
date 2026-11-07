import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { spaceById, spaceOpen } from "@/lib/games/spaces";
import { isStaffRole } from "@/lib/subscription";
import { gsDay } from "@/lib/time/gsClock";
import { rateLimit } from "@/lib/ratelimit";
import { challengeView, checkInDay, checkInWeek } from "@/lib/spaces/challenges";

export const runtime = "nodejs";

/**
 * GET  /api/games/<space>/challenge: the space's thing of the day and of the week, the counts and your progress.
 * POST /api/games/<space>/challenge (signed in)
 *   { kind: "day" }: check in on today's (once a day; pays tokens, and a streak bonus every few days in a row).
 *   { kind: "week", step }: tick off a step of this week's (finishing pays the week's tokens once).
 * A space that hasn't opened is staff only.
 */
async function gate(space: string) {
  const s = spaceById(space);
  if (!s) return { s: null, user: null, res: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!spaceOpen(s, gsDay())) {
    const role = user ? ((await createServiceClient().from("users").select("role").eq("id", user.id).maybeSingle()).data as { role: string | null } | null)?.role ?? null : null;
    if (!isStaffRole(role)) return { s: null, user: null, res: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  }
  return { s, user, res: null };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ space: string }> }) {
  const { s, user, res } = await gate((await params).space);
  if (!s) return res!;
  return NextResponse.json(await challengeView(s, user?.id ?? null));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ space: string }> }) {
  const { s, user, res } = await gate((await params).space);
  if (!s) return res!;
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!(await rateLimit(`space-checkin:${user.id}`, { max: 20, windowMs: 60_000 })).ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { kind?: unknown; step?: unknown } | null;
  try {
    const r = body?.kind === "day" ? await checkInDay(user.id, s)
      : body?.kind === "week" ? await checkInWeek(user.id, s, Number(body.step))
      : null;
    if (!r) return NextResponse.json({ error: "bad_request" }, { status: 400 });
    if (!r.ok) return NextResponse.json(r, { status: r.error === "already" ? 409 : r.error === "not_ready" ? 503 : 400 });
    return NextResponse.json(r);
  } catch (e) {
    console.error("[spaces] check-in failed:", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
