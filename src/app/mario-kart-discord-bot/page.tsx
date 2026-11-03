import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppMarketingPage } from "@/components/marketing/AppMarketingPage";
import { DiscordMock } from "@/components/discord/DiscordMock";
import { MARKETING_APPS } from "@/data/marketing-apps";
import { compAppLive } from "@/lib/discord/appIds";

/**
 * GameShuffle Competitive's page, for people searching for a Mario Kart Discord bot (picks 2026-10-31, 5A,
 * mockups https://claude.ai/artifact/VVVpibiJJJLAu59h8unT83). Only while the app exists in this environment:
 * it 404s on production until the competitive app's keys are in.
 */

const content = MARKETING_APPS["mario-kart-discord-bot"];

export const metadata: Metadata = {
  title: content.metaTitle,
  description: content.metaDescription,
  openGraph: {
    siteName: "GameShuffle",
    title: content.metaTitle,
    description: content.metaDescription,
    url: `https://www.gameshuffle.co${content.path}`,
  },
  alternates: { canonical: `https://www.gameshuffle.co${content.path}` },
};

export default function Page() {
  if (!compAppLive()) notFound();
  return (
    <AppMarketingPage
      content={content}
      look={
        <div className="dmock-stack">
          <DiscordMock variant="ttpanel" />
          <DiscordMock variant="mmr" />
          <p className="app-look__note">Made-up players. The panel updates itself as times come in.</p>
        </div>
      }
      plans={{
        title: "More for competitive players",
        rows: ["account", "pro", "circuit"],
        from: "mario-kart-discord-bot",
        copy: {
          account: { name: "Keep your times together", body: "Link Discord to a free account: your times from any server sit on your profile and the GameShuffle boards." },
          pro: { name: "Your MMR on stream", body: "The MMR card's looks, a goal for the night and the night's recap, plus the bot in up to five servers." },
          circuit: { name: "Run the tournament", body: "Brackets, points or Heat to Mains, with the karts and tracks drawn each round." },
        },
        cta: { circuit: { label: "Start a tournament", href: "/tournament/create" } },
      }}
      afterPlans={<>See every track&apos;s best times on <Link href="/time-trials">time trials</Link>, or look a player up on <Link href="/lounge">lounge stats</Link>. Division medals by <a href="https://mkcentral.com" target="_blank" rel="noopener noreferrer">MKCentral</a>.</>}
    />
  );
}
