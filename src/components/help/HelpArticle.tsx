"use client";

/**
 * Wrapper for a single help article. Renders breadcrumbs, the article body
 * (passed as children), and a "still need help?" footer pointing to the
 * contact page.
 */

import type { ReactNode } from "react";
import { Breadcrumb, Card } from "@empac/cascadeds";
import { findCategory, findArticle } from "@/lib/help/manifest";

export interface HelpArticleProps {
  /** Slug used to look up category + title for breadcrumbs (e.g. "/help/pro/overview"). */
  href: string;
  /** Override breadcrumb leaf for pages not in the article manifest (e.g. /help/contact). */
  fallbackLabel?: string;
  children: ReactNode;
}

export function HelpArticle({ href, fallbackLabel, children }: HelpArticleProps) {
  const article = findArticle(href);
  const category = article ? findCategory(article.category) : undefined;

  const leafLabel = article?.title ?? fallbackLabel;

  const breadcrumbItems = [
    { label: "Help", href: "/help" },
    ...(category ? [{ label: category.label, href: "/help" }] : []),
    ...(leafLabel ? [{ label: leafLabel }] : []),
  ];

  return (
    <article className="help-article">
      <Breadcrumb items={breadcrumbItems} separator="chevron" />
      <div className="help-article__body" style={{ marginTop: "var(--spacing-16)" }}>
        {children}
      </div>
      <Card variant="outlined" padding="medium" className="help-article__footer">
        <p style={{ margin: 0, fontWeight: "var(--font-weight-semibold)", fontSize: "var(--font-size-14)" }}>
          Was this helpful?
        </p>
        <p style={{ margin: "var(--spacing-6) 0 var(--spacing-12)", color: "var(--text-secondary)", fontSize: "var(--font-size-14)" }}>
          If something is missing or unclear, let us know. We respond within 1–2 business days.
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
    </article>
  );
}
