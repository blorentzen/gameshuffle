import { notFound } from "next/navigation";
import { roadHubCard } from "@/lib/og/roadCard";
import { roadShown } from "@/lib/games-visibility";

/** Trainer Road's link preview (src/lib/og/roadCard.tsx). */
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Trainer Road on GameShuffle: duel every Pokémon trainer";

export default async function Image() {
  if (!roadShown()) notFound();
  return roadHubCard();
}
