/**
 * POST /api/raffles/[id]/draw → draw a weighted-random winner + close the
 * raffle (community owner/mod only).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getRaffle, drawRaffle } from "@/lib/economy/raffles";

export const runtime = "nodejs";

async function canManage(userId: string, communityId: string): Promise<boolean> {
  const admin = createServiceClient();
  const { data: c } = await admin.from("gs_communities").select("owner_user_id").eq("id", communityId).maybeSingle();
  if ((c as { owner_user_id: string | null } | null)?.owner_user_id === userId) return true;
  const { data: m } = await admin.from("community_members").select("role").eq("community_id", communityId).eq("user_id", userId).maybeSingle();
  return ["owner", "mod"].includes((m as { role: string } | null)?.role ?? "");
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const raffle = await getRaffle(id);
  if (!raffle) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (!(await canManage(user.id, raffle.communityId))) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const res = await drawRaffle(id);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.reason }, { status: 400 });
  return NextResponse.json({ ok: true, winnerName: res.winnerName });
}
