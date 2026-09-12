/** GET /api/social/upcoming — the signed-in user's upcoming tournaments/events,
 *  for the composer's "announce an upcoming event" picker. */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUpcomingForUser } from "@/lib/social/upcoming";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const items = await getUpcomingForUser(user.id, 12).catch(() => []);
  return NextResponse.json({ ok: true, items });
}
