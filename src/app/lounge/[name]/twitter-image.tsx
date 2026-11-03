import { renderEventCard } from "@/lib/og/eventCard";
import { loungeCard, loungeFallback } from "@/lib/og/competitiveCards";

/** The same preview on X. */
export const runtime = "nodejs";
// Drawn once per player and kept for an hour (crawlers fetched it on every visit; load audit, 2026-11-01).
export const dynamic = "force-static";
export const revalidate = 3600;
export const fetchCache = "force-cache";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A Mario Kart lounge player on GameShuffle";

export default async function Image({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return renderEventCard(await loungeCard(name).catch(() => loungeFallback()));
}
