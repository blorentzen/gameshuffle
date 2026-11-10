import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { KAR_FAQ, TimeTrialsHub } from "@/components/timeTrials/TimeTrialsHub";
import { boardGameBySlug, gamePath, gameTitleName, isClassFor, TT_GAMES, type TtClass } from "@/lib/timeTrials/tracks";
import { ttGameReady } from "@/lib/timeTrials/store";
import { readCategory } from "@/lib/timeTrials/categories";
import { isCountryCode } from "@/lib/timeTrials/countries";
import "@/styles/time-trials.css";

/** One game's time trials: /time-trials/mario-kart-world, /time-trials/mario-kart-8-deluxe (picks 2026-10-29, 7A), and
 *  /time-trials/kirby-air-riders once supabase/tt-kirby-m1.sql has run (not found until then). */

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ game: string }>; searchParams: Promise<{ cc?: string; items?: string; vehicle?: string; country?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const info = boardGameBySlug((await params).game);
  if (!info || info.slug !== (await params).game || !(await ttGameReady(info.id))) return { title: "Not found", robots: { index: false } };
  const kirby = info.family === "kirby";
  const title = kirby ? `${info.label} Time Attack Leaderboards` : `${gameTitleName(info.id)} Time Trial Leaderboards`;
  const description = kirby
    ? `The fastest ${info.label} Time Attack times on every Air Ride course, with a board for each machine. Add yours with a screenshot of the result.`
    : `The fastest ${info.label} time trial times on every track${info.classes.length > 1 ? ", at 150cc and 200cc" : ""}. Add yours from a screenshot or bring them from Quaxly.`;
  const url = `https://www.gameshuffle.co${gamePath(info.id)}`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, siteName: "GameShuffle", type: "website" } };
}

export default async function TimeTrialsGamePage({ params, searchParams }: Props) {
  const [{ game }, sp] = await Promise.all([params, searchParams]);
  const info = boardGameBySlug(game);
  if (!info || info.slug !== game || !(await ttGameReady(info.id))) notFound();
  const c = Number(sp.cc);
  const cc = (isClassFor(info.id, c) ? c : TT_GAMES[info.id].classes[0]) as TtClass;
  return (
    <>
      <MarketingJsonLd breadcrumb={{ label: info.label, path: gamePath(info.id), parent: { label: "Time trials", path: "/time-trials" } }} faq={info.family === "kirby" ? KAR_FAQ : undefined} />
      <TimeTrialsHub game={info.id} cc={cc} {...readCategory(info.id, sp)} gamePage country={isCountryCode(sp.country) ? sp.country : null} />
    </>
  );
}
