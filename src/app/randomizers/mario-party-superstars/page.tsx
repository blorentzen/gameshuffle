import { Suspense } from "react";
import type { Metadata } from "next";
import { PartyRandomizer } from "@/components/party/PartyRandomizer";
import { PartyReference, partyItemLists } from "@/components/party/PartyReference";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { RandomizerLanding } from "@/components/marketing/RandomizerLanding";
import { RANDOMIZER_LANDINGS, randomizerMetadata } from "@/data/randomizer-landings";
import { SUPERSTARS } from "@/data/party/superstars";

const landing = RANDOMIZER_LANDINGS["mario-party-superstars"];
const headings = {
  boards: `All ${SUPERSTARS.boards.length} Mario Party Superstars boards`,
  minigames: "Every Mario Party Superstars minigame",
  // The game counts 100; the five Item minigames are listed on top of those.
  minigamesIntro: "All 100 minigames from Mt. Minigames, plus the 5 Item minigames, grouped by type.",
  roster: "The full character roster",
};

export const metadata: Metadata = randomizerMetadata("mario-party-superstars");

export default function SuperstarsRandomizerPage() {
  return (
    <>
      <Suspense>
        <PartyRandomizer
          game={SUPERSTARS}
          hero={{ title: landing.h1, lead: landing.lead, image: "https://cdn.empac.co/gameshuffle/images/mario-party-superstars/mario-party-superstars-hero.jpg", imagePosition: "center 25%" }}
        />
      </Suspense>
      <RandomizerLanding landing={landing} itemLists={partyItemLists(SUPERSTARS, headings)}>
        <PartyReference game={SUPERSTARS} headings={headings} />
      </RandomizerLanding>
      <RandomizerNudge gameName={SUPERSTARS.label} saves="your party setups" />
    </>
  );
}
