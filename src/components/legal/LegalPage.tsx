"use client";

/**
 * Shared layout for legal/policy pages (Privacy, Terms, Cookie Policy, etc).
 *
 * Pages declare their content as a `LegalSection[]` array. This component
 * handles structure: header card, table of contents (sticky on desktop,
 * collapsible on mobile), numbered section rendering, and the cross-page
 * footer strip linking the other policies.
 */

import { ReactNode, useEffect, useState } from "react";
import { Card, Container, Stack } from "@empac/cascadeds";

export interface LegalSection {
  /** Stable URL anchor (kebab-case). */
  id: string;
  /** Section heading text — number is auto-prepended. */
  title: string;
  /** Section body. Use the `<LegalSubSection>` helper for `2.1`-style sub-headings. */
  content: ReactNode;
}

export interface LegalPageProps {
  /** Eyebrow above the title — e.g. "Legal". */
  eyebrow?: string;
  /** Page title — e.g. "Privacy Policy". */
  title: string;
  /** Short blurb under the title. Optional. */
  intro?: ReactNode;
  /** Effective date — e.g. "April 24, 2026". */
  effectiveDate: string;
  /** Operator line — defaults to the GameShuffle operator string. */
  operator?: string;
  /** Sections in order. Number is auto-prepended (1., 2., 3.…). */
  sections: LegalSection[];
  /** Slug of *this* page — controls which siblings appear in the footer strip. */
  current: "privacy" | "terms" | "cookie-policy" | "accessibility";
}

const DEFAULT_OPERATOR = "Britton Lorentzen, doing business as Empac and GameShuffle";

const SIBLINGS: Record<LegalPageProps["current"], { href: string; title: string; blurb: string }> = {
  privacy: {
    href: "/privacy",
    title: "Privacy Policy",
    blurb: "What we collect, how we use it, and your rights.",
  },
  terms: {
    href: "/terms",
    title: "Terms of Service",
    blurb: "The rules for using GameShuffle.",
  },
  "cookie-policy": {
    href: "/cookie-policy",
    title: "Cookie Policy",
    blurb: "Cookies and similar technologies we use.",
  },
  accessibility: {
    href: "/accessibility",
    title: "Accessibility Statement",
    blurb: "Our WCAG 2.1 AA commitment and how to report barriers.",
  },
};

export function LegalPage({
  eyebrow = "Legal",
  title,
  intro,
  effectiveDate,
  operator = DEFAULT_OPERATOR,
  sections,
  current,
}: LegalPageProps) {
  return (
    <main className="legal-page-v2">
      <Container>
        <header className="legal-page-v2__header">
          {eyebrow && <p className="legal-page-v2__eyebrow">{eyebrow}</p>}
          <h1 className="legal-page-v2__title">{title}</h1>
          {intro && <p className="legal-page-v2__intro">{intro}</p>}
          <Card variant="flat" padding="medium" className="legal-page-v2__meta">
            <dl className="legal-page-v2__meta-list">
              <div>
                <dt>Effective Date</dt>
                <dd>{effectiveDate}</dd>
              </div>
              <div>
                <dt>Operator</dt>
                <dd>{operator}</dd>
              </div>
              <div>
                <dt>Platform</dt>
                <dd>GameShuffle (gameshuffle.co)</dd>
              </div>
            </dl>
          </Card>
        </header>

        <div className="legal-page-v2__layout">
          <aside className="legal-page-v2__toc" aria-label="Table of contents">
            <TableOfContents sections={sections} />
          </aside>

          <article className="legal-page-v2__article">
            {sections.map((section, idx) => (
              <section
                key={section.id}
                id={section.id}
                className="legal-page-v2__section"
                aria-labelledby={`${section.id}-heading`}
              >
                <h2 id={`${section.id}-heading`} className="legal-page-v2__section-heading">
                  <span className="legal-page-v2__section-number">{idx + 1}.</span>
                  <span>{section.title}</span>
                  <a href={`#${section.id}`} className="legal-page-v2__anchor" aria-label="Link to this section">#</a>
                </h2>
                <div className="legal-page-v2__section-body">{section.content}</div>
              </section>
            ))}
          </article>
        </div>

        <SiblingStrip current={current} />
      </Container>
    </main>
  );
}

function TableOfContents({ sections }: { sections: LegalSection[] }) {
  const [activeId, setActiveId] = useState<string | null>(sections[0]?.id ?? null);

  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.target.getBoundingClientRect().top - b.target.getBoundingClientRect().top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 }
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections]);

  const list = (
    <ol className="legal-page-v2__toc-list">
      {sections.map((s, idx) => (
        <li key={s.id} className={activeId === s.id ? "is-active" : ""}>
          <a href={`#${s.id}`}>
            <span className="legal-page-v2__toc-num">{idx + 1}.</span>
            <span>{s.title}</span>
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <>
      <details className="legal-page-v2__toc-mobile">
        <summary>Table of Contents</summary>
        {list}
      </details>
      <div className="legal-page-v2__toc-desktop">
        <p className="legal-page-v2__toc-label">On this page</p>
        {list}
      </div>
    </>
  );
}

function SiblingStrip({ current }: { current: LegalPageProps["current"] }) {
  const others = (Object.keys(SIBLINGS) as Array<LegalPageProps["current"]>).filter((k) => k !== current);
  return (
    <section className="legal-page-v2__siblings" aria-label="Other policies">
      <h2 className="legal-page-v2__siblings-heading">Related policies</h2>
      <Stack direction={{ desktop: "horizontal", mobile: "vertical" }} gap={16}>
        {others.map((slug) => {
          const s = SIBLINGS[slug];
          return (
            <Card key={slug} variant="outlined" padding="medium" interactive href={s.href} className="legal-page-v2__sibling-card">
              <p className="legal-page-v2__sibling-title">{s.title}</p>
              <p className="legal-page-v2__sibling-blurb">{s.blurb}</p>
              <p className="legal-page-v2__sibling-cta">Read &rarr;</p>
            </Card>
          );
        })}
      </Stack>
    </section>
  );
}

/** Renders a `2.1`-style sub-section heading + body. */
export function LegalSubSection({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="legal-page-v2__subsection">
      <h3 className="legal-page-v2__subsection-heading">
        <span className="legal-page-v2__subsection-number">{number}</span>
        <span>{title}</span>
      </h3>
      <div className="legal-page-v2__subsection-body">{children}</div>
    </div>
  );
}

/** Standard contact block — used at the bottom of every legal page. */
export function LegalContact({
  introLine,
  email = "privacy@gameshuffle.co",
  roleTitle = "Britton Lorentzen, Data Protection Officer",
  showDataRequestLink = true,
}: {
  introLine?: string;
  email?: string;
  roleTitle?: string;
  showDataRequestLink?: boolean;
}) {
  return (
    <>
      {introLine && <p>{introLine}</p>}
      <p>
        <strong>{roleTitle}</strong><br />
        Doing business as Empac and GameShuffle<br />
        4904 168th Ave E<br />
        Lake Tapps, WA 98391<br />
        United States
      </p>
      <p>
        Email: <a href={`mailto:${email}`}>{email}</a><br />
        Phone: (888) 603-6722
      </p>
      {showDataRequestLink && (
        <p>To submit a privacy-related request, use our <a href="/data-request">Data Request Form</a>.</p>
      )}
    </>
  );
}
