import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { PerfectDarkRandomizer } from "@/components/perfectdark/PerfectDarkRandomizer";
import { BetaBanner } from "@/components/BetaBanner";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { RandomizerLanding } from "@/components/marketing/RandomizerLanding";
import { RANDOMIZER_LANDINGS, randomizerMetadata } from "@/data/randomizer-landings";
import { PERFECT_DARK_PUBLIC } from "@/lib/games-visibility";
import { BrowseHero } from "@/components/events/BrowseHero";
import { GAME_ART } from "@/data/game-art";

const landing = RANDOMIZER_LANDINGS["perfect-dark"];

export const metadata: Metadata = randomizerMetadata("perfect-dark");

/** /randomizers/perfect-dark: Perfect Dark Combat Simulator randomizer (beta, names only). */
export default function PerfectDarkRandomizerPage() {
  if (!PERFECT_DARK_PUBLIC && process.env.NODE_ENV === "production") notFound();
  return (
    <>
      <main>
        <BrowseHero eyebrow="Free randomizer · Beta" title={landing.h1} sub={landing.lead} accent="violet" field="video" image={GAME_ART["perfect-dark"].hero} primary={{ href: "#play", label: "Roll a match" }} />
        <div id="play">
          <Container className="tool-page">
            <BetaBanner />
            <PerfectDarkRandomizer />
          </Container>
        </div>
        <RandomizerLanding landing={landing} />
      </main>
      <RandomizerNudge gameName="Perfect Dark" saves="your tournaments and game nights" streamReady={false} />
    </>
  );
}
