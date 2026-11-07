import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { spaceById, spaceOpen } from "@/lib/games/spaces";
import { isStaffRole } from "@/lib/subscription";
import { gsDay } from "@/lib/time/gsClock";
import { rateLimit } from "@/lib/ratelimit";
import { cleanRoll, rollForSpace, rollSigned } from "@/lib/rolls/spaceRoll";
import { createPost, getPost } from "@/lib/social/feed";

export const runtime = "nodejs";

/**
 * POST /api/games/<space>/roll
 *   { action: "roll" }: a roll from the space's randomizer, signed (anyone; nothing is saved).
 *   { action: "share", roll, sig, note? }: post that roll in the space (signed in; only a roll this route made).
 * A space that hasn't opened is staff only.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ space: string }> }) {
  const s = spaceById((await params).space);
  if (!s) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!spaceOpen(s, gsDay())) {
    const role = user ? ((await createServiceClient().from("users").select("role").eq("id", user.id).maybeSingle()).data as { role: string | null } | null)?.role ?? null : null;
    if (!isStaffRole(role)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => null)) as { action?: unknown; roll?: unknown; sig?: unknown; note?: unknown } | null;
  const who = user?.id ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";

  if (body?.action === "roll") {
    if (!(await rateLimit(`space-roll:${who}`, { max: 30, windowMs: 60_000 })).ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    const r = rollForSpace(s);
    if (!r) return NextResponse.json({ error: "no_roller" }, { status: 400 });
    return NextResponse.json({ ok: true, ...r });
  }

  if (body?.action === "share") {
    if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    const roll = cleanRoll(body.roll);
    if (!roll || typeof body.sig !== "string" || !rollSigned(roll, body.sig)) return NextResponse.json({ error: "bad_roll" }, { status: 400 });
    const note = typeof body.note === "string" ? body.note.slice(0, 280) : "";
    const res = await createPost({ authorId: user.id, body: note, kind: "roll", meta: { roll }, game: s.primary }).catch(() => null);
    if (!res) return NextResponse.json({ error: "server_error" }, { status: 500 });
    if (!res.ok) return NextResponse.json({ error: res.reason }, { status: res.reason === "rate_limited" ? 429 : 400 });
    const post = await getPost(res.id, user.id).catch(() => null);
    return NextResponse.json({ ok: true, id: res.id, post });
  }

  return NextResponse.json({ error: "bad_request" }, { status: 400 });
}
