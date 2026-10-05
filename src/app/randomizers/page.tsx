import type { Metadata } from "next";
import { Container } from "@empac/cascadeds";
import { AppCard } from "@/components/AppCard";
import { BrowseHero } from "@/components/events/BrowseHero";
import { ImageComingSoon } from "@/components/ImageComingSoon";
import { ResponsiveCarousel } from "@/components/layout/ResponsiveCarousel";
import { randomizerCatalog } from "@/data/randomizer-catalog";

export const metadata: Metadata = {
  title: "All randomizers: Mario Kart, Mario Party, Pokémon & more",
  description: "Every free GameShuffle randomizer in one place: Mario Kart 8 Deluxe, Mario Kart World, every Mario Party, Pokémon Stadium, the Fire Red & Leaf Green run challenge, GoldenEye 007 and more. No account needed.",
  alternates: { canonical: "https://www.gameshuffle.co/randomizers" },
};

/** /randomizers: every randomizer by series. The nav shows the top four and links here. */
export default function RandomizersPage() {
  const groups = randomizerCatalog();
  const count = groups.reduce((n, g) => n + g.entries.length, 0);
  return (
    <main>
      <BrowseHero
        eyebrow={`${count} free randomizers`}
        title="All randomizers"
        sub="Pick your game and roll: characters, boards, tracks, teams and whole matches. Free, no account needed."
        accent="blue"
        field="video"
      />
      <Container className="randomizer-index">
        {groups.map((g) => (
          <section key={g.id} id={g.id} className="randomizer-index__group">
            <h2 className="randomizer-index__heading">{g.heading}</h2>
            <ResponsiveCarousel className="app-card-grid" label={`${g.heading} randomizers`}>
              {g.entries.map((e) => (
                <AppCard
                  key={e.slug}
                  title={e.title}
                  description={e.blurb}
                  imageSrc={e.image}
                  imageAlt={e.imageAlt}
                  media={e.image ? undefined : <ImageComingSoon />}
                  href={e.href}
                  ctaLabel={e.cta ?? "Open randomizer"}
                  beta={e.beta}
                  linkTitle
                />
              ))}
            </ResponsiveCarousel>
          </section>
        ))}
      </Container>
    </main>
  );
}
