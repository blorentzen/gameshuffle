/**
 * GET /api/trivia/pic/[code]?r=&q= → the picture for a question in a live
 * night, streamed from our own /images so phones and the TV never see the
 * file name (the pack's art is named after its answer). Only questions the
 * room has already reached are served.
 */

import { NextResponse } from "next/server";
import { gameByCode, isOwnPicture } from "@/lib/trivia/store";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const url = new URL(request.url);
  const r = Number(url.searchParams.get("r"));
  const qi = Number(url.searchParams.get("q"));
  const game = await gameByCode(code).catch(() => null);
  if (!game || (game.status !== "live" && game.status !== "done") || !Number.isInteger(r) || !Number.isInteger(qi)) return new NextResponse(null, { status: 404 });
  const reached = r < game.round_index || (r === game.round_index && qi <= game.question_index);
  const src = reached ? game.rounds[r]?.questions[qi]?.imageUrl : null;
  if (!isOwnPicture(src)) return new NextResponse(null, { status: 404 });
  const res = await fetch(new URL(src, url.origin), { cache: "force-cache" }).catch(() => null);
  if (!res?.ok || !res.body) return new NextResponse(null, { status: 404 });
  return new NextResponse(res.body, {
    headers: { "Content-Type": res.headers.get("content-type") ?? "image/webp", "Cache-Control": "private, max-age=600" },
  });
}
