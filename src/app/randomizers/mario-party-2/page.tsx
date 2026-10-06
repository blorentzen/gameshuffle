import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PartyRandomizer } from "@/components/party/PartyRandomizer";
import { PartyReference, partyItemLists } from "@/components/party/PartyReference";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { RandomizerLanding } from "@/components/marketing/RandomizerLanding";
import { RANDOMIZER_LANDINGS, randomizerMetadata } from "@/data/randomizer-landings";
import { MARIO_PARTY_2 } from "@/data/party/mario-party-2";
import { N64_PARTY_PUBLIC } from "@/lib/games-visibility";
import { GAME_ART } from "@/data/game-art";

const landing = RANDOMIZER_LANDINGS["mario-party-2"];
const headings = {
  boards: `All ${MARIO_PARTY_2.boards.length} Mario Party 2 boards`,
  minigames: `All ${MARIO_PARTY_2.minigames.length} Mario Party 2 minigames`,
  roster: "The character roster",
};

export const metadata: Metadata = randomizerMetadata("mario-party-2");

/** /randomizers/mario-party-2: Mario Party 2 (N64, on Switch Online) on the shared party randomizer. Marked New: no board art yet. */
export default function MarioParty2RandomizerPage() {
  if (!N64_PARTY_PUBLIC && process.env.NODE_ENV === "production") notFound();
  return (
    <>
      <Suspense>
        <PartyRandomizer game={MARIO_PARTY_2} hero={{ title: landing.h1, lead: landing.lead, isNew: true, image: GAME_ART["mario-party-2"].hero.src, imagePosition: GAME_ART["mario-party-2"].hero.focus }} />
      </Suspense>
      <RandomizerLanding landing={landing} itemLists={partyItemLists(MARIO_PARTY_2, headings)}>
        <PartyReference game={MARIO_PARTY_2} headings={headings} />
      </RandomizerLanding>
      <RandomizerNudge gameName={MARIO_PARTY_2.label} saves="your party setups" />
    </>
  );
}
