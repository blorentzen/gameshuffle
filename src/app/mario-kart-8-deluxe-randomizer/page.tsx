import type { Metadata } from "next";
import { AppMarketingPage } from "@/components/marketing/AppMarketingPage";
import { MARKETING_APPS } from "@/data/marketing-apps";

const content = MARKETING_APPS["mario-kart-8-deluxe-randomizer"];

export const metadata: Metadata = {
  title: content.metaTitle,
  description: content.metaDescription,
  openGraph: {
    title: content.metaTitle,
    description: content.metaDescription,
    url: `https://gameshuffle.co${content.path}`,
    images: ["/images/opengraph/mk8dx-randomizer-og.jpg"],
  },
  alternates: { canonical: `https://gameshuffle.co${content.path}` },
};

export default function Page() {
  return <AppMarketingPage content={content} />;
}
