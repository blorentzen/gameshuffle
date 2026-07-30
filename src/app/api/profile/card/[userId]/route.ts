/**
 * GET /api/profile/card/[userId] → { ok, card } | 404
 *
 * Backs the hover/tap profile card (Spec 1). Readable without auth — the card
 * appears on public surfaces (live, leaderboards, brackets) that anonymous
 * visitors see. When a viewer IS signed in, the response includes the
 * viewer↔target block relationship so the client renders the right state in one
 * round trip.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfileCard } from "@/lib/profile/profileCard";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const res = await getProfileCard(user?.id ?? null, userId);
  if (!res.ok) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, card: res.card });
}
