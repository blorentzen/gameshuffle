/**
 * Staff: GIFs to look at (Platform ▸ People ▸ GIFs).
 *   GET                              → { gifs: StaffGif[] } (held by the check, or reported; oldest first)
 *   POST { id, action: "allow" }     → back to ok, its reports dismissed
 *   POST { id, action: "remove", reason } → taken down, files deleted, fingerprint kept, reports actioned
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/shop/adminGuard";
import { gifsReady, staffAllow, staffQueue, staffRemove } from "@/lib/gifs/store";

export const runtime = "nodejs";

export async function GET() {
  const guard = await requireStaff(await createClient());
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  if (!(await gifsReady())) return NextResponse.json({ error: "not_ready" }, { status: 503 });
  return NextResponse.json({ gifs: await staffQueue() });
}

export async function POST(req: NextRequest) {
  const guard = await requireStaff(await createClient());
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const body = (await req.json().catch(() => null)) as { id?: unknown; action?: unknown; reason?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "bad_body" }, { status: 400 });
  if (body?.action === "allow") {
    return (await staffAllow(guard.userId, id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (body?.action === "remove") {
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "Removed by staff";
    return (await staffRemove(guard.userId, id, reason)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ error: "bad_action" }, { status: 400 });
}
