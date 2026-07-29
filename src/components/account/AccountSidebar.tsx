"use client";

/**
 * AccountSidebar — sticky left-rail nav shared across the /account section
 * PAGES (Account · Streamer · Platform Admin). Lives in `src/app/account/
 * layout.tsx` so it persists across section navigations.
 *
 * Only the CURRENT section is expanded (its tabs listed); the other sections
 * collapse to single link-outs that jump to that section (landing on its
 * default tab). So Account shows the account tabs + "Streamer"/"Platform
 * Admin" link-outs; Streamer shows the streamer tabs + "Account"/"Platform
 * Admin" link-outs; etc.
 *
 * Each item navigates to its section's route + `?tab=` (see
 * `src/lib/account/nav.ts`). The active item is derived from the current
 * pathname + `?tab` — no local "active tab" state. The Platform Admin section
 * only renders for staff/admin (driven by the `role` the server layout
 * resolves; never expose admin surfaces to non-staff sessions).
 *
 * Adding a tab: add it to the right section in `src/lib/account/nav.ts`, then
 * add its `?tab=` render block in that section's page.
 *
 * Sticky / responsive (off-canvas drawer) styling lives in `.account-sidebar`
 * / `.account-layout` in account.css.
 */

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon, Menu } from "@empac/cascadeds";
import { isStaffRole } from "@/lib/subscription";
import { ACCOUNT_SECTIONS } from "@/lib/account/nav";

export function AccountSidebar({ role }: { role: string | null }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const sections = ACCOUNT_SECTIONS.filter(
    (s) => !s.staffOnly || isStaffRole(role),
  );

  // Which section are we on (by route), and which tab is active within it.
  const current =
    sections.find((s) => s.route === pathname) ?? sections[0];
  const activeTab = searchParams.get("tab") ?? current.defaultTab;

  const activeLabel =
    current.items.find((i) => i.id === activeTab)?.label ?? current.label;

  const go = (href: string) => {
    router.push(href);
    setOpen(false); // close the drawer after navigating (mobile)
  };

  // The current section, fully expanded (its tabs). Items with an `href` are
  // link-outs (e.g. My Cards → the TCG Hub) rather than in-section tabs.
  const currentSection = {
    label: current.label,
    items: current.items.map((item) => ({
      label: item.label,
      icon: <Icon name={item.iconName} size="20" />,
      active: !!item.id && activeTab === item.id,
      onClick: () =>
        go(item.href ?? `${current.route}?tab=${item.id}`),
    })),
  };

  // The other sections, collapsed to single link-outs (jump to their default
  // tab). Skipped entirely if there are none (e.g. a non-staff session with
  // only Account + Streamer, sitting on one of them).
  const otherSections = sections.filter((s) => s.route !== current.route);
  const switcherSection = {
    label: "Switch section",
    items: otherSections.map((section) => ({
      label: section.label,
      icon: <Icon name={section.iconName} size="20" />,
      active: false,
      onClick: () => go(`${section.route}?tab=${section.defaultTab}`),
    })),
  };

  const menuSections = otherSections.length
    ? [currentSection, switcherSection]
    : [currentSection];

  return (
    <>
      {/* Mobile-only trigger — shows the current tab, opens the drawer. */}
      <button
        type="button"
        className="account-sidebar__toggle"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="account-sidebar-nav"
      >
        <Icon name="menu-2" size="20" />
        <span>{activeLabel}</span>
      </button>

      <div
        className={`account-sidebar__backdrop${open ? " is-open" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <aside
        id="account-sidebar-nav"
        className={`account-sidebar${open ? " is-open" : ""}`}
        aria-label="Account settings"
      >
        <Menu sections={menuSections} />
      </aside>
    </>
  );
}
