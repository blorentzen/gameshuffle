import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { spaceById, spaceOpen } from "@/lib/games/spaces";
import { setJoined } from "@/lib/games/spaceData";
import { isStaffRole } from "@/lib/subscription";
import { gsDay } from "@/lib/time/gsClock";

/**
 * POST /api/games/<space>/join { join: boolean }: join or leave a game space (phone picks 2026-11-05, 5A). Joining
 * puts the space's main game in your games; leaving takes its games out. Signed in; a space that hasn't opened is
 * staff only.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ space: string }> }) {
  const s = spaceById((await params).space);
  if (!s) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!spaceOpen(s, gsDay())) {
    const { data } = await createServiceClient().from("users").select("role").eq("id", user.id).maybeSingle();
    if (!isStaffRole((data as { role: string | null } | null)?.role)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => null)) as { join?: unknown } | null;
  if (typeof body?.join !== "boolean") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const r = await setJoined(s, user.id, body.join);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "full" ? 409 : 500 });
  return NextResponse.json(r);
}
