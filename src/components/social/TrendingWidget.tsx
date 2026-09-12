/** "Trending" topics sidebar widget — most-used hashtags recently. Links to /t/[tag]. */

import Link from "next/link";
import { Card } from "@empac/cascadeds";
import type { TrendingTag } from "@/lib/social/feed";

export function TrendingWidget({ tags }: { tags: TrendingTag[] }) {
  if (tags.length === 0) return null;
  return (
    <Card padding="large">
      <h2 style={{ fontSize: "var(--font-size-16)", fontWeight: 700, margin: "0 0 var(--spacing-12)" }}>Trending</h2>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--spacing-8)" }}>
        {tags.map((t) => (
          <li key={t.tag}>
            <Link href={`/t/${t.tag}`} style={{ textDecoration: "none", display: "flex", justifyContent: "space-between", gap: "var(--spacing-8)" }}>
              <span style={{ fontWeight: 600, color: "var(--bg-primary, var(--primary-600))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>#{t.tag}</span>
              <span style={{ fontSize: "var(--font-size-14)", color: "var(--text-tertiary)", flex: "0 0 auto" }}>{t.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
