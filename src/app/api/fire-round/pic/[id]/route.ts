/**
 * GET /api/fire-round/pic/[id]?q= → the picture for the question a Fire Round
 * is on, streamed from our own /images so the page never sees the file name
 * (the pack's art is named after its answer). Only the current question's.
 */

import { NextResponse } from "next/server";
import { currentImage } from "@/lib/fireRound/store";
import { isOwnPicture } from "@/lib/trivia/store";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const pos = Number(url.searchParams.get("q"));
  const src = Number.isInteger(pos) ? await currentImage(id, pos).catch(() => null) : null;
  if (!isOwnPicture(src)) return new NextResponse(null, { status: 404 });
  const res = await fetch(new URL(src, url.origin), { cache: "force-cache" }).catch(() => null);
  if (!res?.ok || !res.body) return new NextResponse(null, { status: 404 });
  return new NextResponse(res.body, {
    headers: { "Content-Type": res.headers.get("content-type") ?? "image/webp", "Cache-Control": "private, max-age=300" },
  });
}
