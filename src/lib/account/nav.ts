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
  /** Sidebar group heading this item sits under (Platform Admin). */
  group?: string;
  /** A view with tabs across its top (Platform Admin). `id` is the tab it
   *  opens on; every tab keeps its own `?tab=` address, so old links work. */
  tabs?: AccountSubTab[];
}

export interface AccountSubTab {
  id: string;
  label: string;
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
      { id: "notifications", label: "Notifications", iconName: "bell" },
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
      { id: "my-games", label: "My Games", iconName: "filter" },
      { id: "game-nights", label: "Game Nights", iconName: "calendar" },
      { id: "board-games", label: "Board Games", iconName: "layout-grid" },
      { id: "tournaments", label: "Tournaments", iconName: "award" },
      { id: "tickets", label: "My Tickets", iconName: "receipt" },
      { id: "payouts", label: "Payouts", iconName: "currency-dollar" },
      { id: "my-cards", label: "My Cards", iconName: "stack-2" },
      { id: "orders", label: "Shop Orders", iconName: "shopping-cart" },
    ],
  },
  {
    label: "Stream Setup",
    route: "/account/streamer",
    defaultTab: "integrations",
    iconName: "video",
    items: [
      { id: "integrations", label: "Integrations", iconName: "link" },
      { id: "discord-bot", label: "Discord Bot", iconName: "brand-discord" },
      { id: "mods", label: "Mods", iconName: "shield" },
      { id: "overlay-layout", label: "Overlay Layout", iconName: "layout-dashboard" },
      { id: "wheels", label: "Wheels", iconName: "rotate" },
      { id: "stream-tools", label: "Stream Tools", iconName: "sparkles" },
      // Mirror: the canonical home is Account ▸ Brand & Theme, but it also skins
      // the overlay + /live, so it renders IN PLACE here too (same components,
      // no link-out). `sectionForTab` still resolves "theme" to Account first;
      // the section pages guard against redirecting a tab their own section owns.
      { id: "theme", label: "Brand & Theme", iconName: "palette" },
    ],
  },
  {
    label: "Community & Chat",
    route: "/account/community",
    defaultTab: "chat-commands",
    iconName: "users",
    items: [
      { id: "chat-commands", label: "Chat Commands", iconName: "message-circle" },
      { id: "polls", label: "Polls", iconName: "chart-bar" },
      { id: "bingo", label: "Stream Bingo", iconName: "border-all" },
      { id: "draft", label: "Chat Draft", iconName: "list" },
      { id: "chat-brain", label: "Chat Brain", iconName: "lightbulb" },
      { id: "community", label: "Chat Modules", iconName: "sparkles" },
      { id: "game-modules", label: "Game Modules", iconName: "layout-grid" },
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
      // Ten views in five groups (2026-10-09). Each tab id is unchanged, so
      // links like ?tab=platform-shop-orders still open the right screen.
      { id: "platform-health", label: "Overview", iconName: "activity", group: "Run the site", tabs: [
        { id: "platform-health", label: "Health" },
        { id: "platform-growth", label: "Growth" },
        { id: "platform-ai", label: "AI usage" },
      ] },
      { id: "platform-switches", label: "Switches", iconName: "settings", group: "Run the site" },
      { id: "platform-shop-orders", label: "Shop", iconName: "shopping-cart", group: "Shop", tabs: [
        { id: "platform-shop-orders", label: "Orders" },
        { id: "platform-shop-products", label: "Products" },
        { id: "platform-shop", label: "Featured cards" },
      ] },
      { id: "platform-originals", label: "Originals", iconName: "sparkles", group: "Content", tabs: [
        { id: "platform-originals", label: "Overview" },
        { id: "platform-chat-brain", label: "Chat Brain" },
        { id: "platform-weekly", label: "Weekly Challenge" },
        { id: "platform-trivia", label: "Trivia" },
      ] },
      { id: "platform-guides", label: "Library", iconName: "bookmark", group: "Content", tabs: [
        { id: "platform-guides", label: "Guides" },
        { id: "platform-decks", label: "Card decks" },
        { id: "platform-games", label: "Game catalog" },
      ] },
      { id: "platform-default-commands", label: "Chat bot", iconName: "message-circle", group: "Community", tabs: [
        { id: "platform-default-commands", label: "Commands" },
        { id: "platform-variables", label: "Variables" },
        { id: "platform-events", label: "Chaos events" },
        { id: "platform-engagement", label: "Engagement" },
      ] },
      { id: "platform-tournaments", label: "Events", iconName: "award", group: "Community", tabs: [
        { id: "platform-tournaments", label: "Tournaments" },
        { id: "platform-ticketing", label: "Ticket sales" },
      ] },
      { id: "platform-moderation", label: "People", iconName: "users", group: "Community", tabs: [
        { id: "platform-moderation", label: "Moderation" },
        { id: "platform-staff", label: "Staff & roles" },
      ] },
      { id: "platform-pricing", label: "Pricing", iconName: "credit-card", group: "Money" },
      { id: "platform-snapshot", label: "Token economy", iconName: "currency-dollar", group: "Money", tabs: [
        { id: "platform-snapshot", label: "Overview" },
        { id: "platform-token-streamers", label: "Streamers" },
        { id: "platform-token-history", label: "History" },
        { id: "platform-economy", label: "Levers" },
        { id: "platform-compliance", label: "Rules" },
      ] },
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

/** Every tab id an item answers to: its own, plus its view's tabs. */
export function itemTabIds(item: AccountNavItem): string[] {
  return [...(item.id ? [item.id] : []), ...(item.tabs?.map((t) => t.id) ?? [])];
}

/** The item (view) in a section that holds this tab. */
export function viewForTab(section: AccountNavSection, tabId: string): AccountNavItem | undefined {
  return section.items.find((i) => itemTabIds(i).includes(tabId));
}

/** The section a given tab id belongs to (after alias resolution). */
export function sectionForTab(tabId: string): AccountNavSection | undefined {
  const id = ACCOUNT_TAB_ALIAS[tabId] ?? tabId;
  return ACCOUNT_SECTIONS.find((s) => s.items.some((i) => itemTabIds(i).includes(id)));
}

/** Full href (route + ?tab) for a tab id. */
export function hrefForTab(tabId: string): string {
  const id = ACCOUNT_TAB_ALIAS[tabId] ?? tabId;
  const section = sectionForTab(id);
  if (!section) return "/account";
  return `${section.route}?tab=${id}`;
}
