/**
 * GIFs (signed in).
 *   GET  ?tab=mine                         → { gifs: MyGif[], used, limit }
 *   GET  ?tab=community&q=&sort=&offset=   → { gifs: CommunityGif[], tags }
 *   POST multipart file (GIF or animated WebP, up to 8 MB) → { gif, again } after the automatic check;
 *        errors: storage_off 503, not_ready 503, bad_type / too_big / bad_file / too_many_frames / not_animated 400,
 *        full 403 (with limit), blocked 403, refused 422 (with reason), slow_down 429.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { communityTags, createGif, gifAllowance, gifsReady, listCommunity, listMine } from "@/lib/gifs/store";
import { GIF_MAX_BYTES, GIF_TYPES } from "@/lib/gifs/rules";

export const runtime = "nodejs";
export const maxDuration = 60;

async function signedIn() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET(req: NextRequest) {
  const user = await signedIn();
  if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!(await gifsReady())) return NextResponse.json({ error: "not_ready" }, { status: 503 });
  const p = req.nextUrl.searchParams;
  if (p.get("tab") === "community") {
    if (!(await rateLimit(`gifs-community:${user.id}`, { max: 60, windowMs: 60_000 })).ok) return NextResponse.json({ error: "slow_down" }, { status: 429 });
    const offset = Math.max(0, Number(p.get("offset")) || 0);
    const [gifs, tags] = await Promise.all([
      listCommunity({ q: p.get("q") ?? "", sort: p.get("sort") === "new" ? "new" : "popular", offset }),
      offset ? Promise.resolve([] as string[]) : communityTags(),
    ]);
    return NextResponse.json({ gifs, tags });
  }
  const [gifs, allowance] = await Promise.all([listMine(user.id), gifAllowance(user.id)]);
  return NextResponse.json({ gifs, ...allowance });
}

export async function POST(req: NextRequest) {
  const user = await signedIn();
  if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!(await gifsReady())) return NextResponse.json({ error: "not_ready" }, { status: 503 });
  if (!(await rateLimit(`gifs-upload:${user.id}`, { max: 12, windowMs: 10 * 60_000 })).ok) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });
  if (!(GIF_TYPES as readonly string[]).includes(file.type)) return NextResponse.json({ error: "bad_type" }, { status: 400 });
  if (file.size > GIF_MAX_BYTES) return NextResponse.json({ error: "too_big" }, { status: 400 });

  const res = await createGif(user.id, Buffer.from(await file.arrayBuffer()));
  if (res.ok) return NextResponse.json({ gif: res.gif, again: res.again });
  if (res.error === "full") return NextResponse.json({ error: "full", ...(await gifAllowance(user.id)) }, { status: 403 });
  const status = res.error === "storage_off" ? 503 : res.error === "blocked" ? 403 : res.error === "refused" ? 422 : 400;
  return NextResponse.json({ error: res.error, reason: res.reason ?? null }, { status });
}
