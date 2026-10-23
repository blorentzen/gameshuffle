import { notFound } from "next/navigation";
import { roadTrainerCard } from "@/lib/og/roadCard";
import { roadShown } from "@/lib/games-visibility";

/** Same card as opengraph-image (a folder's twitter image would otherwise come from a parent). */
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A trainer to duel on Trainer Road";

export default async function Image({ params }: { params: Promise<{ region: string; trainer: string }> }) {
  if (!roadShown()) notFound();
  const { region, trainer } = await params;
  return roadTrainerCard(region, trainer);
}
