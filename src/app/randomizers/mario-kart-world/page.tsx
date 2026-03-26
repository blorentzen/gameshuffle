import { Suspense } from "react";
import type { Metadata } from "next";
import { RandomizerClient } from "@/components/randomizer/RandomizerClient";
import { mkwConfig, mkwHero, mkwSeo } from "./config";
import mkwData from "@/data/mkw-data.json";
import type { GameData } from "@/data/types";

const gameData = mkwData as unknown as GameData;

export const metadata: Metadata = {
  title: mkwSeo.title,
  description: mkwSeo.description,
  openGraph: {
    title: mkwSeo.title,
    description: mkwSeo.description,
    url: mkwSeo.canonical,
    images: [mkwSeo.ogImage],
  },
  alternates: {
    canonical: mkwSeo.canonical,
  },
};

export default function MKWRandomizerPage() {
  return (
    <Suspense>
      <RandomizerClient
        gameConfig={mkwConfig}
        gameData={gameData}
        heroProps={mkwHero}
      />
    </Suspense>
  );
}
