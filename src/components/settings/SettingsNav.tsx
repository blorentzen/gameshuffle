"use client";

/**
 * The Settings list (journeys picks 2026-11-06, 8A): the groups with an icon tile per item and a search box that
 * narrows them by name, line or the words people use ("password", "tickets"). On a laptop it stays beside the open
 * page; on a phone it's the /settings page and each item opens on its own.
 */

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Input } from "@empac/cascadeds";
import { IconChevronRight, IconSearch } from "@tabler/icons-react";
import { IconTile } from "@/components/ui/IconTile";
import { SETTINGS_GROUPS } from "@/lib/settings/items";

export function SettingsNav() {
  const pathname = usePathname() ?? "/settings";
  const [q, setQ] = useState("");
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const current = pathname === "/settings" ? "account" : pathname.split("/")[2] ?? "";
  const groups = SETTINGS_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !words.length || words.every((w) => `${i.label} ${i.sub} ${i.keywords}`.toLowerCase().includes(w))),
  })).filter((g) => g.items.length);

  return (
    <nav className="settings-nav" aria-label="Settings">
      {/* The list is the page on /settings (a phone shows only it); elsewhere the open page has the h1. */}
      {pathname === "/settings" ? <h1 className="settings-nav__title">Settings</h1> : <p className="settings-nav__title">Settings</p>}
      <Input
        type="search" aria-label="Search settings" placeholder="Search settings" iconBefore={IconSearch} fullWidth
        value={q} onChange={(e) => setQ(e.target.value)} className="settings-nav__search"
      />
      {groups.length === 0 && <p className="settings-nav__none">Nothing called that. Try another word.</p>}
      {groups.map((g) => (
        <div key={g.label} className="settings-nav__group">
          <p className="settings-nav__label" aria-hidden="true">{g.label}</p>
          <ul aria-label={g.label}>
            {g.items.map((i) => {
              // A tool or game item opens its own page (/account/streaming…): it's lit while you're on it.
              const on = i.href ? pathname.startsWith(i.href) : i.id === current;
              return (
                <li key={i.id}>
                  <Link href={i.href ?? `/settings/${i.id}`} className={`settings-nav__item${on ? " is-on" : ""}`} aria-current={on ? "page" : undefined}>
                    <IconTile icon={i.icon} tone={i.tone} />
                    <span className="settings-nav__text"><b>{i.label}</b><small>{i.sub}</small></span>
                    <IconChevronRight size={16} aria-hidden="true" className="settings-nav__go" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
