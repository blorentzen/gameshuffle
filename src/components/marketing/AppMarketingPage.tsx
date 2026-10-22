import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { Button, Container } from "@empac/cascadeds";
import { FaqList } from "@/components/marketing/FaqList";
import { ResponsiveCarousel } from "@/components/layout/ResponsiveCarousel";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { PlansPanel } from "@/components/marketing/PlansPanel";
import { MarketingHeroCurve } from "@/components/marketing/MarketingHeroCurve";
import { Reveal } from "@/components/marketing/Reveal";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import type { AppMarketingContent } from "@/data/marketing-apps";

/**
 * Reusable per-app marketing landing page (the SEO/GEO surface). Driven by an
 * `AppMarketingContent` record plus two page props. Structure, in order:
 *   hero → a look at the tool (`look`) → features → how it works → the plans
 *   (`plans`, a PlansPanel worded for the page) → About (the overview) → FAQ.
 * Refinement round 2 (Britton's picks, 2026-10-20,
 * https://claude.ai/artifact/Si3qUtPsHVqQXVmvGwyi4W): the picture comes first
 * and the long overview moves down to About (still in the HTML for search);
 * the generic GS Pro band became a plans panel and the closing band, which
 * repeated the hero's button, is gone.
 * Plus FAQ / Breadcrumb / SoftwareApplication JSON-LD for AI answer engines.
 */
export function AppMarketingPage({ content, look, plans, afterPlans }: {
  content: AppMarketingContent;
  /** A picture or a working piece of the tool, right under the hero. */
  look?: ReactNode;
  /** This page's plans: free account, GS Pro, GS Circuit worded for it. */
  plans: Omit<ComponentProps<typeof PlansPanel>, "id">;
  /** A line under the plans (the companion's shop). */
  afterPlans?: ReactNode;
}) {
  const c = content;
  const h2 = { fontSize: "var(--font-size-fluid-h3)", fontWeight: "var(--font-weight-bold)", margin: "0 0 var(--spacing-24)", lineHeight: "var(--line-height-tight)" } as const;

  return (
    <main>
      <MarketingJsonLd
        appName={c.schemaName}
        appDescription={c.metaDescription}
        appUrl={c.path}
        breadcrumb={{ label: c.breadcrumbLabel, path: c.path }}
        faq={c.faq}
        // HowTo mirrors the "How it works" steps rendered below.
        howTo={
          c.howItWorks?.length
            ? {
                name: `${c.howItWorksHeading ?? "How it works"}: ${c.schemaName}`,
                steps: c.howItWorks.map((s) => ({ name: s.title, text: s.description })),
              }
            : undefined
        }
      />

      {/* Hero: a full-bleed module using the app's art as a background. The art
          is decorative (a CSS background), so the section is a plain region:
          role="img" on it hid the H1 and the CTA from screen readers. */}
      <section
        className="app-hero"
        style={{
          backgroundImage: `linear-gradient(90deg, rgba(8,11,18,0.94) 0%, rgba(8,11,18,0.78) 48%, rgba(8,11,18,0.5) 100%), url(${c.heroImage})`,
        }}
      >
        <Container>
          <div className="app-hero__content">
            <p className="marketing-eyebrow">{c.eyebrow}</p>
            <h1 className="app-hero__title">{c.h1}</h1>
            <p className="app-hero__sub">{c.heroSubhead}</p>
            <Link href={c.toolHref} style={{ textDecoration: "none" }}>
              <Button variant="primary" size="large">{c.toolCtaLabel}</Button>
            </Link>
          </div>
        </Container>
        <MarketingHeroCurve color="var(--surface-default)" />
      </section>

      <Container>
        {look && <section className="app-look" aria-label={`${c.breadcrumbLabel}, a look`}>{look}</section>}

        {/* Features */}
        <section style={{ margin: "var(--spacing-64) 0 var(--spacing-80)" }}>
          <h2 style={h2}>
            {c.featuresHeading}
          </h2>
          <Reveal>
            {/* CDS CardGroup's classes keep the desktop grid; phones swipe (Britton's picks, 2026-10-19). */}
            <ResponsiveCarousel className="empac-card-group empac-card-group--cols-3 empac-card-group--gap-md" label={c.featuresHeading}>
              {c.features.map((f) => (
                <FeatureCard key={f.title} variant="compact" icon={f.icon} title={f.title} description={f.description} />
              ))}
            </ResponsiveCarousel>
          </Reveal>
        </section>

        {/* How it works — omitted for tools simple enough not to need it. */}
        {c.howItWorks && c.howItWorks.length ? (
          <section style={{ margin: "var(--spacing-80) 0" }}>
            <h2 style={h2}>
              {c.howItWorksHeading}
            </h2>
            <Reveal>
              <ol className="app-steps">
                {c.howItWorks.map((s, i) => (
                  <li key={s.title} className="app-steps__item">
                    <span className="app-steps__num" aria-hidden="true">{i + 1}</span>
                    <div>
                      <h3 className="app-steps__title">{s.title}</h3>
                      <p className="app-steps__body">{s.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Reveal>
          </section>
        ) : null}

        <PlansPanel id="plans" {...plans} />
        {afterPlans && <p className="app-after-plans">{afterPlans}</p>}

        {/* About: the answer-first overview, kept for search and for anyone who wants the whole picture. */}
        <section className="app-about" aria-labelledby="app-about">
          <h2 id="app-about" style={h2}>{c.aboutHeading ?? `About ${c.breadcrumbLabel}`}</h2>
          <p className="app-about__text">{c.overview}</p>
        </section>

        {/* FAQ */}
        <section className="pricing-page__faq app-faq">
          <h2 style={h2}>
            {c.faqHeading}
          </h2>
          <FaqList items={c.faq} />
        </section>
      </Container>
    </main>
  );
}
