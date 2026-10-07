/**
 * GET /api/championship/[id]/owner → who runs the series (public).
 *
 * Read with the service client: running a public championship is public even
 * when the owner's profile is private (the users table only lets a browser
 * read public rows). The handle, and so a profile link, only comes back for a
 * public profile.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createServiceClient();
  const { data: c } = await admin.from("championships").select("owner_id").eq("id", id).maybeSingle();
  const ownerId = (c as { owner_id: string | null } | null)?.owner_id;
  if (!ownerId) return NextResponse.json({ owner: null }, { status: 404 });
  const { data: u } = await admin.from("users").select("display_name, username, is_public").eq("id", ownerId).maybeSingle();
  const row = u as { display_name: string | null; username: string | null; is_public: boolean | null } | null;
  return NextResponse.json({
    owner: row ? { displayName: row.display_name || row.username || "", username: row.is_public ? row.username : null } : null,
  });
}
