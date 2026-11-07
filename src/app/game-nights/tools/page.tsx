import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@empac/cascadeds";
import { GameNightTools } from "@/components/game-nights/GameNightTools";
import { COMPANION_TOOLS } from "@/lib/game-nights/companion/tools";

export const metadata: Metadata = {
  openGraph: { siteName: "GameShuffle", type: "website", url: "https://www.gameshuffle.co/game-nights/tools", images: [{ url: "/game-nights/opengraph-image.jpg", width: 1200, height: 630 }] },
  alternates: { canonical: "https://www.gameshuffle.co/game-nights/tools" },
  title: "Free game night tools: score sheets and party games",
  description: "Free tools for game night: turn order and teams, score sheets for Yahtzee, Cribbage and more, a turn timer, game and Jackbox pickers, and party games like Odd One Out.",
};

export default function GameNightToolsPage() {
  return (
    <main>
      <Container>
        <section style={{ margin: "var(--spacing-48) 0 var(--spacing-64)" }}>
          <p className="marketing-eyebrow">Game nights</p>
          <h1
            style={{
              fontSize: "var(--font-size-fluid-h2)",
              fontWeight: "var(--font-weight-bold)",
              lineHeight: "var(--line-height-tight)",
              margin: "0 0 var(--spacing-12)",
            }}
          >
            Game night tools
          </h1>
          <p style={{ fontSize: "var(--font-size-18)", color: "var(--text-secondary)", lineHeight: "var(--line-height-relaxed)", maxWidth: "44rem" }}>
            Settle who goes first and split into teams, without hunting for a coin or arguing about it.
            Add your players once and both tools use the same roster.
          </p>
          <div style={{ marginTop: "var(--spacing-32)" }}>
            <GameNightTools />
          </div>

          <div style={{ marginTop: "var(--spacing-48)" }}>
            <h2 style={{ fontSize: "var(--font-size-fluid-h3)", fontWeight: "var(--font-weight-bold)", lineHeight: "var(--line-height-tight)", margin: "0 0 var(--spacing-8)" }}>
              Score sheets, pickers &amp; party games
            </h2>
            <p style={{ fontSize: "var(--font-size-16)", color: "var(--text-secondary)", margin: "0 0 var(--spacing-20)", maxWidth: "44rem" }}>
              Score sheets so you don&apos;t need the pad from the box, pickers for what to play, and party games for the whole room.
            </p>
            <div className="bgn-companion-cards">
              {COMPANION_TOOLS.filter((t) => !t.unlisted).map((t) => (
                <Link key={t.id} href={t.href} className="bgn-companion-card">
                  <span className="bgn-companion-card__emoji" aria-hidden><t.icon size={26} stroke={1.6} /></span>
                  <span className="bgn-companion-card__name">{t.name}</span>
                  <span className="bgn-companion-card__desc">{t.description}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </Container>
    </main>
  );
}
