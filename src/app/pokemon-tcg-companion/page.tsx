import type { Metadata } from "next";
import { AppMarketingPage } from "@/components/marketing/AppMarketingPage";
import { MARKETING_APPS } from "@/data/marketing-apps";
// Cross-sell the shop + deck cluster from the companion page (funnels app
// users → cards). Overrides the template's default "suggest a TCG" band.
const content = {
  ...MARKETING_APPS["pokemon-tcg-companion"],
  crossSell: {
    heading: "Got a deck? Get the cards.",
    body: "Loving the companion? Build your next deck from GameShuffle — Pokémon singles plus ready-to-run competitive, beginner & family, and meme decks, each with a full guide.",
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
    images: [
      {
        // The homepage TCG-card artwork, cropped to the 1200×630 OG frame.
        url: "https://www.gameshuffle.co/images/opengraph/pokemon-tcg-companion-og.jpg",
        width: 1200,
        height: 630,
        alt: "Pokémon TCG cards spread on a table",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: content.metaTitle,
    description: content.metaDescription,
    images: ["https://www.gameshuffle.co/images/opengraph/pokemon-tcg-companion-og.jpg"],
  },
  alternates: { canonical: `https://www.gameshuffle.co${content.path}` },
};

export default function Page() {
  return <AppMarketingPage content={content} />;
}
