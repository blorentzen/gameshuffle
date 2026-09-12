/** GET /api/social/tags — trending hashtag topics, for the composer's topic picker. */

import { NextResponse } from "next/server";
import { getTrendingTags } from "@/lib/social/feed";

export async function GET() {
  const tags = await getTrendingTags(20).catch(() => []);
  return NextResponse.json({ ok: true, tags: tags.map((t) => t.tag) });
}
