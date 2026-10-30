import type { Metadata } from "next";
import { AppMarketingPage } from "@/components/marketing/AppMarketingPage";
import { MARKETING_APPS } from "@/data/marketing-apps";
import Link from "next/link";
import { CounterTool } from "@/components/tcg/rules/CounterTool";
import "@/styles/tcg-rules.css";

const content = MARKETING_APPS["pokemon-tcg-companion"];

export const metadata: Metadata = {
  title: content.metaTitle,
  description: content.metaDescription,
  openGraph: {
    siteName: "GameShuffle",
    title: content.metaTitle,
    description: content.metaDescription,
    url: `https://www.gameshuffle.co${content.path}`,
    images: ["https://cdn.empac.co/gameshuffle/images/opengraph/tcg-companion-og.jpg"],
  },
  alternates: { canonical: `https://www.gameshuffle.co${content.path}` },
};

export default function Page() {
  return (
    <AppMarketingPage
      content={content}
      look={<><CounterTool /><p className="app-look__note">The damage counter tray from the companion. Try it here.</p></>}
      plans={{
        title: "Take your games further",
        rows: ["account", "pro", "circuit"],
        from: "pokemon-tcg-companion",
        copy: {
          account: { name: "Save your games and decks", body: "Pick up a saved game on any phone, keep three deck lists and collect up to 250 cards in My Cards." },
          pro: { name: "Play together on two phones", body: "One board on both phones, at the table or on a call, and unlimited deck lists. Your opponent plays free." },
          circuit: { name: "Run a Swiss tournament", body: "Pairings, standings and a top cut by the Play! Pokémon rules, with deck lists checked for Standard." },
        },
        cta: { circuit: { label: "Start a tournament", href: "/tournament/create" } },
      }}
      afterPlans={<>Need cards? <Link href="/pokemon-tcg">Shop our cards</Link> or <Link href="/pokemon-tcg/decks">browse the deck guides</Link>.</>}
    />
  );
}
