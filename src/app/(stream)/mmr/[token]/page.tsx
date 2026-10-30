/**
 * /mmr/<token>[?look=<id>][&view=recap]: a player's MMR card as an OBS browser source (transparent,
 * no site chrome). The token is the card's private link from /mmr-card; `look` pins one
 * saved look (GS Pro) instead of the card's own choice; `view=recap` shows the night's
 * recap instead (GS Pro, for an ending scene).
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cardByToken, liveFor } from "@/lib/mmr/store";
import { MmrLive } from "@/components/mmr/MmrLive";
import { ObsRoute } from "@/components/mmr/ObsRoute";
import "@/styles/mmr-card.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "MMR card", robots: { index: false, follow: false } };

export default async function MmrObsPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ look?: string; view?: string }> }) {
  const [{ token }, { look, view }] = await Promise.all([params, searchParams]);
  const card = await cardByToken(token);
  if (!card) notFound();
  const lookId = look && /^[a-z0-9-]{1,24}$/.test(look) ? look : null;
  const initial = await liveFor(card, { look: lookId });
  return (
    <main className="mmr-obs">
      <ObsRoute />
      <MmrLive token={token} initial={initial} lookId={lookId} fit="obs" recap={view === "recap"} />
    </main>
  );
}
