/**
 * "Upcoming" sidebar widget — tournaments you're in + game nights from your
 * communities/follows. Server component (links only, no interactivity).
 */

import Link from "next/link";
import { Card } from "@empac/cascadeds";
import type { UpcomingItem } from "@/lib/social/upcoming";

function whenLabel(iso: string | null): string {
  if (!iso) return "Open";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function UpcomingWidget({ items }: { items: UpcomingItem[] }) {
  if (items.length === 0) return null;
  return (
    <Card padding="large">
      <h2 style={{ fontSize: "var(--font-size-16)", fontWeight: 700, margin: "0 0 var(--spacing-12)" }}>Upcoming</h2>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--spacing-10)" }}>
        {items.map((it) => (
          <li key={`${it.kind}-${it.id}`}>
            <Link href={it.url} style={{ textDecoration: "none", color: "inherit", display: "flex", gap: "var(--spacing-8)" }}>
              <span aria-hidden style={{ fontSize: "1.1rem", flex: "0 0 auto" }}>{it.kind === "tournament" ? "🏆" : "🎮"}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: "var(--font-size-14)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</span>
                <span style={{ display: "block", fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
                  {whenLabel(it.whenIso)}{it.subtitle ? ` · ${it.subtitle}` : ""}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
