import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PartyRandomizer } from "@/components/party/PartyRandomizer";
import { PartyReference, partyItemLists } from "@/components/party/PartyReference";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { RandomizerLanding } from "@/components/marketing/RandomizerLanding";
import { RANDOMIZER_LANDINGS, randomizerMetadata } from "@/data/randomizer-landings";
import { MARIO_PARTY } from "@/data/party/mario-party-1";
import { N64_PARTY_PUBLIC } from "@/lib/games-visibility";

const landing = RANDOMIZER_LANDINGS["mario-party"];
const headings = {
  boards: `All ${MARIO_PARTY.boards.length} Mario Party boards`,
  minigames: `All ${MARIO_PARTY.minigames.length} Mario Party minigames`,
  roster: "The character roster",
};

export const metadata: Metadata = randomizerMetadata("mario-party");

/** /randomizers/mario-party: Mario Party (N64, on Switch Online) on the shared party randomizer. Beta: no art yet. */
export default function MarioPartyRandomizerPage() {
  if (!N64_PARTY_PUBLIC && process.env.NODE_ENV === "production") notFound();
  return (
    <>
      <Suspense>
        <PartyRandomizer game={MARIO_PARTY} hero={{ title: landing.h1, lead: landing.lead, beta: true }} />
      </Suspense>
      <RandomizerLanding landing={landing} itemLists={partyItemLists(MARIO_PARTY, headings)}>
        <PartyReference game={MARIO_PARTY} headings={headings} />
      </RandomizerLanding>
      <RandomizerNudge gameName={MARIO_PARTY.label} saves="your party setups" streamReady={false} />
    </>
  );
}
