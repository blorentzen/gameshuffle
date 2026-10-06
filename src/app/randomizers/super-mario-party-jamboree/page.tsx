import { Suspense } from "react";
import type { Metadata } from "next";
import { PartyRandomizer } from "@/components/party/PartyRandomizer";
import { PartyReference, partyItemLists } from "@/components/party/PartyReference";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { RandomizerLanding } from "@/components/marketing/RandomizerLanding";
import { RANDOMIZER_LANDINGS, randomizerMetadata } from "@/data/randomizer-landings";
import { JAMBOREE } from "@/data/party/jamboree";

const landing = RANDOMIZER_LANDINGS["super-mario-party-jamboree"];
const headings = {
  boards: "Every Jamboree board",
  minigames: `All ${JAMBOREE.minigames.length} Jamboree minigames`,
  rules: "Party Rules vs Pro Rules",
  roster: "The full character roster",
};

export const metadata: Metadata = randomizerMetadata("super-mario-party-jamboree");

export default function JamboreeRandomizerPage() {
  return (
    <>
      <Suspense>
        <PartyRandomizer
          game={JAMBOREE}
          hero={{ title: landing.h1, lead: landing.lead, image: "https://cdn.empac.co/gameshuffle/images/mario-party-jamboree/mario-party-jamboree-hero.avif", imagePosition: "center" }}
        />
      </Suspense>
      <RandomizerLanding landing={landing} itemLists={partyItemLists(JAMBOREE, headings)}>
        <PartyReference game={JAMBOREE} headings={headings} />
      </RandomizerLanding>
      <RandomizerNudge gameName={JAMBOREE.label} saves="your party setups" />
    </>
  );
}
