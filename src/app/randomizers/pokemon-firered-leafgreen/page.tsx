import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { FrlgRunChallenge } from "@/components/pokemon/FrlgRunChallenge";
import { BetaBanner } from "@/components/BetaBanner";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { RandomizerLanding } from "@/components/marketing/RandomizerLanding";
import { RANDOMIZER_LANDINGS, randomizerMetadata } from "@/data/randomizer-landings";
import { FRLG_PUBLIC } from "@/lib/games-visibility";
import { BrowseHero } from "@/components/events/BrowseHero";
import { getShowcaseArt } from "@/lib/pokemon/showcase";

const landing = RANDOMIZER_LANDINGS["pokemon-firered-leafgreen"];

// Showcase card art is read from tcg_cards; refresh it daily.
export const revalidate = 86400;

export const metadata: Metadata = randomizerMetadata("pokemon-firered-leafgreen");

/** /randomizers/pokemon-firered-leafgreen: a seeded FireRed/LeafGreen run challenge (beta, type cards, no art). */
export default async function FrlgRunChallengePage() {
  if (!FRLG_PUBLIC && process.env.NODE_ENV === "production") notFound();
  const art = await getShowcaseArt();
  return (
    <>
      <main>
        <BrowseHero eyebrow="Run challenge · Beta" title={landing.h1} sub={landing.lead} accent="blue" field="video" primary={{ href: "#play", label: "Start a run" }} />
        <div id="play">
          <Container className="tool-page">
            <BetaBanner />
            <Suspense>
              <FrlgRunChallenge art={art} />
            </Suspense>
          </Container>
        </div>
        <RandomizerLanding landing={landing} />
      </main>
      <RandomizerNudge gameName="Pokémon FireRed and LeafGreen" saves="your runs" streamReady={false} />
    </>
  );
}
