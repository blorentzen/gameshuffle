/** GET /api/series/for/[username] → { slug, teamId } for the live series a streamer plays in, or null (their live page's card). */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { seriesPieceFor } from "@/lib/series/store";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const handle = username.toLowerCase();
  if (!/^[a-z0-9_.-]{2,40}$/.test(handle)) return NextResponse.json({ series: null });
  const admin = createServiceClient();
  const { data } = await admin.from("users").select("id").eq("username", handle).maybeSingle();
  let id = (data as { id: string } | null)?.id ?? null;
  if (!id) {
    const { data: tw } = await admin.from("users").select("id").eq("twitch_username", username).limit(1).maybeSingle();
    id = (tw as { id: string } | null)?.id ?? null;
  }
  const series = id ? await seriesPieceFor(id) : null;
  return NextResponse.json({ series }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } });
}
