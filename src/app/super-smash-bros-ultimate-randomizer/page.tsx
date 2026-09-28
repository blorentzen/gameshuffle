import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppMarketingPage } from "@/components/marketing/AppMarketingPage";
import { MARKETING_APPS } from "@/data/marketing-apps";
import { SMASH_PUBLIC } from "@/lib/games-visibility";

const content = MARKETING_APPS["super-smash-bros-ultimate-randomizer"];

export const metadata: Metadata = {
  title: content.metaTitle,
  description: content.metaDescription,
  openGraph: {
    title: content.metaTitle,
    description: content.metaDescription,
    url: `https://www.gameshuffle.co${content.path}`,
  },
  alternates: { canonical: `https://www.gameshuffle.co${content.path}` },
};

export default function Page() {
  if (!SMASH_PUBLIC) notFound();
  return <AppMarketingPage content={content} />;
}
