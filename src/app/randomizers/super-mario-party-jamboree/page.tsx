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
    "Free Super Mario Party Jamboree randomizer: roll the board, rules and turns, give everyone a character, and spin minigames. Works with the Switch and Switch 2 Edition.",
  canonical: "https://www.gameshuffle.co/randomizers/super-mario-party-jamboree",
};

export const metadata: Metadata = {
  title: seo.title,
  description: seo.description,
  openGraph: { title: seo.title, description: seo.description, url: seo.canonical, images: ["https://www.gameshuffle.co/images/opengraph/mario-party-jamboree-og.jpg"] },
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
      <Suspense>
        <PartyRandomizer
          game={JAMBOREE}
          hero={{ title: seo.title, lead: "Roll the board, rules and turns, give everyone a character, and spin a minigame or a whole set list. Works with the Switch and Switch 2 Edition.", image: "https://cdn.empac.co/gameshuffle/images/mario-party-jamboree/mario-party-jamboree-hero.avif", imagePosition: "center" }}
        />
      </Suspense>
      <Container>
        <p className="tool-page__lead" style={{ textAlign: "center" }}>
          Playing Mario Party Superstars instead? Try the <Link href="/randomizers/mario-party-superstars">Mario Party Superstars randomizer</Link>.
        </p>
      </Container>
      <RandomizerNudge gameName={JAMBOREE.label} saves="your party setups" streamReady={false} />
    </>
  );
}
