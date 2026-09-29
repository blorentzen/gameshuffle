import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { identify, loadNight, PartyError, viewFor } from "@/lib/party/nights";
import { activityView, draftPools, loadActivity } from "@/lib/party/activities";
import { isActivity } from "@/lib/nights/games";

export const runtime = "nodejs";

/**
 * GET /api/party/[code] — the night as this person may see it. Signed-in
 * people are known by account; guests send their seat key in `x-party-seat`.
 * `?view=tv` is the big screen: always the public view, even on the host's
 * laptop, so a secret never ends up on the TV.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  try {
    const l = await loadNight(code);
    if (!l) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const tv = req.nextUrl.searchParams.get("view") === "tv";
    const v = tv ? { isHost: false, seat: null } : identify(l, user?.id ?? null, req.headers.get("x-party-seat"));
    // Activity data backs the current activity, and tonight's draft pools for every game after a draft.
    const needs = isActivity(l.current.game_slug) || l.games.some((g) => g.game_slug === "draft-night");
    const act = needs ? await loadActivity(l.night.id) : null;
    const activity = act && isActivity(l.current.game_slug) ? activityView(l, act, v) : null;
    const pools = act ? draftPools(l, act) : null;
    return NextResponse.json({ ok: true, signedIn: !!user, tv, ...viewFor(l, v), activity, pools }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const err = e instanceof PartyError ? e : new PartyError("server_error", 500);
    return NextResponse.json({ error: err.code }, { status: err.status });
  }
}
