import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, Container } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import type { ArtCategory } from "@/components/events/EventHeaderArt";
import { DailiesBar, DailiesProvider } from "@/components/originals/Dailies";
import { DailyShuffle } from "@/components/originals/DailyShuffle";
import { DailyDex } from "@/components/originals/DailyDex";
import { WeeklyChallenge } from "@/components/originals/WeeklyChallenge";
import { FireRound } from "@/components/fireRound/FireRound";
import { NameEveryPokemon } from "@/components/pokemon/NameEveryPokemon";
import { ShareChallengeProvider } from "@/components/share/ShareChallenge";
import { ShareFriendCard } from "@/components/share/ShareFriendCard";
import { loadShare } from "@/lib/share/store";
import { GAME_NAME, challengeSub, challengeTitle, challengeWho, shareAlt, shareTitle, type ShareData } from "@/lib/share/types";
import { previewText, shareMeta } from "@/lib/og/meta";
import { dayKey } from "@/lib/originals/daily";
import "@/styles/share.css";
import "@/styles/fire-round.css";

/**
 * /r/<code>: a shared result as a challenge (Britton's picks, 2026-10-20, all as recommended:
 * https://claude.ai/artifact/6LYnhCNeLorPPRQkDNFE2F). The link opens today's game itself, with
 * the friend's result drawn on top ("Nova got it in 2. Your turn."), their row marked on the
 * leaderboard and You vs them on the end screen (ShareChallenge). An older link names their day
 * and today's puzzle is yours. The today bar waits until you've played, so the page is one game.
 * The sharer's invite code rides along (DailiesProvider `invite`), the link preview is still the
 * picture card (opengraph-image.tsx), and it's never indexed: people's results, found by link.
 */

export const dynamic = "force-dynamic";

const ACCENT: Record<ShareData["kind"], { accent: "daily" | "dex" | "fire" | "weekly" | "blue" | "violet"; field: ArtCategory }> = {
  shuffle: { accent: "daily", field: "daily" },
  dex: { accent: "dex", field: "dex" },
  fire: { accent: "fire", field: "fire" },
  weekly: { accent: "weekly", field: "weekly" },
  day: { accent: "daily", field: "daily" },
  supporter: { accent: "violet", field: "support" },
  names: { accent: "dex", field: "dex" },
};

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const share = await loadShare(code);
  if (!share) return { title: "Result not found", robots: { index: false, follow: false } };
  const title = shareTitle(share.data);
  return {
    title,
    description: previewText(`${shareAlt(share.data)} Can you beat it? Play today's, free.`),
    robots: { index: false, follow: true },
    ...shareMeta({ title, description: previewText("Can you beat it? Today's puzzle is the same for everyone. Free, no account needed."), path: `/r/${code}`, canonical: false }),
  };
}

/** The game the link opens: the card's game, or the Daily Shuffle for a day card. */
function gameFor(d: ShareData): "shuffle" | "dex" | "fire" | "weekly" | "names" {
  const k = d.parts[0]?.kind;
  if (d.kind === "day" || !k || k === "supporter") return "shuffle";
  return k;
}

export default async function SharedResultPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const share = await loadShare(code);
  if (!share) notFound();
  const d = share.data;
  if (d.kind === "supporter") return <SupporterResult code={code} d={d} version={Date.parse(share.updatedAt)} />;
  const today = dayKey();
  const game = gameFor(d);
  const { accent, field } = ACCENT[d.kind];
  const who = d.player ? challengeWho(d) : null;

  const body = game === "names" ? <NameEveryPokemon />
    : (
      <DailiesProvider current={game} invite={d.referral}>
        <DailiesBar current={game} afterPlayed />
        {game === "shuffle" ? <DailyShuffle /> : game === "dex" ? <DailyDex /> : game === "fire" ? <FireRound /> : <WeeklyChallenge />}
      </DailiesProvider>
    );

  return (
    <main>
      <BrowseHero
        eyebrow={`${who ? `Shared by ${who}` : "Shared from GameShuffle"} · ${game === "names" ? GAME_NAME.names : d.kind === "day" ? "The dailies" : GAME_NAME[game]}`}
        title={challengeTitle(d, today)}
        sub={challengeSub(d, today)}
        subShort={challengeSub(d, today)}
        accent={accent}
        field={field}
        compact
      />
      <Container className={`tool-page daily-page share-challenge${game === "fire" ? " fire-page" : ""}`}>
        <ShareChallengeProvider value={{ code, name: d.player?.name ?? null, avatar: d.player?.avatar ?? null, day: d.day, parts: d.parts }}>
          <ShareFriendCard d={d} today={today} />
          {body}
        </ShareChallengeProvider>
      </Container>
    </main>
  );
}

/** A supporter's card: "Sam keeps game night free", then Play free and Support GameShuffle, with their invite code. */
function SupporterResult({ code, d, version }: { code: string; d: ShareData; version: number }) {
  const ref: Record<string, string> = d.referral ? { r: d.referral } : {};
  return (
    <main>
      <BrowseHero
        eyebrow="Shared from GameShuffle"
        title={shareTitle(d)}
        sub="GameShuffle is free, with no ads: daily puzzles, randomizers and party tools. Come play, or chip in too."
        subShort="Come play, or chip in too."
        accent="violet"
        field="support"
        compact
      />
      <Container className="tool-page share-result">
        {/* eslint-disable-next-line @next/next/no-img-element -- our own drawn card, sized by CSS */}
        <img className="share-result__card" src={`/r/${code}/card?size=wide&v=${version}`} alt={shareAlt(d)} width={1200} height={630} />
        <div className="share-result__actions">
          <Link href={`/daily?${new URLSearchParams({ ...ref, src: "share-supporter" })}`}><Button variant="primary" size="large">Play free</Button></Link>
          <Link href="/support?src=share-supporter" className="share-result__more">Support GameShuffle</Link>
        </div>
        {d.player?.profile && <p className="share-result__who">More from <Link href={d.player.profile}>{d.player.name}</Link> on GameShuffle.</p>}
      </Container>
    </main>
  );
}
