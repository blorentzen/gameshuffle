import Link from "next/link";
import { Button, Container } from "@empac/cascadeds";
import { ResponsiveCarousel } from "@/components/layout/ResponsiveCarousel";
import { FaqList } from "@/components/marketing/FaqList";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { MoreRandomizers } from "@/components/marketing/MoreRandomizers";
import { type RandomizerLanding as Landing } from "@/data/randomizer-landings";
import { randomizerCatalog } from "@/data/randomizer-catalog";
import { SITE_URL } from "@/lib/seo";

/**
 * The landing copy under a game randomizer: overview + features, optional
 * reference sections (children), FAQ, a next step and cross-links to the other
 * randomizers. Server component, so everything here is in the initial HTML.
 *
 * The FAQ shows questions only (FaqList keeps every answer in the server HTML,
 * so it still matches the FAQPage JSON-LD), and the feature cards swipe on
 * phones (Britton's picks, 2026-10-19).
 */
export function RandomizerLanding({
  landing,
  itemLists,
  children,
}: {
  landing: Landing;
  /** Named lists for ItemList JSON-LD (boards, minigames), mirroring visible sections. */
  itemLists?: { name: string; items: string[] }[];
  children?: React.ReactNode;
}) {
  const l = landing;
  // Five related randomizers, then an "all randomizers" card (Britton, 2026-10-19: not a long run of
  // dots): up to three from this game's series, then the first of each other series.
  const groups = randomizerCatalog();
  const mine = groups.find((g) => g.entries.some((e) => e.slug === l.slug));
  const total = groups.reduce((n, g) => n + g.entries.length, 0);
  const others = [
    ...(mine ? mine.entries.filter((e) => e.slug !== l.slug).slice(0, 3) : []),
    ...groups.filter((g) => g !== mine).map((g) => g.entries[0]),
  ].filter(Boolean).slice(0, 5)
    .map((e) => ({ slug: e.slug, href: e.href, title: e.short ?? e.title, image: e.image, art: e.art, isNew: e.isNew }));

  return (
    <>
      <RandomizerJsonLd landing={l} itemLists={itemLists} />
      <Container>
        <div className="rand-landing">
          <section aria-labelledby="about-randomizer">
            <h2 id="about-randomizer" className="rand-landing__h2">{l.featuresHeading}</h2>
            <p className="rand-landing__overview">{l.overview}</p>
            {/* CDS CardGroup's own classes keep the desktop grid; phones swipe. */}
            <ResponsiveCarousel className="empac-card-group empac-card-group--cols-3 empac-card-group--gap-md" label={l.featuresHeading}>
              {l.features.map((f) => (
                <FeatureCard key={f.title} variant="compact" icon={f.icon} title={f.title} description={f.description} />
              ))}
            </ResponsiveCarousel>
          </section>

          {children}

          <section aria-labelledby="randomizer-faq" className="rand-landing__faq">
            <h2 id="randomizer-faq" className="rand-landing__h2">{l.faqHeading}</h2>
            <FaqList items={l.faq} />
          </section>

          {l.nextStep ? (
            <aside className="randomizer-crosslink" aria-label={l.nextStep.title}>
              <div>
                <p className="randomizer-crosslink__title">{l.nextStep.title}</p>
                <p className="randomizer-crosslink__sub">{l.nextStep.body}</p>
              </div>
              <Link href={l.nextStep.ctaHref}><Button variant="secondary">{l.nextStep.ctaLabel}</Button></Link>
            </aside>
          ) : null}

          <nav aria-labelledby="more-randomizers" className="rand-landing__more">
            <h2 id="more-randomizers" className="rand-landing__h3">More game randomizers</h2>
            <MoreRandomizers entries={others} allCount={total} />
          </nav>
        </div>
      </Container>
    </>
  );
}

/** One JSON-LD block: WebApplication, BreadcrumbList, FAQPage and any ItemLists. */
function RandomizerJsonLd({ landing: l, itemLists }: { landing: Landing; itemLists?: { name: string; items: string[] }[] }) {
  const url = `${SITE_URL}${l.path}`;
  const graph: Record<string, unknown>[] = [
    {
      "@type": "WebApplication",
      "@id": `${url}#app`,
      name: l.h1,
      description: l.metaDescription,
      url,
      applicationCategory: "GameApplication",
      operatingSystem: "Web",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      publisher: { "@type": "Organization", name: "GameShuffle", url: SITE_URL },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        // No /randomizers index page yet; /apps is where every randomizer is listed.
        { "@type": "ListItem", position: 2, name: "Randomizers", item: `${SITE_URL}/apps` },
        { "@type": "ListItem", position: 3, name: l.h1, item: url },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: l.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
    ...(itemLists ?? []).map((list) => ({
      "@type": "ItemList",
      name: list.name,
      numberOfItems: list.items.length,
      itemListElement: list.items.map((name, i) => ({ "@type": "ListItem", position: i + 1, name })),
    })),
  ];
  return (
    <script
      type="application/ld+json"
      // Static, server-rendered, not user-generated.
      dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@graph": graph }) }}
    />
  );
}
