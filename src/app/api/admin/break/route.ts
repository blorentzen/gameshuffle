/**
 * Platform ▸ Originals ▸ Break mode (staff/admin).
 *   GET  → this week's breaks, players, and the questions mods pulled
 *   POST { game, key, keep } → keep a pulled question (it can play again) or retire it for good
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/shop/adminGuard";
import { breakAdminSummary, reviewPulled } from "@/lib/break/store";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  return NextResponse.json({ ok: true, ...(await breakAdminSummary()) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const gate = await requireStaff(await createClient());
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  const body = (await request.json().catch(() => null)) as { game?: unknown; key?: unknown; keep?: unknown } | null;
  if (typeof body?.game !== "string" || typeof body.key !== "string" || typeof body.keep !== "boolean") {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }
  return (await reviewPulled(body.game, body.key, body.keep)) ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: "not_saved" }, { status: 500 });
}
