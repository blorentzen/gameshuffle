/**
 * Paged browse for the two event hubs.
 *
 * Public and read-only: it serves the same rows the hub renders server-side, so
 * there is nothing here a crawler could not already see.
 *
 * Returns 503 `views_missing` until browse-views-m1.sql is applied, which the
 * client treats as "stay in the old in-memory mode" rather than as an error.
 */

import { NextResponse } from "next/server";
import { searchBrowse, PAGE_SIZE, type BrowseQuery } from "@/lib/events/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Degrees of latitude per mile. Longitude narrows with latitude, hence the cos. */
const MILES_PER_DEG_LAT = 69;

function boxFor(lat: number, lng: number, miles: number) {
  const dLat = miles / MILES_PER_DEG_LAT;
  const dLng = miles / (MILES_PER_DEG_LAT * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const type = p.get("type") === "tournament" ? "tournament" : "game-night";

  const lat = Number(p.get("lat"));
  const lng = Number(p.get("lng"));
  const radius = Number(p.get("radius"));
  const box = Number.isFinite(lat) && Number.isFinite(lng) && radius > 0
    ? boxFor(lat, lng, radius)
    : undefined;

  const cursorId = p.get("cursorId");
  const query: BrowseQuery = {
    type,
    q: p.get("q") ?? undefined,
    genre: p.get("genre") ?? undefined,
    level: p.get("level") ?? undefined,
    kind: p.get("kind") ?? undefined,
    game: p.get("game") ?? undefined,
    online: (p.get("online") as BrowseQuery["online"]) ?? undefined,
    price: (p.get("price") as BrowseQuery["price"]) ?? undefined,
    format: p.get("format") ?? undefined,
    openSpots: p.get("spots") === "1",
    status: p.get("status") ?? undefined,
    when: p.get("when") ?? undefined,
    box,
    cursor: cursorId ? { startsAt: p.get("cursorAt") || null, id: cursorId } : null,
    limit: Math.min(Number(p.get("limit")) || PAGE_SIZE, 60),
  };

  try {
    const page = await searchBrowse(query);
    if (!page) return NextResponse.json({ error: "views_missing" }, { status: 503 });
    return NextResponse.json(page);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "search_failed" },
      { status: 500 },
    );
  }
}
