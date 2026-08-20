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

// CDS has no Discord glyph, so brand-discord renders the logo inline with
// fill:currentColor, matching the other Tabler icons + adapting to theme.
const DISCORD_PATH =
  "M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z";

function TabIcon({ name }: { name: string }) {
  if (name === "brand-discord") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d={DISCORD_PATH} />
      </svg>
    );
  }
  return <Icon name={name} size="20" />;
}

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
      icon: <TabIcon name={item.iconName} />,
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
      icon: <TabIcon name={section.iconName} />,
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
