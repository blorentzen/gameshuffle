import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@empac/cascadeds";
import { PartyRandomizer } from "@/components/party/PartyRandomizer";
import { RandomizerNudge } from "@/components/randomizer/RandomizerNudge";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { JAMBOREE } from "@/data/party/jamboree";

const seo = {
  title: "Super Mario Party Jamboree Randomizer",
  description:
    "Randomize your Super Mario Party Jamboree night: board, rules, turns, characters, minigames, house rules and missions. Works with the Switch and Switch 2 Edition.",
  canonical: "https://www.gameshuffle.co/randomizers/super-mario-party-jamboree",
};

export const metadata: Metadata = {
  title: seo.title,
  description: seo.description,
  openGraph: { title: seo.title, description: seo.description, url: seo.canonical },
  alternates: { canonical: seo.canonical },
};

export default function JamboreeRandomizerPage() {
  return (
    <>
      <MarketingJsonLd
        appName={seo.title}
        appDescription={seo.description}
        appUrl="/randomizers/super-mario-party-jamboree"
        breadcrumb={{ label: "Super Mario Party Jamboree Randomizer", path: "/randomizers/super-mario-party-jamboree" }}
      />
      <main>
        <Container className="tool-page">
          <p className="marketing-eyebrow">Free randomizer</p>
          <h1 className="tool-page__title">{seo.title}</h1>
          <p className="tool-page__lead">
            Roll the board and rules, hand out characters, draw minigames, and deal house rules and missions for
            the whole table.
          </p>
          <Suspense>
            <PartyRandomizer game={JAMBOREE} />
          </Suspense>
          <p className="tool-page__lead">
            Racing instead? Try the <Link href="/randomizers/mario-kart-world">Mario Kart World randomizer</Link>.
          </p>
        </Container>
      </main>
      <RandomizerNudge gameName={JAMBOREE.label} saves="your party setups" streamReady={false} />
    </>
  );
}
