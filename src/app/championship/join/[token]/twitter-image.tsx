import { renderEventCard } from "@/lib/og/eventCard";
import { championshipInviteCard, shareCard } from "@/lib/og/eventCards";

/** Same card as opengraph-image (a folder's twitter image would otherwise come from a parent). */
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "An invite to a championship series on GameShuffle";

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return renderEventCard(await shareCard("championship", () => championshipInviteCard(token)));
}
