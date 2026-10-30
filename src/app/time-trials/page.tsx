import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { TimeTrialsHub, TT_FAQ } from "@/components/timeTrials/TimeTrialsHub";
import { gameBySlug, gamePath, isClassFor, type TtClass } from "@/lib/timeTrials/tracks";
import "@/styles/time-trials.css";

/**
 * /time-trials (picks 2026-10-29, all as recommended): both games' tracks, Mario Kart World first.
 * Each game also has its own page, /time-trials/<game>; the old ?game= links forward there.
 */

export const dynamic = "force-dynamic";

const DESCRIPTION = "The fastest time trial times on every Mario Kart World and Mario Kart 8 Deluxe track, added by players on GameShuffle and in Discord. Add yours from a screenshot or bring them from Quaxly.";

export const metadata: Metadata = {
  title: "Mario Kart time trial leaderboards",
  description: DESCRIPTION,
  alternates: { canonical: "https://www.gameshuffle.co/time-trials" },
  openGraph: { title: "Mario Kart time trial leaderboards", description: DESCRIPTION, url: "https://www.gameshuffle.co/time-trials", siteName: "GameShuffle", type: "website" },
};

export default async function TimeTrialsPage({ searchParams }: { searchParams: Promise<{ game?: string; cc?: string }> }) {
  const sp = await searchParams;
  const asked = sp.game ? gameBySlug(sp.game) : null;
  if (asked) {
    const c = Number(sp.cc);
    permanentRedirect(gamePath(asked.id, isClassFor(asked.id, c) ? (c as TtClass) : undefined));
  }
  return (
    <>
      <MarketingJsonLd breadcrumb={{ label: "Time trials", path: "/time-trials" }} faq={TT_FAQ.map((f) => ({ q: f.q, a: f.a }))} />
      <TimeTrialsHub game="mkworld" cc={150} gamePage={false} />
    </>
  );
}
