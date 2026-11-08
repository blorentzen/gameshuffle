"use client";

/**
 * The Settings list (journeys picks 2026-11-06, 8A): the groups with an icon tile per item and a search box that
 * narrows them by name, line or the words people use ("password", "tickets"). On a laptop it stays beside the open
 * page; on a phone it's the /settings page and each item opens on its own. Staff get an Admin row at the end (admin
 * like Settings, picks 2026-11-08).
 */

import { usePathname } from "next/navigation";
import { IconLayoutDashboard } from "@tabler/icons-react";
import { ListNav, type ListGroup } from "@/components/settings/ListNav";
import { SETTINGS_GROUPS } from "@/lib/settings/items";

export function SettingsNav({ staff = false }: { staff?: boolean }) {
  const pathname = usePathname() ?? "/settings";
  const current = pathname === "/settings" ? "account" : pathname.split("/")[2] ?? "";
  const groups: ListGroup[] = SETTINGS_GROUPS.map((g) => ({
    label: g.label,
    rows: g.items.map((i) => ({
      id: i.id, label: i.label, sub: i.sub, icon: i.icon, tone: i.tone, keywords: i.keywords,
      href: i.href ?? `/settings/${i.id}`,
      // A tool or game item opens its own page (/account/streaming…): it's lit while you're on it.
      on: i.href ? pathname.startsWith(i.href) : i.id === current,
    })),
  }));
  if (staff) {
    groups.push({ label: "Staff", rows: [{ id: "admin", label: "Admin", sub: "Shop, content, people, money", icon: IconLayoutDashboard, tone: "red", keywords: "platform admin staff switches", href: "/admin" }] });
  }
  return <ListNav title="Settings" label="Settings" searchLabel="Search settings" groups={groups} index={pathname === "/settings"} />;
}
