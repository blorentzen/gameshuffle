import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { StadiumRandomizer } from "@/components/pokemon/StadiumRandomizer";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { RandomizerLanding } from "@/components/marketing/RandomizerLanding";
import { RANDOMIZER_LANDINGS, randomizerMetadata } from "@/data/randomizer-landings";
import { STADIUM_PUBLIC } from "@/lib/games-visibility";
import { BrowseHero } from "@/components/events/BrowseHero";

const landing = RANDOMIZER_LANDINGS["pokemon-stadium"];

export const metadata: Metadata = randomizerMetadata("pokemon-stadium");

/** /randomizers/pokemon-stadium: rental teams for Pokémon Stadium 1 & 2 (type cards, no art). */
export default function StadiumRandomizerPage() {
  // Hidden until it's reviewed, except locally so it can be built and checked.
  if (!STADIUM_PUBLIC && process.env.NODE_ENV === "production") notFound();
  return (
    <>
      <main>
        <BrowseHero eyebrow="Free randomizer" title={landing.h1} sub={landing.lead} accent="blue" field="video" primary={{ href: "#play", label: "Randomize teams" }} />
        <div id="play">
          <Container className="tool-page">
            <Suspense>
              <StadiumRandomizer />
            </Suspense>
          </Container>
        </div>
        <RandomizerLanding landing={landing} />
      </main>
      <RandomizerNudge gameName="Pokémon Stadium" saves="your rental teams" streamReady={false} />
    </>
  );
}
