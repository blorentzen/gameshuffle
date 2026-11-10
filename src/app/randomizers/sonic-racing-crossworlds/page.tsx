import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { SonicRandomizer } from "@/components/sonic/SonicRandomizer";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { RandomizerLanding } from "@/components/marketing/RandomizerLanding";
import { RANDOMIZER_LANDINGS, randomizerMetadata } from "@/data/randomizer-landings";
import { CROSSWORLDS_GAME } from "@/data/sonic/crossworlds";
import { SONIC_PUBLIC } from "@/lib/games-visibility";
import { BrowseHero } from "@/components/events/BrowseHero";
import { NewBanner } from "@/components/NewBanner";

const landing = RANDOMIZER_LANDINGS["sonic-racing-crossworlds"];

export const metadata: Metadata = randomizerMetadata("sonic-racing-crossworlds");

/** /randomizers/sonic-racing-crossworlds: racer, machine and Gadget Plate rolls, races and Grands Prix. Names only. */
export default function SonicRandomizerPage() {
  if (!SONIC_PUBLIC && process.env.NODE_ENV === "production") notFound();
  return (
    <main>
      <BrowseHero eyebrow="New randomizer" title={landing.h1} sub={landing.lead}
        accent="blue" field="video" primary={{ href: "#play", label: "Randomize now" }} />
      <div id="play">
        <Container className="tool-page">
          <NewBanner />
          <Suspense>
            <SonicRandomizer game={CROSSWORLDS_GAME} />
          </Suspense>
        </Container>
      </div>
      <RandomizerNudge gameName="Sonic Racing: CrossWorlds" game={CROSSWORLDS_GAME.slug} saves="your racer, machine and gadget setups" />
      <RandomizerLanding landing={landing} />
    </main>
  );
}
