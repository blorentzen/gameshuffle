import Link from "next/link";
import { Accordion, Button, CardGroup, Container, Stack } from "@empac/cascadeds";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { DarkBand } from "@/components/marketing/DarkBand";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import type { AppMarketingContent } from "@/data/marketing-apps";

/**
 * Reusable per-app marketing landing page (the SEO/GEO surface). Driven
 * entirely by an `AppMarketingContent` record. Structure, in order:
 *   breadcrumb → hero (text + art) → answer-first overview → feature grid
 *   → how-it-works steps → cross-sell dark band → FAQ → final CTA.
 * Plus FAQ / Breadcrumb / SoftwareApplication JSON-LD for AI answer engines.
 *
 * Server component; CTAs are plain links into the clean tool routes.
 * Reuses existing `.pricing-page__faq-*` styles for the FAQ accordion.
 */
export function AppMarketingPage({ content }: { content: AppMarketingContent }) {
  const c = content;

  return (
    <main>
      <MarketingJsonLd
        appName={c.schemaName}
        appDescription={c.metaDescription}
        appUrl={c.path}
        breadcrumb={{ label: c.breadcrumbLabel, path: c.path }}
        faq={c.faq}
      />

      {/* Hero — full-bleed module using the app's art as a background */}
      <section
        className="app-hero"
        role="img"
        aria-label={c.heroImageAlt}
        style={{
          backgroundImage: `linear-gradient(90deg, rgba(8,11,18,0.94) 0%, rgba(8,11,18,0.78) 48%, rgba(8,11,18,0.5) 100%), url(${c.heroImage})`,
        }}
      >
        <Container>
          <div className="app-hero__content">
            <span className="app-hero__pill">{c.eyebrow}</span>
            <h1 className="app-hero__title">{c.h1}</h1>
            <p className="app-hero__sub">{c.heroSubhead}</p>
            <Link href={c.toolHref} style={{ textDecoration: "none" }}>
              <Button variant="primary" size="large">{c.toolCtaLabel}</Button>
            </Link>
          </div>
        </Container>
      </section>

      <Container>
        {/* Overview — answer-first */}
        <section style={{ maxWidth: "70rem", margin: "0 0 var(--spacing-48)" }}>
          <p style={{ fontSize: "var(--font-size-18)", lineHeight: "var(--line-height-relaxed)", color: "var(--text-secondary)" }}>
            {c.overview}
          </p>
        </section>

        {/* Features */}
        <section style={{ margin: "var(--spacing-80) 0" }}>
          <h2 style={{ fontSize: "var(--font-size-fluid-h3)", fontWeight: "var(--font-weight-bold)", margin: "0 0 var(--spacing-24)", lineHeight: "var(--line-height-tight)" }}>
            {c.featuresHeading}
          </h2>
          <CardGroup columns={3} gap="md">
            {c.features.map((f) => (
              <FeatureCard key={f.title} variant="compact" icon={f.icon} title={f.title} description={f.description} />
            ))}
          </CardGroup>
        </section>

        {/* How it works — omitted for tools simple enough not to need it. */}
        {c.howItWorks && c.howItWorks.length ? (
          <section style={{ margin: "var(--spacing-80) 0" }}>
            <h2 style={{ fontSize: "var(--font-size-fluid-h3)", fontWeight: "var(--font-weight-bold)", margin: "0 0 var(--spacing-24)", lineHeight: "var(--line-height-tight)" }}>
              {c.howItWorksHeading}
            </h2>
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
          </section>
        ) : null}
      </Container>

      {/* Cross-sell — dark band */}
      <DarkBand premium>
        <div style={{ textAlign: "center", maxWidth: "60rem", marginInline: "auto" }}>
          <h2 className="pro-band__title" style={{ fontSize: "var(--font-size-fluid-h3)", fontWeight: "var(--font-weight-bold)", margin: "0 0 var(--spacing-12)", lineHeight: "var(--line-height-tight)" }}>
            {c.crossSell.heading}
          </h2>
          <p style={{ fontSize: "var(--font-size-18)", lineHeight: "var(--line-height-relaxed)", margin: "0 auto var(--spacing-24)", maxWidth: "52rem" }}>
            {c.crossSell.body}
          </p>
          <Stack direction="horizontal" gap={12} justify="center" wrap>
            <Link href={c.crossSell.ctaHref} style={{ textDecoration: "none" }}>
              <Button variant="primary" size="large">{c.crossSell.ctaLabel}</Button>
            </Link>
            {c.crossSell.secondaryLabel && c.crossSell.secondaryHref ? (
              <Link href={c.crossSell.secondaryHref} style={{ textDecoration: "none" }}>
                <Button variant="secondary" size="large">{c.crossSell.secondaryLabel}</Button>
              </Link>
            ) : null}
          </Stack>
        </div>
      </DarkBand>

      <Container>
        {/* FAQ */}
        <section className="pricing-page__faq">
          <h2 style={{ fontSize: "var(--font-size-fluid-h3)", fontWeight: "var(--font-weight-bold)", margin: "0 0 var(--spacing-24)", lineHeight: "var(--line-height-tight)" }}>
            {c.faqHeading}
          </h2>
          <Accordion
            variant="bordered"
            items={c.faq.map((f, i) => ({ id: String(i), title: f.q, content: f.a }))}
          />
        </section>
      </Container>

      {/* Final CTA — full-bleed band. Uses the tool's own background when set,
          so the page feels cohesive with the randomizer it links into. */}
      <section
        className={c.ctaBackground ? "marketing-cta marketing-cta--bg" : "marketing-cta"}
        style={
          c.ctaBackground
            ? {
                backgroundImage: `linear-gradient(rgba(10,14,22,0.74), rgba(10,14,22,0.82)), url(${c.ctaBackground})`,
              }
            : undefined
        }
      >
        <Container>
          <h2 className="marketing-cta__title">Ready to play?</h2>
          <p className="marketing-cta__text">
            Jump in. It&apos;s free and runs right in your browser.
          </p>
          <Link href={c.toolHref} style={{ textDecoration: "none" }}>
            <Button variant="primary" size="large">{c.toolCtaLabel}</Button>
          </Link>
        </Container>
      </section>
    </main>
  );
}
