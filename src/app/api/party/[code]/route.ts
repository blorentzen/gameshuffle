import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { identify, loadNight, PartyError, viewFor } from "@/lib/party/nights";

export const runtime = "nodejs";

/**
 * GET /api/party/[code] — the night as this person may see it. Signed-in
 * people are known by account; guests send their seat key in `x-party-seat`.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  try {
    const l = await loadNight(code);
    if (!l) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const v = identify(l, user?.id ?? null, req.headers.get("x-party-seat"));
    return NextResponse.json({ ok: true, signedIn: !!user, ...viewFor(l, v) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const err = e instanceof PartyError ? e : new PartyError("server_error", 500);
    return NextResponse.json({ error: err.code }, { status: err.status });
  }
}
