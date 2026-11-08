"use client";

/**
 * The list beside the open page (Settings, journeys picks 2026-11-06, 8A; admin wears it too, picks 2026-11-08): a
 * title, a search box, groups with an icon tile and a line per row. On a laptop it stays beside the open page; on a
 * phone it's the index page and each row opens on its own. Callers pass the rows with their addresses and which one
 * is open.
 *
 * Search keeps the groups. A row with searchable tabs (admin's views) answers with the tabs that match, so "orders"
 * opens Shop ▸ Orders; a row whose own name matches still shows itself, so "shop" finds Shop.
 */

import { useState } from "react";
import Link from "next/link";
import { Input } from "@empac/cascadeds";
import { IconChevronRight, IconSearch, type Icon } from "@tabler/icons-react";
import { IconTile, type TileTone } from "@/components/ui/IconTile";

export interface ListTab { id: string; label: string; sub: string; keywords: string; href: string }

export interface ListRow {
  id: string;
  label: string;
  sub: string;
  icon: Icon;
  tone: TileTone;
  keywords: string;
  href: string;
  on?: boolean;
  tabs?: ListTab[];
}

export interface ListGroup { label: string; rows: ListRow[] }

const has = (text: string, words: string[]) => {
  const t = text.toLowerCase();
  return words.every((w) => t.includes(w));
};

/** What a group shows for these search words. */
function matches(rows: ListRow[], words: string[]): ListRow[] {
  if (!words.length) return rows;
  return rows.flatMap((r) => {
    if (has(r.label, words)) return [r];
    const tabs = (r.tabs ?? []).filter((t) => has(`${t.label} ${t.sub} ${t.keywords} ${r.label}`, words));
    if (tabs.length) return tabs.map((t) => ({ ...r, id: `${r.id}:${t.id}`, label: t.label, sub: `${r.label} · ${t.sub}`, href: t.href, on: false }));
    return has(`${r.label} ${r.sub} ${r.keywords}`, words) ? [r] : [];
  });
}

export function ListNav({ title, label, searchLabel, groups, index }: {
  title: string;
  /** The nav's name for screen readers. */
  label: string;
  searchLabel: string;
  groups: ListGroup[];
  /** The list is the page (its index): the title is the h1. Elsewhere the open page has it. */
  index: boolean;
}) {
  const [q, setQ] = useState("");
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = groups.map((g) => ({ ...g, rows: matches(g.rows, words) })).filter((g) => g.rows.length);

  return (
    <nav className="settings-nav" aria-label={label}>
      {index ? <h1 className="settings-nav__title">{title}</h1> : <p className="settings-nav__title">{title}</p>}
      <Input
        type="search" aria-label={searchLabel} placeholder={searchLabel} iconBefore={IconSearch} fullWidth
        value={q} onChange={(e) => setQ(e.target.value)} className="settings-nav__search"
      />
      {shown.length === 0 && <p className="settings-nav__none">Nothing called that. Try another word.</p>}
      {shown.map((g) => (
        <div key={g.label} className="settings-nav__group">
          <p className="settings-nav__label" aria-hidden="true">{g.label}</p>
          <ul aria-label={g.label}>
            {g.rows.map((r) => (
              <li key={r.id}>
                <Link href={r.href} className={`settings-nav__item${r.on ? " is-on" : ""}`} aria-current={r.on ? "page" : undefined}>
                  <IconTile icon={r.icon} tone={r.tone} />
                  <span className="settings-nav__text"><b>{r.label}</b><small>{r.sub}</small></span>
                  <IconChevronRight size={16} aria-hidden="true" className="settings-nav__go" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
