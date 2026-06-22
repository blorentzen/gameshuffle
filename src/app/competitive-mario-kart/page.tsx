import type { Metadata } from "next";
import { AppMarketingPage } from "@/components/marketing/AppMarketingPage";
import { MARKETING_APPS } from "@/data/marketing-apps";

const content = MARKETING_APPS["competitive-mario-kart"];

export const metadata: Metadata = {
  title: content.metaTitle,
  description: content.metaDescription,
  openGraph: {
    title: content.metaTitle,
    description: content.metaDescription,
    url: `https://gameshuffle.co${content.path}`,
    images: ["/images/opengraph/gameshuffle-main-og.jpg"],
  },
  alternates: { canonical: `https://gameshuffle.co${content.path}` },
};

export default function Page() {
  return <AppMarketingPage content={content} />;
}
