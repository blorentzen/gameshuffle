import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { GoldenEyeRandomizer } from "@/components/goldeneye/GoldenEyeRandomizer";
import { NewBanner } from "@/components/NewBanner";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { RandomizerLanding } from "@/components/marketing/RandomizerLanding";
import { RANDOMIZER_LANDINGS, randomizerMetadata } from "@/data/randomizer-landings";
import { GOLDENEYE_PUBLIC } from "@/lib/games-visibility";
import { BrowseHero } from "@/components/events/BrowseHero";
import { GAME_ART } from "@/data/game-art";

const landing = RANDOMIZER_LANDINGS["goldeneye-007"];

export const metadata: Metadata = randomizerMetadata("goldeneye-007");

/** /randomizers/goldeneye-007: GoldenEye 007 multiplayer randomizer (beta, names only). */
export default function GoldenEyeRandomizerPage() {
  if (!GOLDENEYE_PUBLIC && process.env.NODE_ENV === "production") notFound();
  return (
    <>
      <main>
        <BrowseHero eyebrow="Free randomizer · New" title={landing.h1} sub={landing.lead} accent="blue" field="video" image={GAME_ART["goldeneye-007"].hero} primary={{ href: "#play", label: "Roll a match" }} />
        <div id="play">
          <Container className="tool-page">
            <NewBanner />
            <GoldenEyeRandomizer />
          </Container>
        </div>
        <RandomizerLanding landing={landing} />
      </main>
      <RandomizerNudge gameName="GoldenEye 007" saves="your match setups" />
    </>
  );
}
