import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { SmashRandomizer } from "@/components/smash/SmashRandomizer";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { RandomizerLanding } from "@/components/marketing/RandomizerLanding";
import { RANDOMIZER_LANDINGS, randomizerMetadata } from "@/data/randomizer-landings";
import { MELEE } from "@/data/smash/melee";
import { meleeShown } from "@/lib/games-visibility";
import { BrowseHero } from "@/components/events/BrowseHero";
import { GAME_ART } from "@/data/game-art";

const landing = RANDOMIZER_LANDINGS["super-smash-bros-melee"];

export const metadata: Metadata = randomizerMetadata("super-smash-bros-melee");

/** /randomizers/super-smash-bros-melee: Melee on the Smash randomizer (staff only until the Melee space opens: MELEE_PUBLIC). */
export default function MeleeRandomizerPage() {
  if (!meleeShown()) notFound();
  return (
    <main>
      <BrowseHero eyebrow="New randomizer" title={landing.h1} sub={landing.lead} accent="blue" field="video" image={GAME_ART["super-smash-bros-melee"].hero} primary={{ href: "#play", label: "Randomize now" }} />
      <div id="play">
        <Container className="tool-page">
          <Suspense>
            <SmashRandomizer game={MELEE} />
          </Suspense>
          <p className="type-card-disclaimer">
            Fighter portraits and stage pictures are in-game art from Super Smash Bros. Melee (Nintendo, HAL Laboratory), from{" "}
            <a href="https://www.mariowiki.com/Gallery:Super_Smash_Bros._Melee" target="_blank" rel="noopener noreferrer">Super Mario Wiki</a> and{" "}
            <a href="https://www.ssbwiki.com/Category:Debug_menu_(SSBM)" target="_blank" rel="noopener noreferrer">SmashWiki</a>. GameShuffle isn&apos;t affiliated with Nintendo.
          </p>
        </Container>
      </div>
      <RandomizerNudge game="super-smash-bros-melee" gameName={MELEE.label} saves="your Melee setups" />
      <RandomizerLanding landing={landing} />
    </main>
  );
}
