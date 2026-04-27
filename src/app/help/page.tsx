import type { Metadata } from "next";
import { Card } from "@empac/cascadeds";
import { HelpSearch } from "@/components/help/HelpSearch";
import { HELP_CATEGORIES, articlesInCategory } from "@/lib/help/manifest";

export const metadata: Metadata = {
  title: "Help Center",
  description: "Guides, troubleshooting, and contact info for GameShuffle — getting started, GameShuffle Pro, integrations, and account management.",
  openGraph: {
    title: "Help Center | GameShuffle",
    description: "Guides, troubleshooting, and contact info for GameShuffle.",
    url: "https://gameshuffle.co/help",
  },
  alternates: {
    canonical: "https://gameshuffle.co/help",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function HelpLandingPage() {
  return (
    <div className="help-landing">
      <header className="help-landing__header">
        <p
          style={{
            fontSize: "var(--font-size-12)",
            fontWeight: "var(--font-weight-bold)",
            color: "var(--primary-600)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          Help Center
        </p>
        <h1 style={{ margin: "var(--spacing-8) 0 var(--spacing-12)" }}>How can we help?</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-16)", maxWidth: 640, marginTop: 0 }}>
          Browse our guides below, search for a specific topic, or reach out directly. Most questions are answered in the articles — when they aren&apos;t, we&apos;re an email away.
        </p>
        <div style={{ marginTop: "var(--spacing-20)" }}>
          <HelpSearch autoFocus />
        </div>
      </header>

      <section
        aria-label="Help categories"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--spacing-20)", marginTop: "var(--spacing-32)" }}
      >
        {HELP_CATEGORIES.map((cat) => {
          const articles = articlesInCategory(cat.id);
          return (
            <Card key={cat.id} variant="outlined" padding="medium">
              <h2 style={{ margin: "0 0 var(--spacing-6)", fontSize: "var(--font-size-20)" }}>{cat.label}</h2>
              <p style={{ margin: "0 0 var(--spacing-12)", color: "var(--text-secondary)", fontSize: "var(--font-size-14)" }}>{cat.blurb}</p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "var(--spacing-6)" }}>
                {articles.map((a) => (
                  <li key={a.href}>
                    <a
                      href={a.href}
                      style={{
                        display: "block",
                        fontSize: "var(--font-size-14)",
                        color: "var(--primary-600)",
                        fontWeight: "var(--font-weight-semibold)",
                        textDecoration: "none",
                      }}
                    >
                      {a.title}
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </section>

      <Card variant="flat" padding="medium" className="help-landing__contact-callout">
        <h2 style={{ margin: 0, fontSize: "var(--font-size-18)" }}>Can&apos;t find what you need?</h2>
        <p style={{ margin: "var(--spacing-8) 0 var(--spacing-16)", color: "var(--text-secondary)", fontSize: "var(--font-size-14)" }}>
          Email us at <a href="mailto:support@gameshuffle.co" style={{ color: "var(--primary-600)", fontWeight: "var(--font-weight-semibold)" }}>support@gameshuffle.co</a> or visit our contact page for routing to the right team.
        </p>
        <a
          href="/help/contact"
          style={{
            display: "inline-block",
            padding: "var(--spacing-8) var(--spacing-16)",
            borderRadius: "var(--radius-6)",
            background: "var(--primary-600)",
            color: "var(--empac-white)",
            fontSize: "var(--font-size-14)",
            fontWeight: "var(--font-weight-semibold)",
            textDecoration: "none",
          }}
        >
          Contact support
        </a>
      </Card>
    </div>
  );
}
