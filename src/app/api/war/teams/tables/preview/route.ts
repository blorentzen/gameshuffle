/**
 * GET /api/war/teams/tables/preview?guild=<id>&channel=<id>&look=<json> → image/png
 * The Teams page's preview of a channel's war tables in a look (its newest posted table, else a sample with the
 * server's teams). Paid choices show here so they can be tried; tables show them while the server has looks.
 */

import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/ratelimit";
import { teamsAccess } from "@/lib/wars/teamAdmin";
import { cleanTableLook } from "@/lib/wars/tableLook";
import { previewTable } from "@/lib/wars/tables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const a = await teamsAccess(q.get("guild"));
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  const channel = q.get("channel") ?? "";
  if (!/^\d{5,25}$/.test(channel)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  if (!(await rateLimit(`war-table-preview:${a.m.userId}`, { max: 90, windowMs: 10 * 60_000 })).ok) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  let raw: unknown = null;
  try { raw = JSON.parse(q.get("look") ?? "{}"); } catch { raw = null; }
  try {
    const pic = await previewTable(a.guild, channel, cleanTableLook(raw));
    return new NextResponse(new Uint8Array(pic.png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=120", "X-Alt": encodeURIComponent(pic.alt.slice(0, 300)) } });
  } catch (err) {
    console.error("[wars] table preview failed:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
