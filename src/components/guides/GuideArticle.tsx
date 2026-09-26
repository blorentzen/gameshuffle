/**
 * Shared chrome for a guide: breadcrumb, title block, the body, and the link
 * back to the cluster's pillar page.
 *
 * The pillar link is rendered here rather than left to each author, because
 * "every guide links to its pillar" is the part of the plan that quietly stops
 * happening once there are twelve of them.
 */

import Link from "next/link";
import { Breadcrumb, Container } from "@empac/cascadeds";
import { clusterFor, findGuide, type GuideMeta } from "@/lib/guides/manifest";
import { guidesInClusterAsync } from "@/lib/guides/store";

/**
 * Chrome for a guide from either source.
 *
 * File-backed guides pass only a slug and are looked up in the manifest.
 * Database-backed ones pass the row, because it is not in the manifest. Async
 * because siblings now come from the store, which merges both.
 */
export async function GuideArticle({
  slug,
  guide: passed,
  children,
}: {
  slug: string;
  guide?: GuideMeta;
  children: React.ReactNode;
}) {
  const guide = passed ?? findGuide(slug)!;
  const cluster = clusterFor(guide.cluster);
  // Siblings give the reader somewhere to go and spread authority across the
  // cluster instead of pooling it on whichever guide ranks first.
  const siblings = (await guidesInClusterAsync(guide.cluster))
    .filter((g) => g.slug !== slug)
    .slice(0, 3);

  return (
    <main className="guide-page">
      <Container>
        <div className="guide-page__crumbs">
          <Breadcrumb
            items={[
              { label: "Home", href: "/" },
              { label: "Guides", href: "/guides" },
              { label: guide.title },
            ]}
          />
        </div>

        <article className="guide">
          <header className="guide__head">
            <p className="marketing-eyebrow">{cluster.label}</p>
            <h1 className="guide__title">{guide.title}</h1>
            <p className="guide__standfirst">{guide.description}</p>
            <p className="guide__meta">{guide.minutes} min read</p>
          </header>

          <div className="guide__body">{children}</div>

          <aside className="guide__pillar">
            <p className="guide__pillar-kicker">Ready to run one?</p>
            <p className="guide__pillar-body">
              Everything in this guide works on GameShuffle, free with an account.
            </p>
            <Link href={cluster.pillar} className="guide__pillar-link">
              {cluster.pillarLabel}
            </Link>
          </aside>

          {siblings.length > 0 && (
            <nav className="guide__more" aria-label="More in this series">
              <h2>More on {cluster.label.toLowerCase()}</h2>
              <ul>
                {siblings.map((s) => (
                  <li key={s.slug}>
                    <Link href={`/guides/${s.slug}`}>{s.title}</Link>
                    <span>{s.description}</span>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </article>
      </Container>
    </main>
  );
}
