import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { confirmLounge } from "@/lib/lounge/store";

/**
 * POST /api/lounge/confirm: confirm the signed-in account as a lounge player by its linked
 * Discord account (MKCentral keeps each player's Discord id), in every lounge game.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sign_in" }, { status: 401 });
  const limited = await rateLimit(`lounge-confirm:${user.id}`, { max: 6, windowMs: 60_000 });
  if (!limited.ok) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  const result = await confirmLounge(user.id);
  return NextResponse.json(result);
}
