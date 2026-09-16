/**
 * POST /api/raffles/[id]/enter → buy one raffle entry for the signed-in account
 * (atomic token burn + entry increment). Returns the new balance + your entries.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buyEntry } from "@/lib/economy/raffles";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const res = await buyEntry(id, user.id);
  if (!res.ok) {
    const status = res.reason === "insufficient_balance" ? 402 : res.reason === "not_open" || res.reason === "not_found" ? 409 : res.reason === "migration_pending" ? 503 : 400;
    return NextResponse.json({ ok: false, error: res.reason, balance: res.balance }, { status });
  }
  return NextResponse.json({ ok: true, balance: res.balance, entries: res.entries });
}
