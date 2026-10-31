/**
 * GET /api/championship/[id]/owner → who runs the series (public).
 *
 * Read with the service client: running a public championship is public even
 * when the owner's profile is private (the users table only lets a browser
 * read public rows). The handle, and so a profile link, only comes back for a
 * public profile.
 */

import { NextResponse, type NextRequest } from "next/server";
import { loadChampionshipOwner } from "@/lib/tournaments/organizers";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owner = await loadChampionshipOwner(id);
  if (!owner) return NextResponse.json({ owner: null }, { status: 404 });
  return NextResponse.json({ owner: { displayName: owner.displayName, username: owner.username } });
}
