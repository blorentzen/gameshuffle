import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GUIDES_PUBLIC } from "@/lib/games-visibility";
import Link from "next/link";
import { Container } from "@empac/cascadeds";
import { MarketingHeroCurve } from "@/components/marketing/MarketingHeroCurve";
import { GUIDE_CLUSTERS } from "@/lib/guides/manifest";
import { guidesInClusterAsync } from "@/lib/guides/store";

export const metadata: Metadata = {
  title: "Guides: running tournaments and game nights",
  description:
    "How to run a tournament, host a game night, and get a chat playing along. Practical guides on formats, seeding, mixed skill levels and keeping an evening moving, from the team behind GameShuffle.",
  openGraph: {
    title: "GameShuffle Guides",
    description: "How to run a tournament, host a game night, and get a chat playing along.",
    url: "https://www.gameshuffle.co/guides",
  },
  alternates: { canonical: "https://www.gameshuffle.co/guides" },
};

const PAGE_BG = "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))";

/* Revalidated rather than static: guides are published from an editor, so the
   index has to pick up a new one without a deploy. */
export const revalidate = 300;

export default async function GuidesIndexPage() {
  if (!GUIDES_PUBLIC && process.env.NODE_ENV === "production") notFound();
  // Empty clusters are hidden rather than shown as "coming soon": a heading
  // with nothing under it advertises that the section is unfinished.
  const withGuides = await Promise.all(
    GUIDE_CLUSTERS.map(async (c) => ({ cluster: c, guides: await guidesInClusterAsync(c.id) })),
  );
  const clusters = withGuides.filter((c) => c.guides.length > 0);

  return (
    <main className="pricing-page-main" style={{ background: PAGE_BG }}>
      <section className="pro-hero">
        <Container>
          <div className="pro-hero__content">
            <p className="marketing-eyebrow">Guides</p>
            <h1 className="pro-hero__title">How to run a night worth turning up to.</h1>
            <p className="pro-hero__sub">
              Formats, seeding, group sizes, mixed skill levels, and the logistics nobody writes
              down. Written to be useful whether or not you ever use GameShuffle.
            </p>
          </div>
        </Container>
        <MarketingHeroCurve />
      </section>

      <Container>
        {clusters.map(({ cluster, guides }) => (
          <section key={cluster.id} className="beta-section">
            <div className="guides-cluster__head">
              <h2 className="pricing-page__section-title mkt-section-title">{cluster.label}</h2>
              <Link href={cluster.pillar} className="guides-cluster__pillar">{cluster.pillarLabel}</Link>
            </div>
            <p className="guides-cluster__blurb">{cluster.blurb}</p>
            <div className="guides-grid">
              {guides.map((g) => (
                <Link key={g.slug} href={`/guides/${g.slug}`} className="guide-card">
                  <span className="guide-card__title">{g.title}</span>
                  <span className="guide-card__desc">{g.description}</span>
                  <span className="guide-card__meta">{g.minutes} min read</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </Container>
    </main>
  );
}
