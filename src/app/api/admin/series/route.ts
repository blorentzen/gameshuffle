/**
 * Staff: team series (Platform ▸ Events ▸ Series).
 *   GET                    → { series: [...] }
 *   POST { slug, title }   → { id } a new series in draft, with a Kickoff and a Final
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/shop/adminGuard";
import { seriesReady } from "@/lib/series/store";
import { createSeries, listSeries } from "@/lib/series/admin";

export const runtime = "nodejs";

export async function GET() {
  const guard = await requireStaff(await createClient());
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  if (!(await seriesReady())) return NextResponse.json({ error: "not_ready", series: [] }, { status: 503 });
  return NextResponse.json({ series: await listSeries() });
}

export async function POST(req: Request) {
  const guard = await requireStaff(await createClient());
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  if (!(await seriesReady())) return NextResponse.json({ error: "Team series need the latest database update (series-m1)." }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { slug?: unknown; title?: unknown } | null;
  const r = await createSeries(guard.userId, { slug: String(body?.slug ?? ""), title: String(body?.title ?? "") });
  return r.ok ? NextResponse.json({ ok: true, id: r.series.id, slug: r.series.slug }) : NextResponse.json({ error: r.error }, { status: 400 });
}
