import { renderEventCard } from "@/lib/og/eventCard";
import { championshipCard, shareCard } from "@/lib/og/eventCards";

/** This page's link preview: its own name, date and art (src/lib/og). */
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A championship series on GameShuffle";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderEventCard(await shareCard("championship", () => championshipCard(id)));
}
