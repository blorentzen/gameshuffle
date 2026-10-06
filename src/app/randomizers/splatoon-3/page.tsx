import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { SplatoonRandomizer } from "@/components/splatoon/SplatoonRandomizer";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { RandomizerLanding } from "@/components/marketing/RandomizerLanding";
import { RANDOMIZER_LANDINGS, randomizerMetadata } from "@/data/randomizer-landings";
import { SPLATOON3 } from "@/data/splatoon/splatoon3";
import { SPLATOON_PUBLIC } from "@/lib/games-visibility";
import { BrowseHero } from "@/components/events/BrowseHero";
import { GAME_ART } from "@/data/game-art";

const landing = RANDOMIZER_LANDINGS["splatoon-3"];

export const metadata: Metadata = randomizerMetadata("splatoon-3");

export default function SplatoonRandomizerPage() {
  // Hidden until launch, except locally so it can be built and checked.
  if (!SPLATOON_PUBLIC && process.env.NODE_ENV === "production") notFound();
  return (
    <>
      <main>
        {/* Brand band with the game-controller icons until this game's art lands (then a showcase header like Mario Kart's). */}
        <BrowseHero eyebrow="Free randomizer" title={landing.h1} sub={landing.lead} accent="blue" field="video" image={GAME_ART["splatoon-3"].hero} primary={{ href: "#play", label: "Randomize now" }} />
        <div id="play">
        <Container className="tool-page">
          <Suspense>
            <SplatoonRandomizer game={SPLATOON3} />
          </Suspense>
        </Container>
        </div>
        <RandomizerLanding landing={landing} />
      </main>
      <RandomizerNudge gameName={SPLATOON3.label} saves="your Splatoon setups" streamReady={false} />
    </>
  );
}
