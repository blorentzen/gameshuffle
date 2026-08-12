import type { Metadata } from "next";
import { AppMarketingPage } from "@/components/marketing/AppMarketingPage";
import { MARKETING_APPS } from "@/data/marketing-apps";
// Cross-sell the shop + deck cluster from the companion page (funnels app
// users → cards). Overrides the template's default "suggest a TCG" band.
const content = {
  ...MARKETING_APPS["pokemon-tcg-companion"],
  crossSell: {
    heading: "Got a deck? Get the cards.",
    body: "Loving the companion? Build your next deck from GameShuffle: Pokémon singles plus ready-to-run competitive, beginner & family, and meme decks, each with a full guide.",
    ctaLabel: "Shop GameShuffle TCG",
    ctaHref: "/pokemon-tcg",
    secondaryLabel: "Browse deck guides",
    secondaryHref: "/pokemon-tcg/decks",
  },
};

export const metadata: Metadata = {
  title: content.metaTitle,
  description: content.metaDescription,
  openGraph: {
    title: content.metaTitle,
    description: content.metaDescription,
    url: `https://www.gameshuffle.co${content.path}`,
    images: ["https://cdn.empac.co/gameshuffle/images/opengraph/tcg-companion-og.jpg"],
  },
  alternates: { canonical: `https://www.gameshuffle.co${content.path}` },
};

export default function Page() {
  return <AppMarketingPage content={content} />;
}
