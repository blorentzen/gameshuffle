import type { Metadata } from "next";
import Link from "next/link";
import { Button, Card } from "@empac/cascadeds";
import { HelpSearch } from "@/components/help/HelpSearch";
import { HELP_CATEGORIES, articlesInCategory } from "@/lib/help/manifest";

export const metadata: Metadata = {
  title: "Help Center",
  description: "Guides, troubleshooting, and contact info for GameShuffle: getting started, GameShuffle Pro, integrations, and account management.",
  openGraph: {
    title: "Help Center | GameShuffle",
    description: "Guides, troubleshooting, and contact info for GameShuffle.",
    url: "https://www.gameshuffle.co/help",
  },
  alternates: {
    canonical: "https://www.gameshuffle.co/help",
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
        <p className="help-landing__eyebrow">Help Center</p>
        <h1 className="help-landing__title">How can we help?</h1>
        <p className="help-landing__lede">
          Browse the guides below, search for a specific topic, or reach out directly. Most
          questions are answered in the articles. When they aren&apos;t, we&apos;re an email away.
        </p>
        <div className="help-landing__search">
          <HelpSearch autoFocus />
        </div>
      </header>

      <section aria-label="Help categories" className="help-landing__categories">
        {HELP_CATEGORIES.map((cat) => {
          const articles = articlesInCategory(cat.id);
          return (
            <Card key={cat.id} variant="outlined" padding="medium">
              <h2 className="help-landing__cat-title">{cat.label}</h2>
              <p className="help-landing__cat-blurb">{cat.blurb}</p>
              <ul className="help-landing__links">
                {articles.map((a) => (
                  <li key={a.href}>
                    <Link href={a.href} className="help-landing__link">
                      {a.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </section>

      <Card variant="flat" padding="medium" className="help-landing__contact-callout">
        <h2 className="help-landing__contact-title">Can&apos;t find what you need?</h2>
        <p className="help-landing__contact-body">
          Email us at{" "}
          <a href="mailto:support@gameshuffle.co" className="help-landing__link" style={{ display: "inline" }}>
            support@gameshuffle.co
          </a>{" "}
          or visit our contact page for routing to the right team.
        </p>
        <Link href="/help/contact" style={{ textDecoration: "none" }}>
          <Button variant="primary" size="small">Contact support</Button>
        </Link>
      </Card>
    </div>
  );
}
