"use client";

/**
 * Sidebar nav for `/help/*` article pages. Lists every category and its
 * articles, highlighting the currently-viewed article.
 *
 * On mobile, collapses into a `<details>` element so it doesn't push the
 * article body off the top of the page.
 */

import { usePathname } from "next/navigation";
import { HELP_CATEGORIES, articlesInCategory } from "@/lib/help/manifest";

export function HelpSidebar() {
  const pathname = usePathname();

  const list = (
    <nav aria-label="Help center navigation" style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-20)" }}>
      <a
        href="/help"
        style={{
          fontSize: "var(--font-size-12)",
          fontWeight: "var(--font-weight-semibold)",
          color: pathname === "/help" ? "var(--primary-600)" : "var(--text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          textDecoration: "none",
        }}
      >
        Help Center Home
      </a>
      {HELP_CATEGORIES.map((cat) => {
        const articles = articlesInCategory(cat.id);
        return (
          <div key={cat.id}>
            <p
              style={{
                fontSize: "var(--font-size-12)",
                fontWeight: "var(--font-weight-bold)",
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                margin: "0 0 var(--spacing-8)",
              }}
            >
              {cat.label}
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "var(--spacing-4)" }}>
              {articles.map((a) => {
                const isActive = pathname === a.href;
                return (
                  <li key={a.href}>
                    <a
                      href={a.href}
                      aria-current={isActive ? "page" : undefined}
                      style={{
                        display: "block",
                        padding: "var(--spacing-6) var(--spacing-8)",
                        borderRadius: "var(--radius-6)",
                        fontSize: "var(--font-size-14)",
                        color: isActive ? "var(--primary-600)" : "var(--text-secondary)",
                        background: isActive ? "var(--primary-50)" : "transparent",
                        fontWeight: isActive ? "var(--font-weight-semibold)" : "var(--font-weight-regular)",
                        textDecoration: "none",
                        lineHeight: "var(--line-height-snug)",
                      }}
                    >
                      {a.title}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      <div>
        <a
          href="/help/contact"
          style={{
            display: "block",
            padding: "var(--spacing-8) var(--spacing-12)",
            borderRadius: "var(--radius-6)",
            border: "1px solid var(--border-subtle)",
            fontSize: "var(--font-size-14)",
            fontWeight: "var(--font-weight-semibold)",
            color: pathname === "/help/contact" ? "var(--primary-600)" : "var(--text-primary)",
            textDecoration: "none",
            textAlign: "center",
          }}
        >
          Contact Support
        </a>
      </div>
    </nav>
  );

  return (
    <>
      {/* Mobile: collapsible */}
      <details
        className="help-sidebar-mobile"
        style={{
          marginBottom: "var(--spacing-20)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-8)",
          padding: "var(--spacing-12)",
        }}
      >
        <summary style={{ cursor: "pointer", fontSize: "var(--font-size-14)", fontWeight: "var(--font-weight-semibold)" }}>
          Browse all articles
        </summary>
        <div style={{ marginTop: "var(--spacing-16)" }}>{list}</div>
      </details>
      {/* Desktop: persistent */}
      <aside className="help-sidebar-desktop" aria-label="Help center sidebar">
        {list}
      </aside>
    </>
  );
}
