import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { identify, loadNight, PartyError, runAction, type ActionBody } from "@/lib/party/nights";

export const runtime = "nodejs";

/**
 * POST /api/party/[code]/action — everything that changes a night.
 *   Host: deal, draw, rules, turn, result (finishing order), next (game), add (game), end.
 *   Card owner: play, discard, claim (a mission as done).
 *   Host or another player: confirm or reject someone else's mission.
 * Guests identify with `x-party-seat`.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = (await req.json().catch(() => ({}))) as ActionBody;
  try {
    const l = await loadNight(code);
    if (!l) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const v = identify(l, user?.id ?? null, req.headers.get("x-party-seat"));
    if (!v.isHost && v.seat === null) return NextResponse.json({ error: "not_in_night" }, { status: 403 });
    const out = await runAction(l, v, body);
    return NextResponse.json({ ok: true, paid: out.paid ?? null });
  } catch (e) {
    const err = e instanceof PartyError ? e : new PartyError("server_error", 500);
    return NextResponse.json({ error: err.code }, { status: err.status });
  }
}
