/** POST /api/arcade/equip — equip an owned name color (or clear). Body: { itemId: string | null } */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { equipNameColor } from "@/lib/economy/arcade";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { itemId?: unknown };
  const itemId = body.itemId === null ? null : typeof body.itemId === "string" ? body.itemId : undefined;
  if (itemId === undefined) return NextResponse.json({ ok: false, error: "invalid_item" }, { status: 400 });

  const result = await equipNameColor(user.id, itemId);
  if (!result.ok) {
    const status: Record<string, number> = { unknown_item: 404, not_owned: 403 };
    return NextResponse.json({ ok: false, error: result.reason }, { status: status[result.reason ?? ""] ?? 400 });
  }
  return NextResponse.json({ ok: true });
}
