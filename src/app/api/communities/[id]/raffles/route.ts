/**
 * GET  /api/communities/[id]/raffles → { ok, raffle: RaffleSummary | null }  (the open raffle)
 * POST /api/communities/[id]/raffles { title, prize, entryCost } → create (owner/mod only)
 *
 * Community raffles: the repeatable token sink. Members burn tokens for entries;
 * the owner draws a winner. See src/lib/economy/raffles.ts.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { createRaffle, getOpenRaffle, getRaffleSummary } from "@/lib/economy/raffles";

export const runtime = "nodejs";

async function canManage(userId: string, communityId: string): Promise<boolean> {
  const admin = createServiceClient();
  const { data: c } = await admin.from("gs_communities").select("owner_user_id").eq("id", communityId).maybeSingle();
  if ((c as { owner_user_id: string | null } | null)?.owner_user_id === userId) return true;
  const { data: m } = await admin.from("community_members").select("role").eq("community_id", communityId).eq("user_id", userId).maybeSingle();
  return ["owner", "mod"].includes((m as { role: string } | null)?.role ?? "");
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const raffle = await getOpenRaffle(id);
  if (!raffle) return NextResponse.json({ ok: true, raffle: null });
  const summary = await getRaffleSummary(raffle, user?.id ?? null);
  return NextResponse.json({ ok: true, raffle: summary });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  if (!(await canManage(user.id, id))) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { title?: unknown; prize?: unknown; entryCost?: unknown };
  const res = await createRaffle(
    id,
    {
      title: typeof body.title === "string" ? body.title : "",
      prize: typeof body.prize === "string" ? body.prize : "",
      entryCost: Number(body.entryCost) || 0,
    },
    user.id,
  );
  if (!res.ok) return NextResponse.json({ ok: false, error: res.reason }, { status: res.reason === "migration_pending" ? 503 : 400 });
  return NextResponse.json({ ok: true, id: res.id });
}
