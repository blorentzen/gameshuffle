import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { brainTableOpenFor } from "@/lib/chatbrain/tableGate";

export const runtime = "nodejs";

/**
 * GET /api/nights/gates → { open: string[] }: which gated live-night games this
 * viewer may pick (NightGame.gate). "chat-brain": staff until Chat Brain launches.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const open: string[] = [];
  if (await brainTableOpenFor(user?.id ?? null).catch(() => false)) open.push("chat-brain");
  return NextResponse.json({ open }, { headers: { "Cache-Control": "private, no-store" } });
}
