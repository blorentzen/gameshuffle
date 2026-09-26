/**
 * GET /api/events/more?user=<organizerId>&type=<tournament|game-night>&id=<eventId>
 * → the organizer's other upcoming public events. Used by client-rendered event
 * pages (the tournament page) to fill the "More from this organizer" rail; the
 * server-rendered night page calls `listMoreFromOrganizer` directly.
 */

import { NextResponse, type NextRequest } from "next/server";
import { listMoreFromOrganizer } from "@/lib/events/more";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = req.nextUrl.searchParams.get("user") ?? "";
  const type = req.nextUrl.searchParams.get("type");
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(user) || (type !== "tournament" && type !== "game-night")) {
    return NextResponse.json({ events: [] });
  }
  const events = await listMoreFromOrganizer(user, { type, id });
  return NextResponse.json({ events }, { headers: { "Cache-Control": "public, max-age=60" } });
}
