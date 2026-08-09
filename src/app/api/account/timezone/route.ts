import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidTimeZone } from "@/lib/time/format";

export const runtime = "nodejs";

/**
 * POST /api/account/timezone
 * Sets the signed-in user's IANA timezone. Called on auto-detect (first load)
 * and from the Account → Profile picker. Validates the zone server-side.
 *   body: { timezone: string, ifMissing?: boolean }
 * `ifMissing` (used by auto-detect) only writes when no timezone is set yet, so
 * a browser guess never overwrites the user's deliberate choice.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { timezone, ifMissing } = (await req.json().catch(() => ({}))) as { timezone?: string; ifMissing?: boolean };
  if (!isValidTimeZone(timezone)) {
    return NextResponse.json({ error: "Invalid timezone." }, { status: 400 });
  }

  if (ifMissing) {
    const { data: existing } = await supabase.from("users").select("timezone").eq("id", user.id).single();
    if (existing?.timezone) return NextResponse.json({ ok: true, timezone: existing.timezone, skipped: true });
  }

  const { error } = await supabase.from("users").update({ timezone }).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, timezone });
}
