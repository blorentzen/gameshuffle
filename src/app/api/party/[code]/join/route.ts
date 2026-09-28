import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { joinSeat, loadNight, PartyError } from "@/lib/party/nights";

export const runtime = "nodejs";

/**
 * POST /api/party/[code]/join — take a seat. Body: { seat, name }.
 * Guests get back a seat key to keep on their phone; accounts are linked.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const b = (await req.json().catch(() => ({}))) as { seat?: number; name?: string };
  try {
    const l = await loadNight(code);
    if (!l) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const res = await joinSeat(l, Number(b.seat), String(b.name ?? ""), user?.id ?? null);
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    const err = e instanceof PartyError ? e : new PartyError("server_error", 500);
    return NextResponse.json({ error: err.code }, { status: err.status });
  }
}
