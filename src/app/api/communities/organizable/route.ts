/**
 * GET /api/communities/organizable → communities the signed-in user can present
 * an event under (owner or mod). Powers the "Organized by" picker on the
 * tournament + board-game-night creators/editors. Auth-gated.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listOrganizableCommunities } from "@/lib/communities/membership";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const communities = await listOrganizableCommunities(user.id).catch(() => []);
  return NextResponse.json({ ok: true, communities });
}
