/**
 * GET /api/raffles/[id] → { ok, raffle: RaffleSummary | null }
 * Public snapshot of one raffle (pot, entrants, your entries, winner/status),
 * for the raffle card's live refetch.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRaffle, getRaffleSummary } from "@/lib/economy/raffles";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const raffle = await getRaffle(id);
  if (!raffle) return NextResponse.json({ ok: true, raffle: null });
  const summary = await getRaffleSummary(raffle, user?.id ?? null);
  return NextResponse.json({ ok: true, raffle: summary });
}
