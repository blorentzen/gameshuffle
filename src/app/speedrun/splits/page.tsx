import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BrowseHero } from "@/components/events/BrowseHero";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { GameCover } from "@/components/games/GameCover";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { gameEntry } from "@/lib/games/key";
import { SPEEDRUN_ROSTER } from "@/data/speedrun/roster";
import { speedrunShown } from "@/lib/games-visibility";
import "@/styles/speedrun-splits.css";

/** /speedrun/splits (roster picks 2026-11-11): every game with ready-made split lists, each linking its own page. */

const title = "Speedrun Splits for LiveSplit by Game";
const description = "Ready-made split lists for Super Mario 64, Minecraft, Celeste, Super Mario Bros., Odyssey, Breath of the Wild, Portal, Cuphead, Hollow Knight and Super Mario World.";
export const metadata: Metadata = {
  title, description, alternates: { canonical: "https://www.gameshuffle.co/speedrun/splits" },
  openGraph: { title, description, url: "https://www.gameshuffle.co/speedrun/splits", siteName: "GameShuffle", type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

export default function SplitsIndexPage() {
  if (!speedrunShown()) notFound();
  return (
    <main className="srs-page">
      <MarketingJsonLd breadcrumb={{ label: "Speedrun splits", path: "/speedrun/splits", parent: { label: "Speedrun overlay", path: "/speedrun" } }} />
      <BrowseHero
        eyebrow="Speedrun splits"
        title="Speedrun splits by game"
        sub="Split lists in the order runners split, for the categories people race. Download one for LiveSplit, or use it on GameShuffle's speedrun overlay."
        subShort="Ready for LiveSplit and GameShuffle's overlay."
        accent="blue"
        field="compete"
        compact
      />
      <div className="srs-body">
        <ul className="srs-games">
          {SPEEDRUN_ROSTER.map((g) => {
            const name = gameEntry(g.key)?.name ?? g.title;
            return (
              <li key={g.key} className="srs-game">
                <Link href={`/speedrun/splits/${g.key}`} className="srs-game__link">
                  <GameCover name={name} slug={g.key} className="srs-game__cover" />
                  <span className="srs-game__txt"><b>{name}</b><span>{g.categories.map((c) => c.name).join(" · ")}</span></span>
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="srs-note">Mario Kart 8 Deluxe, Mario Kart World, Mario Kart 64, Kirby Air Riders and Pokémon FireRed and LeafGreen lists are on the speedrun page too. <ArrowLink href="/speedrun">Your speedrun overlay</ArrowLink></p>
      </div>
    </main>
  );
}
