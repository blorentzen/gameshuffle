/**
 * /api/levels/maker (curation picks 9A): the signed-in player's Super Mario Maker 2 maker ID, shown on their levels.
 *
 *   GET → { ready, makerId }
 *   PUT { makerId: string | null } → { makerId }   checked with the code's own check bits (it has to be a maker ID)
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { makerIdOf, setMakerId } from "@/lib/levels/curation";

export const runtime = "nodejs";

async function viewer(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET() {
  const userId = await viewer();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  return NextResponse.json(await makerIdOf(userId));
}

export async function PUT(request: Request) {
  const userId = await viewer();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { makerId?: unknown } | null;
  const r = await setMakerId(userId, typeof body?.makerId === "string" ? body.makerId : null);
  return r.ok ? NextResponse.json({ makerId: r.makerId }) : NextResponse.json({ error: "bad_maker_id", line: r.line }, { status: 400 });
}
