import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { SmashRandomizer } from "@/components/smash/SmashRandomizer";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { RandomizerLanding } from "@/components/marketing/RandomizerLanding";
import { RANDOMIZER_LANDINGS, randomizerMetadata } from "@/data/randomizer-landings";
import { ULTIMATE } from "@/data/smash/ultimate";
import { SMASH_PUBLIC } from "@/lib/games-visibility";
import { BrowseHero } from "@/components/events/BrowseHero";
import { GAME_ART } from "@/data/game-art";

const landing = RANDOMIZER_LANDINGS["super-smash-bros-ultimate"];

export const metadata: Metadata = randomizerMetadata("super-smash-bros-ultimate");

export default function SmashRandomizerPage() {
  if (!SMASH_PUBLIC && process.env.NODE_ENV === "production") notFound();
  return (
    <>
      <main>
        {/* Brand band with the game-controller icons until this game's art lands (then a showcase header like Mario Kart's). */}
        <BrowseHero eyebrow="Free randomizer" title={landing.h1} sub={landing.lead} accent="blue" field="video" image={GAME_ART["super-smash-bros-ultimate"].hero} primary={{ href: "#play", label: "Randomize now" }} />
        <div id="play">
        <Container className="tool-page">
          <Suspense>
            <SmashRandomizer game={ULTIMATE} />
          </Suspense>
        </Container>
        </div>
        <RandomizerLanding landing={landing} />
      </main>
      <RandomizerNudge gameName={ULTIMATE.label} saves="your Smash setups" />
    </>
  );
}
