"use client";

/**
 * Platform admin's list (admin like Settings, picks 2026-11-08, all as recommended): Settings' list with admin's five
 * groups, then a way back to Settings. Search also finds the screens inside each view (`src/lib/admin/items.ts`).
 */

import { usePathname } from "next/navigation";
import { ListNav, type ListGroup } from "@/components/settings/ListNav";
import { ADMIN_GROUPS, ADMIN_SETTINGS_ROW, adminHref } from "@/lib/admin/items";

export function AdminNav() {
  const pathname = usePathname() ?? "/admin";
  const current = pathname === "/admin" ? "overview" : pathname.split("/")[2] ?? "";
  const groups: ListGroup[] = ADMIN_GROUPS.map((g) => ({
    label: g.label,
    rows: g.items.map((i) => ({
      id: i.id, label: i.label, sub: i.sub, icon: i.icon, tone: i.tone, keywords: i.keywords,
      href: adminHref(i),
      on: i.id === current,
      tabs: i.tabs?.map((t) => ({ id: t.id, label: t.label, sub: t.sub, keywords: t.keywords, href: adminHref(i, t) })),
    })),
  }));
  groups.push({ label: "You", rows: [{ ...ADMIN_SETTINGS_ROW, href: "/settings" }] });
  return <ListNav title="Admin" label="Admin" searchLabel="Search admin" groups={groups} index={pathname === "/admin"} />;
}
