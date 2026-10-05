import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { HeroRoulette } from "@/components/heroes/HeroRoulette";
import { BetaBanner } from "@/components/BetaBanner";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { RandomizerLanding } from "@/components/marketing/RandomizerLanding";
import { BrowseHero } from "@/components/events/BrowseHero";
import { RANDOMIZER_LANDINGS, randomizerMetadata } from "@/data/randomizer-landings";
import { OVERWATCH_PUBLIC } from "@/lib/games-visibility";
import { OVERWATCH } from "@/data/heroes/overwatch";
import { liveRoster } from "@/lib/heroes/live";

const landing = RANDOMIZER_LANDINGS["overwatch"];

export const metadata: Metadata = randomizerMetadata("overwatch");
// New heroes join on their release day.
export const revalidate = 86400;

/** /randomizers/overwatch: Overwatch hero roulette (beta, names only). */
export default function Page() {
  if (!OVERWATCH_PUBLIC && process.env.NODE_ENV === "production") notFound();
  return (
    <>
      <main>
        <BrowseHero eyebrow="Free randomizer · Beta" title={landing.h1} sub={landing.lead} accent="blue" field="video" primary={{ href: "#play", label: "Roll heroes" }} />
        <div id="play">
          <Container className="tool-page">
            <BetaBanner />
            <HeroRoulette game={liveRoster(OVERWATCH)} />
          </Container>
        </div>
        <RandomizerLanding landing={landing} />
      </main>
      <RandomizerNudge gameName="Overwatch" saves="your tournaments and game nights" streamReady={false} />
    </>
  );
}
