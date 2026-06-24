/**
 * GET /api/account/banner/raw — streams the caller's original banner image
 * (profile_banner_source_url) back same-origin, so the Reposition crop editor
 * can draw it to a canvas without cross-origin tainting.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("unauthorized", { status: 401 });

  const admin = createServiceClient();
  const { data } = await admin
    .from("users")
    .select("profile_banner_source_url")
    .eq("id", user.id)
    .maybeSingle();
  const src = (data?.profile_banner_source_url as string | null) ?? null;
  if (!src) return new NextResponse("not_found", { status: 404 });

  const upstream = await fetch(src).catch(() => null);
  if (!upstream || !upstream.ok) return new NextResponse("upstream_error", { status: 502 });

  const buf = await upstream.arrayBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "private, no-store",
    },
  });
}
