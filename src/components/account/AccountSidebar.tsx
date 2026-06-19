"use client";

/**
 * AccountSidebar — sticky left-rail navigation for /account.
 *
 * Built from CDS `<Menu sections={…}>` — it already paints its own
 * surface (`--background-elevated` + border + shadow), so wrapping
 * it in a `<Card>` would double up the container chrome. The parent
 * page owns `activeTab` + URL `?tab=` sync; we just render the picker.
 *
 * Adding a new tab:
 *   1. Append an entry to the right `MenuSection.items` array below.
 *   2. Add the `activeTab === "<id>"` content block in
 *      `src/app/account/page.tsx`.
 *   3. (Optional) Update `LEGACY_TAB_ALIAS` in the page if the id
 *      used to live under a different `?tab=` value.
 *
 * Sticky / responsive layout lives in `.account-layout` /
 * `.account-sidebar` in globals.css — minimal positioning shim
 * around the CDS components.
 */

import { Icon, Menu } from "@empac/cascadeds";

interface NavItem {
  id: string;
  label: string;
  /** Tabler icon name (kebab-case). */
  iconName: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Account",
    items: [
      { id: "profile", label: "Profile", iconName: "user" },
      { id: "app", label: "My Stuff", iconName: "folder" },
      { id: "plans", label: "Plans", iconName: "credit-card" },
      { id: "security", label: "Security", iconName: "lock" },
    ],
  },
  {
    label: "Streamer",
    items: [
      { id: "integrations", label: "Integrations", iconName: "link" },
      { id: "mods", label: "Mods", iconName: "shield" },
      { id: "game-modules", label: "Game Modules", iconName: "layout-grid" },
      { id: "chat-commands", label: "Chat Commands", iconName: "message-circle" },
      { id: "community", label: "Community", iconName: "sparkles" },
      { id: "engagement", label: "Engagement", iconName: "trending-up" },
    ],
  },
];

/** Staff/admin-only nav group. Surfaces the platform management
 *  surfaces for the global event decks (chaos + random), and
 *  future social-tools defaults. Only rendered when the page passes
 *  `isStaff: true`. */
const ADMIN_GROUP: NavGroup = {
  label: "Platform Admin",
  items: [
    { id: "platform-health", label: "Health", iconName: "activity" },
    { id: "platform-events", label: "Events", iconName: "sparkles" },
    { id: "platform-variables", label: "Variables", iconName: "code" },
    {
      id: "platform-default-commands",
      label: "Commands",
      iconName: "message-circle",
    },
    {
      id: "platform-compliance",
      label: "Compliance",
      iconName: "shield",
    },
    {
      id: "platform-engagement",
      label: "Engagement",
      iconName: "trending-up",
    },
    {
      id: "platform-economy",
      label: "Economy",
      iconName: "currency-dollar",
    },
    {
      id: "platform-snapshot",
      label: "Snapshot",
      iconName: "chart-bar",
    },
    {
      id: "platform-staff",
      label: "Staff",
      iconName: "users",
    },
  ],
};

interface Props {
  activeTab: string;
  onChange: (id: string) => void;
  /** When true, renders the "Platform Admin" group below the user
   *  sections. Driven by the page's role check — never expose admin
   *  surfaces to non-staff sessions. */
  isStaff?: boolean;
}

export function AccountSidebar({ activeTab, onChange, isStaff = false }: Props) {
  const groups = isStaff ? [...NAV_GROUPS, ADMIN_GROUP] : NAV_GROUPS;
  const sections = groups.map((group) => ({
    label: group.label,
    items: group.items.map((item) => ({
      label: item.label,
      icon: <Icon name={item.iconName} size="20" />,
      active: activeTab === item.id,
      onClick: () => onChange(item.id),
    })),
  }));

  return (
    <aside className="account-sidebar" aria-label="Account settings">
      <Menu sections={sections} />
    </aside>
  );
}
