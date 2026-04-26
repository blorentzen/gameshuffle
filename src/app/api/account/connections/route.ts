/**
 * GET /api/account/connections
 *
 * Returns the unified connection state for the authenticated user.
 * Single source of truth for the Profile-tab Connections card,
 * Sign-in Methods read-only summary, and Integrations tab card states.
 *
 * Per gs-connections-architecture.md §4.1.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getConnections } from "@/lib/connections";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    const view = await getConnections(user.id);
    return NextResponse.json({ ok: true, ...view });
  } catch (err) {
    console.error("[/api/account/connections] failed:", err);
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
}
