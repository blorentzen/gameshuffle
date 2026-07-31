/** POST /api/ideas/[id]/vote — toggle the caller's vote (auth; public ideas only). */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toggleVote } from "@/lib/ideas/store";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const res = await toggleVote(id, user.id);
  if (!res.ok) {
    return NextResponse.json({ error: res.reason }, { status: res.reason === "not_found" ? 404 : 400 });
  }
  return NextResponse.json({ ok: true, voted: res.voted });
}
