import { renderEventCard } from "@/lib/og/eventCard";
import { timeTrialsFallback, trackCard } from "@/lib/og/competitiveCards";

/** A track board's link preview: the track, its record and how many players (src/lib/og). */
export const runtime = "nodejs";
// Drawn once per track and kept for 15 minutes (crawlers fetched it on every visit; load audit, 2026-11-01).
export const dynamic = "force-static";
export const revalidate = 900;
export const fetchCache = "force-cache";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A time trial board on GameShuffle";

export default async function Image({ params }: { params: Promise<{ game: string; track: string }> }) {
  const { game, track } = await params;
  return renderEventCard(await trackCard(game, track).catch(() => timeTrialsFallback()));
}
