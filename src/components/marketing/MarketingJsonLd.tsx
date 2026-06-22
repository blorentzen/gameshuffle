/**
 * Structured-data (JSON-LD) for marketing pages — the GEO/AEO surface
 * that lets AI answer engines and search extract the page cleanly.
 * Emits up to three graphs:
 *   - SoftwareApplication  → the tool itself (free, web, game utility)
 *   - BreadcrumbList       → Home › <page> hierarchy
 *   - FAQPage              → the page's FAQ (rich-result eligible)
 *
 * Render once per page (server component). Pass only what applies.
 */

const BASE = "https://gameshuffle.co";

export interface JsonLdFaq {
  q: string;
  a: string;
}

export function MarketingJsonLd({
  appName,
  appDescription,
  appUrl,
  breadcrumb,
  faq,
}: {
  /** SoftwareApplication name (e.g. "Mario Kart 8 Deluxe Randomizer"). */
  appName?: string;
  appDescription?: string;
  /** Canonical URL of this marketing page (path, e.g. "/mario-kart-8-deluxe-randomizer"). */
  appUrl?: string;
  /** Breadcrumb trail leaf label (Home is prepended automatically). */
  breadcrumb?: { label: string; path: string };
  /** FAQ entries — plain text answers (no markup). */
  faq?: JsonLdFaq[];
}) {
  const graphs: Record<string, unknown>[] = [];

  if (appName && appUrl) {
    graphs.push({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: appName,
      description: appDescription,
      url: `${BASE}${appUrl}`,
      applicationCategory: "GameApplication",
      operatingSystem: "Web",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      publisher: { "@type": "Organization", name: "GameShuffle", url: BASE },
    });
  }

  if (breadcrumb) {
    graphs.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: BASE },
        {
          "@type": "ListItem",
          position: 2,
          name: breadcrumb.label,
          item: `${BASE}${breadcrumb.path}`,
        },
      ],
    });
  }

  if (faq?.length) {
    graphs.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }

  if (!graphs.length) return null;

  return (
    <>
      {graphs.map((g, i) => (
        <script
          key={i}
          type="application/ld+json"
          // JSON-LD is static, server-rendered, and not user-generated.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(g) }}
        />
      ))}
    </>
  );
}
