import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { WonderRandomizer } from "@/components/wonder/WonderRandomizer";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { RandomizerLanding } from "@/components/marketing/RandomizerLanding";
import { RANDOMIZER_LANDINGS, randomizerMetadata } from "@/data/randomizer-landings";
import { WONDER } from "@/data/wonder/wonder";
import { WONDER_PUBLIC, wonderShown } from "@/lib/games-visibility";
import { BrowseHero } from "@/components/events/BrowseHero";
import { NewBanner } from "@/components/NewBanner";
import { GAME_ART } from "@/data/game-art";

const landing = RANDOMIZER_LANDINGS["super-mario-bros-wonder"];

export const metadata: Metadata = {
  ...randomizerMetadata("super-mario-bros-wonder"),
  // Out of search until the space opens (WONDER_PUBLIC).
  ...(WONDER_PUBLIC ? {} : { robots: { index: false, follow: true } }),
};

/** /randomizers/super-mario-bros-wonder: a character and badge per player, a level by world and challenge rules.
 *  Staff only until its space opens: production 404s it while WONDER_PUBLIC is off. */
export default function WonderRandomizerPage() {
  if (!wonderShown()) notFound();
  return (
    <main>
      <BrowseHero eyebrow="New randomizer" title={landing.h1} sub={landing.lead} accent="violet" field="video"
        image={GAME_ART["super-mario-bros-wonder"].hero} primary={{ href: "#play", label: "Randomize now" }} />
      <div id="play">
        <Container className="tool-page">
          <NewBanner />
          <Suspense>
            <WonderRandomizer game={WONDER} />
          </Suspense>
        </Container>
      </div>
      <RandomizerNudge gameName={WONDER.name} game={WONDER.slug} saves="your co-op challenges" tournament={false} />
      <RandomizerLanding landing={landing} />
    </main>
  );
}
