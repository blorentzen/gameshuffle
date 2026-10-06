import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { StadiumRandomizer } from "@/components/pokemon/StadiumRandomizer";
import { NewBanner } from "@/components/NewBanner";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { RandomizerLanding } from "@/components/marketing/RandomizerLanding";
import { RANDOMIZER_LANDINGS, randomizerMetadata } from "@/data/randomizer-landings";
import { STADIUM_PUBLIC } from "@/lib/games-visibility";
import { BrowseHero } from "@/components/events/BrowseHero";
import { GAME_ART } from "@/data/game-art";
import { getShowcaseArt } from "@/lib/pokemon/showcase";

const landing = RANDOMIZER_LANDINGS["pokemon-stadium"];

// Showcase card art is read from tcg_cards; refresh it daily.
export const revalidate = 86400;

export const metadata: Metadata = randomizerMetadata("pokemon-stadium");

/** /randomizers/pokemon-stadium: rental teams for Pokémon Stadium 1 & 2 (type cards, no art). */
export default async function StadiumRandomizerPage() {
  if (!STADIUM_PUBLIC && process.env.NODE_ENV === "production") notFound();
  const art = await getShowcaseArt();
  return (
    <>
      <main>
        <BrowseHero eyebrow="Free randomizer · New" title={landing.h1} sub={landing.lead} accent="blue" field="video" image={GAME_ART["pokemon-stadium"].hero} primary={{ href: "#play", label: "Randomize teams" }} />
        <div id="play">
          <Container className="tool-page">
            <NewBanner />
            <Suspense>
              <StadiumRandomizer art={art} />
            </Suspense>
          </Container>
        </div>
        <RandomizerLanding landing={landing} />
      </main>
      <RandomizerNudge gameName="Pokémon Stadium" saves="your rental teams" streamReady={false} />
    </>
  );
}
