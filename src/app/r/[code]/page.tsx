import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, Container } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import type { ArtCategory } from "@/components/events/EventHeaderArt";
import { loadShare } from "@/lib/share/store";
import { GAME_NAME, GAME_PATH, shareAlt, shareTitle, type ShareData } from "@/lib/share/types";
import { previewText, shareMeta } from "@/lib/og/meta";
import { dayKey } from "@/lib/originals/daily";
import "@/styles/share.css";

/**
 * /r/<code>: a shared result (Britton's picks, 2026-10-19). The player's card (also the link's
 * preview, opengraph-image.tsx), who it is and how they did, and "Can you beat it?" with today's
 * game. The Play button carries the sharer's invite code, so a friend who plays earns them tokens.
 * Never indexed: these are people's results, found by their link.
 */

export const dynamic = "force-dynamic";

const ACCENT: Record<ShareData["kind"], { accent: "daily" | "dex" | "fire" | "weekly" | "blue" | "violet"; field: ArtCategory }> = {
  shuffle: { accent: "daily", field: "daily" },
  dex: { accent: "dex", field: "dex" },
  fire: { accent: "fire", field: "fire" },
  weekly: { accent: "weekly", field: "weekly" },
  day: { accent: "blue", field: "originals" },
  supporter: { accent: "violet", field: "support" },
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

export default async function SharedResultPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const share = await loadShare(code);
  if (!share) notFound();
  const d = share.data;
  const first = d.parts[0];
  if (d.kind === "supporter") return <SupporterResult code={code} d={d} version={Date.parse(share.updatedAt)} />;
  const game = d.kind === "day" || first?.kind === "supporter" ? null : first?.kind ?? null;
  const path = game ? GAME_PATH[game] : "/daily";
  const href = `${path}?${new URLSearchParams({ ...(d.referral ? { r: d.referral } : {}), src: "share-card" })}`;
  const label = game === "fire" ? "Play today's Fire Round" : game === "weekly" ? "Answer this week's" : game ? `Play today's ${GAME_NAME[game].replace("The ", "")}` : "Play today's dailies";
  const old = d.day !== dayKey();
  const { accent, field } = ACCENT[d.kind];
  const version = Date.parse(share.updatedAt);

  return (
    <main>
      <BrowseHero
        eyebrow="Shared from GameShuffle"
        title={shareTitle(d)}
        sub={old ? "This one was from another day. Today's is new and the same for everyone." : "Can you beat it? Today's is the same for everyone. Free, no account needed."}
        subShort="Can you beat it?"
        accent={accent}
        field={field}
        compact
      />
      <Container className="tool-page share-result">
        {/* eslint-disable-next-line @next/next/no-img-element -- our own drawn card, sized by CSS */}
        <img className="share-result__card" src={`/r/${code}/card?size=wide&v=${version}`} alt={shareAlt(d)} width={1200} height={630} />
        <div className="share-result__actions">
          <Link href={href}><Button variant="primary" size="large">{label}</Button></Link>
          {d.kind !== "day" && <Link href="/daily" className="share-result__more">See all of today&apos;s dailies</Link>}
        </div>
        {d.player?.profile && <p className="share-result__who">More from <Link href={d.player.profile}>{d.player.name}</Link> on GameShuffle.</p>}
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
