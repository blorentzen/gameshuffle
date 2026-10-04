import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PartyRandomizer } from "@/components/party/PartyRandomizer";
import { PartyReference, partyItemLists } from "@/components/party/PartyReference";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { RandomizerLanding } from "@/components/marketing/RandomizerLanding";
import { RANDOMIZER_LANDINGS, randomizerMetadata } from "@/data/randomizer-landings";
import { MARIO_PARTY_3 } from "@/data/party/mario-party-3";
import { N64_PARTY_PUBLIC } from "@/lib/games-visibility";

const landing = RANDOMIZER_LANDINGS["mario-party-3"];
const headings = {
  boards: `All ${MARIO_PARTY_3.boards.length} Mario Party 3 boards`,
  minigames: `All ${MARIO_PARTY_3.minigames.length} Mario Party 3 minigames`,
  roster: "The character roster",
};

export const metadata: Metadata = randomizerMetadata("mario-party-3");

/** /randomizers/mario-party-3: Mario Party 3 (N64, on Switch Online) on the shared party randomizer. Beta: no art yet. */
export default function MarioParty3RandomizerPage() {
  if (!N64_PARTY_PUBLIC && process.env.NODE_ENV === "production") notFound();
  return (
    <>
      <Suspense>
        <PartyRandomizer game={MARIO_PARTY_3} hero={{ title: landing.h1, lead: landing.lead, beta: true }} />
      </Suspense>
      <RandomizerLanding landing={landing} itemLists={partyItemLists(MARIO_PARTY_3, headings)}>
        <PartyReference game={MARIO_PARTY_3} headings={headings} />
      </RandomizerLanding>
      <RandomizerNudge gameName={MARIO_PARTY_3.label} saves="your party setups" streamReady={false} />
    </>
  );
}
