/**
 * The animated profile banner (src/lib/gifs/banner.ts).
 *   GET                       → { ready, allowed, banner }
 *   POST { gifId, x, y }      → one of your GIFs as the banner, framed at x% y% (GS Pro or Supporter looks); it replaces
 *                               a picture banner (a profile has one banner, either kind)
 *   DELETE                    → back to the picture banner (or none)
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasLooks } from "@/lib/support/looks";
import { bannerGifReady, clearBannerGif, getBannerGif, setBannerGif } from "@/lib/gifs/banner";
import { clearPictureBanner } from "@/lib/profile/banner";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "private, no-store" };

async function me() {
  const { data: { user } } = await (await createClient()).auth.getUser();
  return user;
}

export async function GET() {
  const user = await me();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const [ready, allowed, banner] = await Promise.all([bannerGifReady(), hasLooks(user.id), getBannerGif(user.id)]);
  return NextResponse.json({ ready, allowed, banner }, { headers: NO_STORE });
}

export async function POST(req: Request) {
  const user = await me();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!(await hasLooks(user.id))) return NextResponse.json({ error: "looks_required" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { gifId?: unknown; x?: unknown; y?: unknown } | null;
  if (typeof body?.gifId !== "string" || !/^[0-9a-f-]{36}$/.test(body.gifId)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const res = await setBannerGif(user.id, body.gifId, body.x, body.y);
  if (res !== "ok") return NextResponse.json({ error: res }, { status: res === "not_found" ? 404 : 503 });
  await clearPictureBanner(user.id);
  return NextResponse.json({ ok: true, banner: await getBannerGif(user.id) }, { headers: NO_STORE });
}

export async function DELETE() {
  const user = await me();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  await clearBannerGif(user.id);
  return NextResponse.json({ ok: true });
}
