import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isStaffRequest } from "@/lib/auth/raw";
import { dayKey } from "@/lib/originals/daily";
import { gsAddDays } from "@/lib/time/gsClock";
import { winnersFor } from "@/lib/daily/winners";
import { winnersCaption, winnersDateLabel } from "@/lib/originals/winners";
import { WinnersStage } from "@/components/originals/WinnersStage";
import "../../../styles/social.css";

/**
 * /social/winners — the hidden 9:16 stage for the morning winners video
 * (Britton's picks, 2026-10-16): yesterday's top 5 on the Daily Shuffle and
 * the Daily Dex, filmed on Britton's phone from the start screen (Play, Copy
 * caption) or by the recorder (?paused=1). Names come from the day boards as
 * they show them; anyone who opted out in Settings ▸ Privacy is "A player".
 *
 * Staff only in production (it shows people's names before the post goes
 * up); open on the dev server. Never in the sitemap or search.
 *   ?day=YYYY-MM-DD  the day to celebrate (default yesterday, Pacific)
 *   ?paused=1        no start screen; hold until the recorder adds `go`
 */

export const metadata: Metadata = {
  title: "Winners stage",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function SocialWinnersPage({ searchParams }: { searchParams: Promise<{ day?: string; paused?: string }> }) {
  if (process.env.NODE_ENV === "production" && !(await isStaffRequest())) notFound();
  const sp = await searchParams;
  const day = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : gsAddDays(dayKey(), -1);
  const sections = await winnersFor(day);
  return <WinnersStage dateLabel={winnersDateLabel(day)} sections={sections} caption={winnersCaption(sections)} paused={sp.paused === "1"} />;
}
