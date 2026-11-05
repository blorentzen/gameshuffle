/**
 * GET /api/mmr/image?size=square|wide|story[&look=<id>][&download=1] → the signed-in player's MMR card as a
 * picture (picks 2026-11-04, 4A to 8A): the studio's preview and Save picture. Sharing goes through
 * /r/<code>, whose link shows the card as it is now.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { ownPicture } from "@/lib/mmr/pictureData";
import { isPictureSize, renderMmrPicture } from "@/lib/mmr/picture";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!(await rateLimit(`mmr-image:${user.id}`, { max: 60, windowMs: 60_000 })).ok) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  const url = new URL(req.url);
  const sizeArg = url.searchParams.get("size");
  const size = isPictureSize(sizeArg) ? sizeArg : "square";
  const look = url.searchParams.get("look");
  const input = await ownPicture(user.id, look && /^[\w-]{1,40}$/.test(look) ? look : null);
  if (!input) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const png = await renderMmrPicture(input, size);
  const headers: Record<string, string> = { "Content-Type": "image/png", "Cache-Control": "private, max-age=60" };
  if (url.searchParams.get("download")) headers["Content-Disposition"] = `attachment; filename="mmr-card-${size}.png"`;
  return new Response(new Uint8Array(png), { headers });
}
