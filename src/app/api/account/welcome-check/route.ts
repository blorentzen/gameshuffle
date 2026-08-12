/**
 * POST /api/account/welcome-check
 *
 * Returns { welcome: true } exactly once per user — the first authenticated
 * call after they sign up — then never again. Powers the one-time welcome toast
 * (WelcomeToast) on whatever page a freshly-confirmed user lands on.
 *
 * The claim is atomic: a single UPDATE guarded by `welcomed_at IS NULL`, so
 * concurrent tabs can't both win. Degrades to { welcome: false } if the column
 * hasn't been migrated yet (supabase/welcomed-at.sql).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ welcome: false });

  try {
    const admin = createServiceClient();
    const { data, error } = await admin
      .from("users")
      .update({ welcomed_at: new Date().toISOString() })
      .eq("id", user.id)
      .is("welcomed_at", null)
      .select("id");
    if (error) return NextResponse.json({ welcome: false });
    return NextResponse.json({ welcome: (data?.length ?? 0) > 0 });
  } catch {
    return NextResponse.json({ welcome: false });
  }
}
