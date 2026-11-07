"use client";

/**
 * AccountSidebar — sticky left-rail nav shared across the /account section
 * pages. Lives in `src/app/account/layout.tsx` so it persists across section
 * navigations.
 *
 * Grouped You, your interests, More (menus and account picks 2026-11-05,
 * https://claude.ai/artifact/FVgHcSgixdcLaGZisgsd97, 3A):
 *   - You: the account's own pages (Your home, Profile, Settings, Plans, Purchases…), always listed.
 *   - The section you're on, its views listed (when it isn't You).
 *   - Your interests: the other sections for the account's interests, one link each.
 *   - More: every other section, one link each, so nothing is out of reach.
 *   - Platform Admin (staff only): its grouped views while you're on it, else one link.
 *
 * Each item navigates to its section's route + `?tab=` (see `src/lib/account/nav.ts`). The active item comes from the
 * pathname + `?tab`. The Platform Admin section only renders for staff/admin (the `role` the server layout resolves).
 *
 * Adding a tab: add it to the right section in `src/lib/account/nav.ts`, then add its screen to that section's page.
 *
 * Sticky / responsive (off-canvas drawer) styling lives in `.account-sidebar` / `.account-layout` in account.css.
 */

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon, Menu } from "@empac/cascadeds";
import { IconCards, IconPokeball } from "@tabler/icons-react";
import { isStaffRole } from "@/lib/subscription";
import { ACCOUNT_SECTIONS, ACCOUNT_TAB_ALIAS, itemTabIds } from "@/lib/account/nav";
import type { Interest } from "@/lib/interests/rules";

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
  // Not in the CDS icon set yet (raise upstream): Tabler's, same size and stroke.
  if (name === "cards") return <IconCards size={20} stroke={2} aria-hidden="true" />;
  if (name === "pokeball") return <IconPokeball size={20} stroke={2} aria-hidden="true" />;
  return <Icon name={name} size="20" />;
}

/** Pages below a section's route that belong to one of its tabs (lit in the sidebar while you're on them). */
const NESTED_TABS: { prefix: string; tab: string }[] = [
  { prefix: "/account/discord/logos/", tab: "discord" },
];

export function AccountSidebar({ role, isPro = false, interests = [] }: { role: string | null; isPro?: boolean; interests?: Interest[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Streaming shows free accounts only what they can use (proOnly/freeOnly).
  const sections = ACCOUNT_SECTIONS.filter(
    (s) => !s.staffOnly || isStaffRole(role),
  ).map((s) => ({ ...s, items: s.items.filter((i) => (isPro ? !i.freeOnly : !i.proOnly)) }));
  type Section = (typeof sections)[number];
  const landingTab = (s: Section) =>
    s.items.some((i) => itemTabIds(i).includes(s.defaultTab)) ? s.defaultTab : (s.items[0]?.id ?? s.defaultTab);

  // Which section are we on (by route), and which tab is active within it.
  // A page under a section's route (a server's team logos) belongs to that section, longest route first.
  const current =
    sections.find((s) => s.route === pathname)
    ?? [...sections].sort((a, b) => b.route.length - a.route.length).find((s) => pathname.startsWith(`${s.route}/`))
    ?? sections[0];
  const nested = NESTED_TABS.find((n) => pathname.startsWith(n.prefix));
  const rawTab = searchParams.get("tab") ?? nested?.tab ?? current.defaultTab;
  const activeTab = ACCOUNT_TAB_ALIAS[rawTab] ?? rawTab;

  // A view is active for any of its tabs.
  const activeItem = current.items.find((i) => itemTabIds(i).includes(activeTab))
    ?? current.items.find((i) => itemTabIds(i).includes(landingTab(current)));
  const activeSub = activeItem?.tabs?.find((t) => t.id === activeTab);
  const activeLabel = activeItem
    ? activeItem.tabs && activeItem.tabs.length > 1 && activeSub ? `${activeItem.label} · ${activeSub.label}` : activeItem.label
    : current.label;

  const go = (href: string) => {
    router.push(href);
    setOpen(false); // close the drawer after navigating (mobile)
  };

  // A section's views as menu items. Items with an `href` are link-outs rather than in-section tabs.
  const viewsOf = (section: Section) => section.items.map((item) => ({
    label: item.label,
    icon: <TabIcon name={item.iconName} />,
    active: section === current && item === activeItem,
    onClick: () => go(item.href ?? `${section.route}?tab=${item.id}`),
  }));
  // A whole section as one link (its landing view); lit when it's the one-view section you're on.
  const linkTo = (section: Section) => ({
    label: section.label,
    icon: <TabIcon name={section.iconName} />,
    active: section === current,
    onClick: () => go(`${section.route}?tab=${landingTab(section)}`),
  });

  const you = sections.find((s) => s.kind === "you");
  const staff = sections.find((s) => s.kind === "staff");
  const interestSections = sections.filter((s) => s.kind === "interest");
  const mine = interestSections.filter((s) => s.interests?.some((i) => interests.includes(i)));
  const others = interestSections.filter((s) => !mine.includes(s));

  const menuSections: { label: string; items: ReturnType<typeof linkTo>[] }[] = [];
  if (you) menuSections.push({ label: you.label, items: viewsOf(you) });
  // The section you're on lists its views, when it has more than one (a one-view section just lights up below).
  const expanded = current.kind === "interest" && current.items.length > 1;
  if (expanded) menuSections.push({ label: current.label, items: viewsOf(current) });
  if (current.kind === "staff") {
    // Platform Admin: one labelled group per `group`, in the order they first appear.
    const groups = [...new Set(current.items.map((i) => i.group).filter((g): g is string => !!g))];
    const views = viewsOf(current);
    for (const g of groups) menuSections.push({ label: g, items: views.filter((_, i) => current.items[i].group === g) });
  }
  const mineRest = mine.filter((s) => !(expanded && s === current));
  if (mineRest.length) menuSections.push({ label: "Your interests", items: mineRest.map(linkTo) });
  const othersRest = others.filter((s) => !(expanded && s === current));
  if (othersRest.length) menuSections.push({ label: "More", items: othersRest.map(linkTo) });
  if (staff && current !== staff) menuSections.push({ label: "Staff", items: [linkTo(staff)] });

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
