import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { settleBroughtBy } from "@/lib/social/broughtBy";

/**
 * After sign-up (bring-along picks 2026-11-05): the welcome page sends whose link brought this browser here (a
 * profile, live page or event remembered in the browser, or an invite code), the server records it once and answers
 * with that person for the "Kai brought you here" card. Nothing comes back when nobody brought them.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { userId?: unknown; code?: unknown };
  const bringer = await settleBroughtBy(user.id, {
    userId: typeof body.userId === "string" ? body.userId : null,
    code: typeof body.code === "string" ? body.code.slice(0, 16) : null,
  }).catch(() => null);
  return NextResponse.json({ bringer }, { headers: { "Cache-Control": "private, no-store" } });
}
