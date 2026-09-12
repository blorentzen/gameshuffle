/** GET /api/communities/mine — communities the signed-in user has joined (for pickers). */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listCommunitiesForUser } from "@/lib/communities/membership";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const communities = (await listCommunitiesForUser(user.id).catch(() => [])).map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.displayName || `@${c.slug}`,
  }));
  return NextResponse.json({ ok: true, communities });
}
