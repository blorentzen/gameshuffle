import { renderEventCard } from "@/lib/og/eventCard";
import { tournamentCard, shareCard } from "@/lib/og/eventCards";

/** Same card as opengraph-image (a folder's twitter image would otherwise come from a parent). */
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A tournament on GameShuffle";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderEventCard(await shareCard("tournament", () => tournamentCard(id)));
}
