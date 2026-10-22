import type { Metadata } from "next";
import { AppMarketingPage } from "@/components/marketing/AppMarketingPage";
import { MARKETING_APPS } from "@/data/marketing-apps";
import { LoungeStandingsArt } from "@/components/marketing/LoungeStandingsArt";

const content = MARKETING_APPS["competitive-mario-kart"];

export const metadata: Metadata = {
  title: content.metaTitle,
  description: content.metaDescription,
  openGraph: {
    title: content.metaTitle,
    description: content.metaDescription,
    url: `https://www.gameshuffle.co${content.path}`,
    images: ["https://cdn.empac.co/gameshuffle/images/opengraph/mk-lounge-og.jpg"],
  },
  alternates: { canonical: `https://www.gameshuffle.co${content.path}` },
};

export default function Page() {
  return (
    <AppMarketingPage
      content={content}
      look={<LoungeStandingsArt />}
      plans={{
        title: "Take your lounges further",
        rows: ["account", "pro", "circuit"],
        from: "competitive-mario-kart",
        copy: {
          account: { name: "Score your lounges", body: "A free account starts lounges and keeps your results." },
          pro: { name: "Put it on your stream", body: "Chat rolls everyone's combo, viewers pick and ban the tracks, and every roll shows on your OBS overlay." },
          circuit: { name: "Run it as a tournament", body: "Brackets, Swiss or points with random picks each round. Bigger fields and season standings come with GS Circuit." },
        },
        cta: { account: { label: "Open the competitive hub", href: "/competitive/mario-kart-8-deluxe" } },
      }}
    />
  );
}
