/** GET /api/admin/ticketing?days=30 → platform-wide ticket sales (staff only). */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platformTicketing } from "@/lib/events/analytics";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).maybeSingle();
  const role = (profile?.role as string | null) ?? null;
  if (role !== "staff" && role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const days = Math.min(365, Math.max(7, Number(req.nextUrl.searchParams.get("days")) || 30));
  return NextResponse.json(await platformTicketing(days));
}
