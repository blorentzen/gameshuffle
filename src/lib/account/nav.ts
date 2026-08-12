/**
 * Account navigation model — the single source of truth for how the /account
 * settings surface is split into section PAGES (Account · Streamer · Platform
 * Admin) and which tabs live under each. Shared by the sidebar, the section
 * pages, and the legacy `?tab=` redirect logic. Client-safe (no server deps).
 *
 * Each section is its own route; within a section, tabs switch via `?tab=`.
 */

export interface AccountNavItem {
  /** Tab id (switches via `?tab=`). Omitted for a pure link-out (`href`). */
  id?: string;
  label: string;
  /** Tabler icon name (kebab-case). */
  iconName: string;
  /** When set, the item is a link-out to this absolute path rather than a
   *  `?tab=` within the section. */
  href?: string;
}

export interface AccountNavSection {
  label: string;
  /** Route for this section. */
  route: string;
  /** Tab shown when the section is opened with no `?tab=`. */
  defaultTab: string;
  /** Tabler icon (kebab-case) for the section's collapsed link-out. */
  iconName: string;
  /** Only rendered for staff/admin. */
  staffOnly?: boolean;
  items: AccountNavItem[];
}

export const ACCOUNT_SECTIONS: AccountNavSection[] = [
  {
    label: "Account",
    route: "/account",
    defaultTab: "profile",
    iconName: "user",
    items: [
      { id: "profile", label: "Profile", iconName: "user" },
      { id: "theme", label: "Brand & Theme", iconName: "palette" },
      { id: "plans", label: "Plans", iconName: "credit-card" },
      { id: "security", label: "Security", iconName: "lock" },
    ],
  },
  {
    label: "My Stuff",
    route: "/account/stuff",
    defaultTab: "setups",
    iconName: "box",
    items: [
      { id: "setups", label: "Setups & Games", iconName: "folder" },
      { id: "tournaments", label: "Tournaments", iconName: "award" },
      { id: "my-cards", label: "My Cards", iconName: "stack-2" },
    ],
  },
  {
    label: "Streamer",
    route: "/account/streamer",
    defaultTab: "integrations",
    iconName: "video",
    items: [
      { id: "integrations", label: "Integrations", iconName: "link" },
      { id: "mods", label: "Mods", iconName: "shield" },
      { id: "game-modules", label: "Game Modules", iconName: "layout-grid" },
      { id: "wheels", label: "Wheels", iconName: "rotate" },
      { id: "stream-tools", label: "Stream Tools", iconName: "sparkles" },
      { id: "overlay-layout", label: "Overlay Layout", iconName: "layout-dashboard" },
      { id: "chat-commands", label: "Chat Commands", iconName: "message-circle" },
      { id: "community", label: "Community", iconName: "sparkles" },
      { id: "engagement", label: "Engagement", iconName: "trending-up" },
      { id: "anthems", label: "Walk-Up", iconName: "music" },
    ],
  },
  {
    label: "Platform Admin",
    route: "/account/platform",
    defaultTab: "platform-health",
    iconName: "server",
    staffOnly: true,
    items: [
      { id: "platform-health", label: "Health", iconName: "activity" },
      { id: "platform-events", label: "Events", iconName: "sparkles" },
      { id: "platform-variables", label: "Variables", iconName: "code" },
      { id: "platform-default-commands", label: "Commands", iconName: "message-circle" },
      { id: "platform-compliance", label: "Compliance", iconName: "shield" },
      { id: "platform-engagement", label: "Engagement", iconName: "trending-up" },
      { id: "platform-economy", label: "Economy", iconName: "currency-dollar" },
      { id: "platform-snapshot", label: "Snapshot", iconName: "chart-bar" },
      { id: "platform-staff", label: "Staff", iconName: "users" },
      { id: "platform-moderation", label: "Moderation", iconName: "flag" },
      { id: "platform-shop", label: "Shop", iconName: "shopping-cart" },
    ],
  },
];

/** Legacy `?tab=` aliases — external return URLs (Stripe / Twitch OAuth) and
 *  tabs that have since been renamed/split (the old combined "app" My Stuff
 *  tab → Setups & Games). */
export const ACCOUNT_TAB_ALIAS: Record<string, string> = {
  "twitch-hub": "integrations",
  app: "setups",
};

/** The section a given tab id belongs to (after alias resolution). */
export function sectionForTab(tabId: string): AccountNavSection | undefined {
  const id = ACCOUNT_TAB_ALIAS[tabId] ?? tabId;
  return ACCOUNT_SECTIONS.find((s) => s.items.some((i) => i.id === id));
}

/** Full href (route + ?tab) for a tab id. */
export function hrefForTab(tabId: string): string {
  const id = ACCOUNT_TAB_ALIAS[tabId] ?? tabId;
  const section = sectionForTab(id);
  if (!section) return "/account";
  return `${section.route}?tab=${id}`;
}
