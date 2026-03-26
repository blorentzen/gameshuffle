import { Suspense } from "react";
import type { Metadata } from "next";
import { RandomizerClient } from "@/components/randomizer/RandomizerClient";
import { mk8dxConfig, mk8dxHero, mk8dxSeo } from "./config";
import mk8dxData from "@/data/mk8dx-data.json";
import type { GameData } from "@/data/types";

const gameData = mk8dxData as GameData;

export const metadata: Metadata = {
  title: mk8dxSeo.title,
  description: mk8dxSeo.description,
  openGraph: {
    title: mk8dxSeo.title,
    description: mk8dxSeo.description,
    url: mk8dxSeo.canonical,
    images: [mk8dxSeo.ogImage],
  },
  alternates: {
    canonical: mk8dxSeo.canonical,
  },
};

export default function MK8DXRandomizerPage() {
  return (
    <Suspense>
      <RandomizerClient
        gameConfig={mk8dxConfig}
        gameData={gameData}
        heroProps={mk8dxHero}
      />
    </Suspense>
  );
}
