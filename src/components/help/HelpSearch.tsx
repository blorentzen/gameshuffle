"use client";

/**
 * Client-side filter over the static help article catalog (Phase 1 search).
 * Phase 2 will swap this for a real index — until then, in-memory filter
 * over title + keywords is sufficient for ~12 articles.
 */

import { useMemo, useState } from "react";
import { Input } from "@empac/cascadeds";
import { HELP_ARTICLES, findCategory } from "@/lib/help/manifest";

export function HelpSearch({ autoFocus = false }: { autoFocus?: boolean }) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];
    return HELP_ARTICLES.filter(
      (a) =>
        a.title.toLowerCase().includes(trimmed) ||
        a.description.toLowerCase().includes(trimmed) ||
        a.keywords.some((k) => k.toLowerCase().includes(trimmed))
    );
  }, [query]);

  return (
    <div style={{ width: "100%", maxWidth: 560 }}>
      <Input
        type="search"
        placeholder="Search help articles…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus={autoFocus}
        fullWidth
        aria-label="Search help articles"
      />
      {query.trim() && (
        <div
          role="region"
          aria-live="polite"
          style={{
            marginTop: "var(--spacing-12)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-8)",
            background: "var(--background-primary)",
            padding: "var(--spacing-8)",
          }}
        >
          {results.length === 0 ? (
            <p style={{ margin: 0, padding: "var(--spacing-12)", color: "var(--text-tertiary)", fontSize: "var(--font-size-14)" }}>
              No articles match &ldquo;{query}&rdquo;. Try a different search, or{" "}
              <a href="/help/contact" style={{ color: "var(--primary-600)", fontWeight: "var(--font-weight-semibold)" }}>contact support</a>.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--spacing-2)" }}>
              {results.map((a) => {
                const category = findCategory(a.category);
                return (
                  <li key={a.href}>
                    <a
                      href={a.href}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "var(--spacing-2)",
                        padding: "var(--spacing-10) var(--spacing-12)",
                        borderRadius: "var(--radius-6)",
                        textDecoration: "none",
                        color: "var(--text-primary)",
                      }}
                    >
                      <span style={{ fontWeight: "var(--font-weight-semibold)", fontSize: "var(--font-size-14)" }}>{a.title}</span>
                      <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
                        {category?.label} · {a.description}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
