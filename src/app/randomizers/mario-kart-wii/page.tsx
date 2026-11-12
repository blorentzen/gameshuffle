import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RandomizerClient } from "@/components/randomizer/RandomizerClient";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { RandomizerLanding } from "@/components/marketing/RandomizerLanding";
import { RANDOMIZER_LANDINGS, randomizerMetadata } from "@/data/randomizer-landings";
import { MKWII_PUBLIC } from "@/lib/games-visibility";
import { mkwiiConfig, mkwiiHero } from "./config";
import mkwiiData from "@/data/mkwii-data.json";
import type { GameData } from "@/data/types";

const gameData = mkwiiData as unknown as GameData;

export const metadata: Metadata = randomizerMetadata("mario-kart-wii");

/** /randomizers/mario-kart-wii: Mario Kart Wii on the shared Mario Kart randomizer (hidden in production until its space opens). */
export default function MKWiiRandomizerPage() {
  if (!MKWII_PUBLIC && process.env.NODE_ENV === "production") notFound();
  return (
    <>
      <Suspense>
        <RandomizerClient gameConfig={mkwiiConfig} gameData={gameData} heroProps={mkwiiHero} />
      </Suspense>
      <RandomizerNudge game="mario-kart-wii" gameName="Mario Kart Wii" saves="your racers and game-night setups" />
      <RandomizerLanding landing={RANDOMIZER_LANDINGS["mario-kart-wii"]} />
    </>
  );
}
