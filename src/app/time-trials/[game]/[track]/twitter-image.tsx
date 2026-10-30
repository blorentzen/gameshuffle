import { renderEventCard } from "@/lib/og/eventCard";
import { timeTrialsFallback, trackCard } from "@/lib/og/competitiveCards";

/** The same preview on X. */
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A Mario Kart time trial board on GameShuffle";

export default async function Image({ params }: { params: Promise<{ game: string; track: string }> }) {
  const { game, track } = await params;
  return renderEventCard(await trackCard(game, track).catch(() => timeTrialsFallback()));
}
