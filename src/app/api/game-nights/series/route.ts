/**
 * GET /api/game-nights/series → the host's recurring series (with the
 * next computed occurrence). Series are created through the night host flow
 * (`repeat`), not here. See `src/lib/game-nights/series.ts`.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listSeries } from "@/lib/game-nights/series";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ series: [] });
  return NextResponse.json({ series: await listSeries() });
}
