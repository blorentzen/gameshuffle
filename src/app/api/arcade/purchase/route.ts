/** POST /api/arcade/purchase — buy a cosmetic with Arcade Tokens. Body: { itemId } */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { purchaseItem } from "@/lib/economy/arcade";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { itemId?: unknown };
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  if (!itemId) return NextResponse.json({ ok: false, error: "invalid_item" }, { status: 400 });

  const result = await purchaseItem(user.id, itemId);
  if (!result.ok) {
    const status: Record<string, number> = { unknown_item: 404, already_owned: 409, insufficient_balance: 402, wallet_unavailable: 503 };
    return NextResponse.json({ ok: false, error: result.reason, balance: result.balance }, { status: status[result.reason ?? ""] ?? 400 });
  }
  return NextResponse.json({ ok: true, balance: result.balance });
}
