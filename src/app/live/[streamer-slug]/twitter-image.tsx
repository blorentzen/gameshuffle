import { renderEventCard } from "@/lib/og/eventCard";
import { liveCard, shareCard } from "@/lib/og/eventCards";

/** Same card as opengraph-image (a folder's twitter image would otherwise come from a parent). */
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A streamer's live page on GameShuffle";

export default async function Image({ params }: { params: Promise<{ "streamer-slug": string }> }) {
  const { "streamer-slug": slug } = await params;
  return renderEventCard(await shareCard("live", () => liveCard(slug)));
}
