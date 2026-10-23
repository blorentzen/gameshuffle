import { notFound } from "next/navigation";
import { roadRegionCard } from "@/lib/og/roadCard";
import { roadShown } from "@/lib/games-visibility";

/** Same card as opengraph-image (a folder's twitter image would otherwise come from a parent). */
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A region's trainers on Trainer Road";

export default async function Image({ params }: { params: Promise<{ region: string }> }) {
  if (!roadShown()) notFound();
  const { region } = await params;
  return roadRegionCard(region);
}
