import type { Metadata } from "next";
import { Card } from "@empac/cascadeds";
import { HelpArticle } from "@/components/help/HelpArticle";

export const metadata: Metadata = {
  title: "Contact GameShuffle",
  description: "Reach GameShuffle support — general questions, billing, privacy, security, and legal.",
  openGraph: {
    title: "Contact GameShuffle | Help Center",
    description: "Reach GameShuffle support — general questions, billing, privacy, security, and legal.",
    url: "https://gameshuffle.co/help/contact",
  },
  alternates: {
    canonical: "https://gameshuffle.co/help/contact",
  },
  robots: {
    index: true,
    follow: true,
  },
};

const ROUTES: Array<{ heading: string; email: string; topics: string[] }> = [
  {
    heading: "General questions or technical issues",
    email: "support@gameshuffle.co",
    topics: ["Account or login issues", "Integration problems (Twitch, Discord)", "Feature questions", "Bug reports", "General feedback"],
  },
  {
    heading: "Billing and subscriptions",
    email: "billing@gameshuffle.co",
    topics: ["Refund requests", "Payment failures", "Invoice questions", "Subscription changes"],
  },
  {
    heading: "Privacy and data requests",
    email: "privacy@gameshuffle.co",
    topics: ["Data access requests", "Data correction requests", "Account deletion requests", "Privacy policy questions"],
  },
  {
    heading: "Security disclosures",
    email: "security@gameshuffle.co",
    topics: ["Vulnerability reports — we appreciate responsible disclosure and respond promptly"],
  },
  {
    heading: "Legal correspondence",
    email: "legal@gameshuffle.co",
    topics: ["Terms of service questions", "DMCA copyright notices", "Other legal notices"],
  },
];

export default function ContactPage() {
  return (
    <HelpArticle href="/help/contact" fallbackLabel="Contact">
      <h1>Contact GameShuffle</h1>
      <p>
        Can&apos;t find what you need in our help center? Reach out and we&apos;ll help. We respond within 1–2 business days.
      </p>

      <h2>How to reach us</h2>
      <div style={{ display: "grid", gap: "var(--spacing-16)", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        {ROUTES.map((route) => (
          <Card key={route.email} variant="outlined" padding="medium">
            <h3 style={{ margin: 0, fontSize: "var(--font-size-16)" }}>{route.heading}</h3>
            <p style={{ margin: "var(--spacing-8) 0", fontSize: "var(--font-size-14)" }}>
              <a href={`mailto:${route.email}`} style={{ color: "var(--primary-600)", fontWeight: "var(--font-weight-semibold)" }}>
                {route.email}
              </a>
            </p>
            <ul style={{ margin: 0, padding: "0 0 0 var(--spacing-20)", fontSize: "var(--font-size-12)", color: "var(--text-secondary)" }}>
              {route.topics.map((t) => (
                <li key={t} style={{ marginBottom: "var(--spacing-4)", listStyle: "disc" }}>{t}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <h2>What to include in your email</h2>
      <ul>
        <li>Your account email (if applicable)</li>
        <li>A clear description of the issue</li>
        <li>Any error messages you&apos;re seeing</li>
        <li>Steps to reproduce the problem</li>
        <li>Screenshots if relevant</li>
      </ul>

      <h2>Response time</h2>
      <p>
        We respond within 1–2 business days. Urgent security or billing issues are prioritized.
      </p>
      <p>
        If you haven&apos;t heard from us in 3 business days, your email may have been caught in a spam filter — try resending or use a different alias.
      </p>

      <h2>Mailing address</h2>
      <p>
        GameShuffle is operated by Britton Lorentzen, doing business as Empac and GameShuffle:
      </p>
      <p>
        4904 168th Ave E<br />
        Lake Tapps, WA 98391<br />
        United States
      </p>
      <p>For most issues, email is faster.</p>
    </HelpArticle>
  );
}
