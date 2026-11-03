/**
 * GET /api/activity/img?u=<url>: a picture from MKCentral, our own uploads or Discord's avatars, served from our address,
 * because Discord's Activity proxy only loads the Activity's own host (team logos and faces in the War room).
 * Raster images only (no SVG), up to 2 MB, cached a day.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ALLOWED = /^https:\/\/(?:www\.)?(?:mkcentral\.com|gs-ugc\.empac\.co|cdn\.discordapp\.com)\/[^\s]+$/;
const MAX = 2 * 1024 * 1024;

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get("u") ?? "";
  if (!ALLOWED.test(u)) return NextResponse.json({ error: "not_allowed" }, { status: 400 });
  const res = await fetch(u, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  const type = res?.headers.get("content-type") ?? "";
  // Raster pictures only: an SVG served from our address could run script.
  if (!res?.ok || !/^image\/(png|jpe?g|webp|gif|avif)/.test(type)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX) return NextResponse.json({ error: "too_big" }, { status: 413 });
  return new NextResponse(bytes, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400, immutable", "X-Content-Type-Options": "nosniff" } });
}
