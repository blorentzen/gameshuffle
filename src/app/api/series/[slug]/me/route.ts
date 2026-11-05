/**
 * GET /api/series/[slug]/me → what the signed-in viewer is in a series: their player card (if they play),
 * whether they run it (staff), their predictions, token balance and best play vote.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { loadSeries, playerOf } from "@/lib/series/store";
import { seriesViewer } from "@/lib/series/viewer";
import { myPicks } from "@/lib/series/predictions";
import { getAccountIdentityId, spendableBalance } from "@/lib/economy/accountWallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await seriesViewer();
  if (!viewer.userId) return NextResponse.json({ signedIn: false, staff: false, player: null, picks: {}, balance: null, vote: null, builds: [] }, { headers: { "Cache-Control": "private, no-store" } });
  const l = await loadSeries({ slug });
  if (!l || (l.series.status === "draft" && !viewer.staff)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const admin = createServiceClient();
  const me = playerOf(l, viewer.userId);
  const identityId = await getAccountIdentityId(viewer.userId).catch(() => null);
  const [picks, balance, voteRes, buildsRes] = await Promise.all([
    identityId ? myPicks(l.series.id, identityId) : Promise.resolve({}),
    identityId ? spendableBalance(identityId).catch(() => null) : Promise.resolve(null),
    admin.from("gs_series_play_votes").select("play_id").eq("series_id", l.series.id).eq("user_id", viewer.userId).maybeSingle(),
    me ? admin.from("saved_configs").select("id, config_name, config_data").eq("user_id", viewer.userId).eq("config_data->>type", "kart-build").order("created_at", { ascending: false }).limit(30) : Promise.resolve({ data: [] }),
  ]);
  const builds = ((buildsRes.data ?? []) as { id: string; config_name: string; config_data: { gameSlug?: string } }[])
    .filter((b) => (b.config_data?.gameSlug ?? "mario-kart-8-deluxe") === "mario-kart-8-deluxe")
    .map((b) => ({ id: b.id, name: b.config_name }));
  return NextResponse.json({
    signedIn: true,
    staff: viewer.staff,
    player: me ? { id: me.id, teamId: me.team_id, role: me.role, hours: me.hours, kartConfigId: me.kart_config_id } : null,
    picks,
    balance,
    vote: (voteRes.data as { play_id: string } | null)?.play_id ?? null,
    builds,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
