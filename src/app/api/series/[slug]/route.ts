/**
 * GET /api/series/[slug] → SeriesView (the event page's poll). Public once the series is announced; staff
 * also see a draft series. Reading it moves a live series along (draft clock, predictions).
 */

import { NextResponse } from "next/server";
import { seriesView } from "@/lib/series/store";
import { seriesViewer } from "@/lib/series/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let view = await seriesView(slug);
  let staffOnly = false;
  if (!view) {
    const viewer = await seriesViewer();
    if (viewer.staff) { view = await seriesView(slug, { staff: true }); staffOnly = !!view; }
  }
  if (!view) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(view, {
    headers: { "Cache-Control": staffOnly ? "private, no-store" : "public, s-maxage=2, stale-while-revalidate=4" },
  });
}
