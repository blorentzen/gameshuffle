/**
 * GET /api/ranked/mine: the lounges the signed-in account plays in (through its Discord), for the account menu's
 * "Your lounges" (name, web and docs pick 3A). Asked only when the menu opens. Empty while GS Ranked is closed.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { laddersForDiscord, laddersOpen, laddersReady } from "@/lib/ladders/store";

export const runtime = "nodejs";

export async function GET() {
  if (!(await laddersReady()) || !(await laddersOpen())) return NextResponse.json({ lounges: [] });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ lounges: [] });
  const { data } = await createServiceClient().from("users").select("discord_id").eq("id", user.id).maybeSingle();
  const discordId = (data as { discord_id: string | null } | null)?.discord_id;
  const mine = discordId ? await laddersForDiscord(discordId) : [];
  return NextResponse.json({ lounges: mine.map(({ ladder }) => ({ name: ladder.name, slug: ladder.slug })) });
}
