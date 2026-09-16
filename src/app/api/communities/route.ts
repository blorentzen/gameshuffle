/**
 * POST /api/communities → create a general (`group`) community (families, orgs,
 * events, friend groups). Auth-gated; slug validated + reserved via the username
 * rules. See specs/gs-community-types-spec.md.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createGroupCommunity } from "@/lib/communities/membership";

export const runtime = "nodejs";

const REASON_STATUS: Record<string, number> = {
  unauthenticated: 401,
  slug_taken: 409,
  group_cap: 429,
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const res = await createGroupCommunity(user.id, {
    name: String(body?.name ?? ""),
    slug: String(body?.slug ?? ""),
    subtype: typeof body?.subtype === "string" ? body.subtype : null,
    visibility: typeof body?.visibility === "string" ? body.visibility : null,
  });
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.reason }, { status: REASON_STATUS[res.reason ?? ""] ?? 400 });
  }
  return NextResponse.json({ ok: true, slug: res.slug });
}
