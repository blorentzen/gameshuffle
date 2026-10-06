import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { KirbyRandomizer } from "@/components/kirby/KirbyRandomizer";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { RandomizerLanding } from "@/components/marketing/RandomizerLanding";
import { RANDOMIZER_LANDINGS, randomizerMetadata } from "@/data/randomizer-landings";
import { AIR_RIDERS } from "@/data/kirby/air-riders";
import { KIRBY_PUBLIC } from "@/lib/games-visibility";
import { BrowseHero } from "@/components/events/BrowseHero";
import { GAME_ART } from "@/data/game-art";

const landing = RANDOMIZER_LANDINGS["kirby-air-riders"];

export const metadata: Metadata = randomizerMetadata("kirby-air-riders");

export default function KirbyRandomizerPage() {
  // Hidden until launch, except locally so it can be built and checked.
  if (!KIRBY_PUBLIC && process.env.NODE_ENV === "production") notFound();
  return (
    <>
      <main>
        {/* Brand band with the game-controller icons until this game's art lands (then a showcase header like Mario Kart's). */}
        <BrowseHero eyebrow="Free randomizer" title={landing.h1} sub={landing.lead} accent="blue" field="video" image={GAME_ART["kirby-air-riders"].hero} primary={{ href: "#play", label: "Randomize now" }} />
        <div id="play">
        <Container className="tool-page">
          <Suspense>
            <KirbyRandomizer game={AIR_RIDERS} />
          </Suspense>
        </Container>
        </div>
        <RandomizerLanding landing={landing} />
      </main>
      <RandomizerNudge gameName={AIR_RIDERS.label} saves="your Kirby Air Riders setups" streamReady={false} />
    </>
  );
}
