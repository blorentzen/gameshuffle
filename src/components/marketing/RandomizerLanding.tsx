import Link from "next/link";
import { Accordion, Button, CardGroup, Container } from "@empac/cascadeds";
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
 * The FAQ opens fully: CDS Accordion only mounts an item's content once it has
 * been opened, so collapsed answers would be missing from the server HTML (and
 * would no longer match the FAQPage JSON-LD). Pending an upstream keep-mounted
 * option in CascadeDS.
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
  const others = randomizerCatalog().flatMap((g) => g.entries).filter((e) => e.slug !== l.slug)
    .map((e) => ({ slug: e.slug, href: e.href, title: e.title, image: e.image, beta: e.beta }));

  return (
    <>
      <RandomizerJsonLd landing={l} itemLists={itemLists} />
      <Container>
        <div className="rand-landing">
          <section aria-labelledby="about-randomizer">
            <h2 id="about-randomizer" className="rand-landing__h2">{l.featuresHeading}</h2>
            <p className="rand-landing__overview">{l.overview}</p>
            <CardGroup columns={3} gap="md">
              {l.features.map((f) => (
                <FeatureCard key={f.title} variant="compact" icon={f.icon} title={f.title} description={f.description} />
              ))}
            </CardGroup>
          </section>

          {children}

          <section aria-labelledby="randomizer-faq" className="rand-landing__faq">
            <h2 id="randomizer-faq" className="rand-landing__h2">{l.faqHeading}</h2>
            <Accordion
              variant="bordered"
              allowMultiple
              defaultOpenIds={l.faq.map((_, i) => String(i))}
              items={l.faq.map((f, i) => ({ id: String(i), title: f.q, content: f.a }))}
            />
          </section>

          {l.nextStep ? (
            <div className="randomizer-crosslink">
              <div>
                <p className="randomizer-crosslink__title">{l.nextStep.title}</p>
                <p className="randomizer-crosslink__sub">{l.nextStep.body}</p>
              </div>
              <Link href={l.nextStep.ctaHref}><Button variant="secondary">{l.nextStep.ctaLabel}</Button></Link>
            </div>
          ) : null}

          <nav aria-labelledby="more-randomizers" className="rand-landing__more">
            <h2 id="more-randomizers" className="rand-landing__h3">More game randomizers</h2>
            <MoreRandomizers entries={others} />
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
