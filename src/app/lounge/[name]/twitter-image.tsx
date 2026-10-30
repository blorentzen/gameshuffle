import { renderEventCard } from "@/lib/og/eventCard";
import { loungeCard, loungeFallback } from "@/lib/og/competitiveCards";

/** The same preview on X. */
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A Mario Kart lounge player on GameShuffle";

export default async function Image({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return renderEventCard(await loungeCard(name).catch(() => loungeFallback()));
}
