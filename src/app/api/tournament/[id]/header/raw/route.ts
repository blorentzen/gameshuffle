/**
 * GET /api/tournament/[id]/header/raw — streams the tournament's current header
 * image back same-origin so the crop editor can draw it to a canvas without
 * cross-origin tainting (re-position an existing banner). Organizer-guarded.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getTournamentRole } from "@/lib/tournaments/access-server";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("unauthorized", { status: 401 });

  const admin = createServiceClient();
  const role = await getTournamentRole(admin, id, user.id);
  if (!role) return new NextResponse("forbidden", { status: 403 });

  const { data } = await admin.from("tournaments").select("header_image_url").eq("id", id).maybeSingle();
  const src = (data?.header_image_url as string | null) ?? null;
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
