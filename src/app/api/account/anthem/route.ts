/**
 * GET  /api/account/anthem  → { anthem, catalog }  (the signed-in user's
 *                              personal walk-up anthem + the servable catalog)
 * PUT  /api/account/anthem  → upsert the personal anthem
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserAnthem, upsertUserAnthem, listCatalog } from "@/lib/anthems/store";
import type { UserAnthemInput } from "@/lib/anthems/types";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const [anthem, catalog] = await Promise.all([getUserAnthem(user.id), listCatalog({ servableOnly: true })]);
  return NextResponse.json({ ok: true, anthem, catalog });
}

export async function PUT(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Partial<UserAnthemInput>;
  const input: UserAnthemInput = {
    trackId: typeof body.trackId === "string" ? body.trackId : null,
    startMs: Number.isFinite(body.startMs) ? Number(body.startMs) : 0,
    durationMs: Number.isFinite(body.durationMs) ? Number(body.durationMs) : 15000,
    volume: Number.isFinite(body.volume) ? Number(body.volume) : 0.8,
    enabled: body.enabled !== false,
  };

  const anthem = await upsertUserAnthem(user.id, input);
  if (!anthem) return NextResponse.json({ error: "save_failed" }, { status: 500 });
  return NextResponse.json({ ok: true, anthem });
}
