import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { TimeTrialsHub } from "@/components/timeTrials/TimeTrialsHub";
import { gameBySlug, gamePath, isClassFor, TT_GAMES, type TtClass } from "@/lib/timeTrials/tracks";
import { readCategory } from "@/lib/timeTrials/categories";
import "@/styles/time-trials.css";

/** One game's time trials: /time-trials/mario-kart-world, /time-trials/mario-kart-8-deluxe (picks 2026-10-29, 7A). */

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ game: string }>; searchParams: Promise<{ cc?: string; items?: string; vehicle?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const info = gameBySlug((await params).game);
  if (!info || info.slug !== (await params).game) return { title: "Not found", robots: { index: false } };
  const title = `${info.label} time trial leaderboards`;
  const description = `The fastest ${info.label} time trial times on every track${info.classes.length > 1 ? ", at 150cc and 200cc" : ""}. Add yours from a screenshot or bring them from Quaxly.`;
  const url = `https://www.gameshuffle.co${gamePath(info.id)}`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, siteName: "GameShuffle", type: "website" } };
}

export default async function TimeTrialsGamePage({ params, searchParams }: Props) {
  const [{ game }, sp] = await Promise.all([params, searchParams]);
  const info = gameBySlug(game);
  if (!info || info.slug !== game) notFound();
  const c = Number(sp.cc);
  const cc = (isClassFor(info.id, c) ? c : TT_GAMES[info.id].classes[0]) as TtClass;
  return (
    <>
      <MarketingJsonLd breadcrumb={{ label: info.label, path: gamePath(info.id), parent: { label: "Time trials", path: "/time-trials" } }} />
      <TimeTrialsHub game={info.id} cc={cc} {...readCategory(info.id, sp)} gamePage />
    </>
  );
}
