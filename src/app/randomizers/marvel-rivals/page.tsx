import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { HeroRoulette } from "@/components/heroes/HeroRoulette";
import { NewBanner } from "@/components/NewBanner";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { RandomizerLanding } from "@/components/marketing/RandomizerLanding";
import { BrowseHero } from "@/components/events/BrowseHero";
import { GAME_ART } from "@/data/game-art";
import { RANDOMIZER_LANDINGS, randomizerMetadata } from "@/data/randomizer-landings";
import { MARVEL_RIVALS_PUBLIC } from "@/lib/games-visibility";
import { MARVEL_RIVALS } from "@/data/heroes/marvel-rivals";
import { liveRoster } from "@/lib/heroes/live";

const landing = RANDOMIZER_LANDINGS["marvel-rivals"];

export const metadata: Metadata = randomizerMetadata("marvel-rivals");
// New heroes join on their release day.
export const revalidate = 86400;

/** /randomizers/marvel-rivals: Marvel Rivals hero roulette (beta, names only). */
export default function Page() {
  if (!MARVEL_RIVALS_PUBLIC && process.env.NODE_ENV === "production") notFound();
  return (
    <>
      <main>
        <BrowseHero eyebrow="Free randomizer · New" title={landing.h1} sub={landing.lead} accent="red" field="heroes" image={GAME_ART["marvel-rivals"].hero} primary={{ href: "#play", label: "Roll heroes" }} />
        <div id="play">
          <Container className="tool-page">
            <NewBanner />
            <HeroRoulette game={liveRoster(MARVEL_RIVALS)} />
          </Container>
        </div>
        <RandomizerLanding landing={landing} />
      </main>
      <RandomizerNudge gameName="Marvel Rivals" saves="your tournaments and game nights" streamReady={false} />
    </>
  );
}
