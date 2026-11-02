"use client";

/**
 * Wrapper for a single help article. Renders breadcrumbs, the article body
 * (passed as children), and a "still need help?" footer pointing to the
 * contact page.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { Breadcrumb, Button, Card } from "@empac/cascadeds";
import { findCategory, findArticle } from "@/lib/help/manifest";

export interface HelpArticleProps {
  /** Slug used to look up category + title for breadcrumbs (e.g. "/help/pro/overview"). */
  href: string;
  /** Override breadcrumb leaf for pages not in the article manifest (e.g. /help/contact). */
  fallbackLabel?: string;
  /** "ja" for the GS Ranked player pages in Japanese: the page's language and its footer. */
  lang?: "ja";
  children: ReactNode;
}

export function HelpArticle({ href, fallbackLabel, lang, children }: HelpArticleProps) {
  const article = findArticle(href);
  const category = article ? findCategory(article.category) : undefined;

  const leafLabel = article?.title ?? fallbackLabel;

  const breadcrumbItems = [
    { label: lang === "ja" ? "ヘルプ" : "Help", href: "/help" },
    ...(category ? [{ label: category.label, href: category.id === "ranked" ? "/help/ranked" : "/help" }] : []),
    ...(leafLabel ? [{ label: leafLabel }] : []),
  ];

  return (
    <article className="help-article" lang={lang}>
      <Breadcrumb items={breadcrumbItems} separator="chevron" />
      <div className="help-article__body" style={{ marginTop: "var(--spacing-16)" }}>
        {children}
      </div>
      <Card variant="outlined" padding="medium" className="help-article__footer">
        <p style={{ margin: 0, fontWeight: "var(--font-weight-semibold)", fontSize: "var(--font-size-14)" }}>
          {lang === "ja" ? "お役に立ちましたか？" : "Was this helpful?"}
        </p>
        <p style={{ margin: "var(--spacing-6) 0 var(--spacing-12)", color: "var(--text-secondary)", fontSize: "var(--font-size-14)" }}>
          {lang === "ja" ? "わからないことがあれば、ラウンジのスタッフか私たちにご連絡ください（英語でのご返信になる場合があります）。" : "If something is missing or unclear, let us know. We respond within 1 to 2 business days."}
        </p>
        <Link href="/help/contact" style={{ textDecoration: "none" }}>
          <Button variant="primary" size="small">{lang === "ja" ? "お問い合わせ" : "Contact support"}</Button>
        </Link>
      </Card>
    </article>
  );
}
