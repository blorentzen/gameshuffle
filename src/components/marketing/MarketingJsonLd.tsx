/**
 * Structured-data (JSON-LD) for marketing pages — the GEO/AEO surface
 * that lets AI answer engines and search extract the page cleanly.
 * Emits up to four graphs:
 *   - SoftwareApplication  → the tool itself (free, web, game/utility)
 *   - BreadcrumbList       → Home › <page> hierarchy
 *   - FAQPage              → the page's FAQ (rich-result eligible)
 *   - HowTo                → step-by-step instructions (mirror visible steps)
 *
 * Render once per page (server component). Pass only what applies.
 */

import { SITE_URL } from "@/lib/seo";

const BASE = SITE_URL;

export interface JsonLdFaq {
  q: string;
  a: string;
}

export interface JsonLdHowToStep {
  name: string;
  text: string;
}

export function MarketingJsonLd({
  appName,
  appDescription,
  appUrl,
  appCategory = "GameApplication",
  breadcrumb,
  faq,
  howTo,
}: {
  /** SoftwareApplication name (e.g. "Mario Kart 8 Deluxe Randomizer"). */
  appName?: string;
  appDescription?: string;
  /** Canonical URL of this marketing page (path, e.g. "/mario-kart-8-deluxe-randomizer"). */
  appUrl?: string;
  /** schema.org applicationCategory (GameApplication | UtilitiesApplication). */
  appCategory?: string;
  /** Breadcrumb trail leaf label (Home is prepended automatically). */
  breadcrumb?: { label: string; path: string };
  /** FAQ entries — plain text answers (no markup). */
  faq?: JsonLdFaq[];
  /** HowTo steps — must mirror the steps visibly rendered on the page. */
  howTo?: { name: string; steps: JsonLdHowToStep[] };
}) {
  const graphs: Record<string, unknown>[] = [];

  if (appName && appUrl) {
    graphs.push({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: appName,
      description: appDescription,
      url: `${BASE}${appUrl}`,
      applicationCategory: appCategory,
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

  if (howTo?.steps.length) {
    graphs.push({
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: howTo.name,
      step: howTo.steps.map((s, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        name: s.name,
        text: s.text,
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
