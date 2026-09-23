/** GET /api/events/my-tickets → the signed-in buyer's tickets and refund rights. */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listMyTickets } from "@/lib/events/tickets";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ tickets: await listMyTickets(user.id) });
}
