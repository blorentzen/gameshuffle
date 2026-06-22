import Link from "next/link";
import { Badge, Button, CardGroup, Container, Stack } from "@empac/cascadeds";
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

      <Container>
        {/* Hero */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(20rem, 1fr))",
            gap: "var(--spacing-40)",
            alignItems: "center",
            margin: "var(--spacing-32) 0 var(--spacing-48)",
          }}
        >
          <div>
            <Badge variant={c.status === "beta" ? "info" : "success"} size="small">
              {c.status === "beta" ? "Beta" : "Live"}
            </Badge>
            <h1
              style={{
                fontSize: "var(--font-size-fluid-h2)",
                fontWeight: "var(--font-weight-bold)",
                margin: "var(--spacing-12) 0",
                lineHeight: "var(--line-height-tight)",
              }}
            >
              {c.h1}
            </h1>
            <p
              style={{
                fontSize: "var(--font-size-20)",
                color: "var(--text-secondary)",
                lineHeight: "var(--line-height-relaxed)",
                margin: "0 0 var(--spacing-24)",
              }}
            >
              {c.heroSubhead}
            </p>
            <Link href={c.toolHref} style={{ textDecoration: "none" }}>
              <Button variant="primary" size="large">{c.toolCtaLabel}</Button>
            </Link>
          </div>
          <div
            style={{
              borderRadius: "var(--radius-lg, 0.75rem)",
              overflow: "hidden",
              aspectRatio: "16 / 10",
              background: "var(--surface-subtle, var(--gray-100))",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={c.heroImage}
              alt={c.heroImageAlt}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          </div>
        </section>

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
      <DarkBand>
        <div style={{ textAlign: "center", maxWidth: "60rem", marginInline: "auto" }}>
          <h2 style={{ fontSize: "var(--font-size-fluid-h3)", fontWeight: "var(--font-weight-bold)", margin: "0 0 var(--spacing-12)", lineHeight: "var(--line-height-tight)" }}>
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
          <Stack direction="vertical" gap={16}>
            {c.faq.map((f) => (
              <details key={f.q} className="pricing-page__faq-item">
                <summary>{f.q}</summary>
                <div className="pricing-page__faq-body">{f.a}</div>
              </details>
            ))}
          </Stack>
        </section>

        {/* Final CTA — uses the tool's own background when set, so the page
            feels cohesive with the randomizer it links into. */}
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
          <h2 className="marketing-cta__title">Ready to play?</h2>
          <p className="marketing-cta__text">
            Jump in — it&apos;s free and runs right in your browser.
          </p>
          <Link href={c.toolHref} style={{ textDecoration: "none" }}>
            <Button variant="primary" size="large">{c.toolCtaLabel}</Button>
          </Link>
        </section>
      </Container>
    </main>
  );
}
