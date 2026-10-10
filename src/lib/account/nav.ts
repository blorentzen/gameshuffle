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
  /** A view with tabs across its top. `id` is the tab it opens on; every tab
   *  keeps its own `?tab=` address, so old links work. */
  tabs?: AccountSubTab[];
  /** Shown only to GS Pro accounts (Streaming), or only to everyone else. */
  proOnly?: boolean;
  freeOnly?: boolean;
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
    // Four views (2026-10-09 consolidation). Old tab ids (profile, theme,
    // notifications, security, plans) open inside their new view.
    items: [
      { id: "profile", label: "Profile", iconName: "user", tabs: [
        { id: "profile", label: "About you" },
        { id: "games", label: "Games" },
        { id: "gamertags", label: "Gamertags & socials" },
        { id: "friends", label: "Friends" },
      ] },
      { id: "theme", label: "Theming", iconName: "palette", tabs: [
        { id: "theme", label: "Theme" },
        { id: "profile-page", label: "Profile page" },
        { id: "walkup", label: "Walk-up song" },
      ] },
      { id: "settings", label: "Settings", iconName: "settings", tabs: [
        { id: "settings", label: "General" },
        { id: "security", label: "Sign-in & security" },
        { id: "notifications", label: "Notifications" },
        { id: "privacy", label: "Privacy" },
      ] },
      { id: "plans", label: "Plans & billing", iconName: "credit-card" },
    ],
  },
  {
    label: "My Stuff",
    route: "/account/stuff",
    defaultTab: "tournaments",
    iconName: "folder",
    // My Games and Board Games moved to Account ▸ Profile ▸ Games (aliases
    // below keep their old links working).
    items: [
      { id: "tournaments", label: "Events", iconName: "calendar", tabs: [
        { id: "tournaments", label: "Tournaments" },
        { id: "game-nights", label: "Game nights" },
      ] },
      { id: "tickets", label: "Purchases", iconName: "receipt", tabs: [
        { id: "tickets", label: "Tickets" },
        { id: "orders", label: "Shop orders" },
        { id: "payouts", label: "Payouts" },
      ] },
      { id: "setups", label: "Saved configs", iconName: "bookmark" },
      { id: "my-cards", label: "My Collection", iconName: "stack-2" },
    ],
  },
  {
    // Stream Setup + Community & Chat, merged 2026-10-09 (mockups
    // https://claude.ai/artifact/K23oSsSY9FJvFBKfVTfX6S). /account/streamer and
    // /account/community forward here; every old tab id is kept. Free accounts
    // see Get started and the Discord bot (one server works on Free).
    label: "Streaming",
    route: "/account/streaming",
    defaultTab: "integrations",
    iconName: "video",
    items: [
      { id: "get-started", label: "Get started", iconName: "star", freeOnly: true },
      { id: "integrations", label: "Setup", iconName: "link", proOnly: true, tabs: [
        { id: "integrations", label: "Twitch" },
        { id: "discord", label: "Discord" },
        { id: "youtube", label: "YouTube & Kick" },
        { id: "schedule", label: "Schedule" },
        { id: "mods", label: "Mods" },
      ] },
      { id: "discord-bot", label: "Discord bot", iconName: "brand-discord", tabs: [
        { id: "discord-bot", label: "Channels & posts" },
        { id: "discord-roles", label: "Roles" },
        { id: "discord-automod", label: "AutoMod & logs" },
        { id: "discord-qotd", label: "Question of the Day" },
      ] },
      { id: "overlay-layout", label: "Overlay", iconName: "layout-dashboard", proOnly: true, tabs: [
        { id: "overlay-layout", label: "Layout" },
        { id: "stream-tools", label: "Tool looks" },
        { id: "wheels", label: "Wheels" },
        { id: "chat-feed", label: "Chat feed" },
      ] },
      { id: "chat-commands", label: "Chat", iconName: "message-circle", proOnly: true, tabs: [
        { id: "chat-commands", label: "Commands" },
        { id: "built-in", label: "Built-in" },
        { id: "community", label: "Modules" },
        { id: "game-modules", label: "Game defaults" },
      ] },
      { id: "polls", label: "Live games", iconName: "player-play", proOnly: true, tabs: [
        { id: "polls", label: "Polls" },
        { id: "bingo", label: "Bingo" },
        { id: "draft", label: "Chat Draft" },
        { id: "chat-brain", label: "Chat Brain" },
      ] },
      { id: "engagement", label: "Viewers", iconName: "users", proOnly: true, tabs: [
        { id: "engagement", label: "Engagement" },
        { id: "anthems", label: "Walk-up songs" },
      ] },
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
  "my-games": "games",
  "board-games": "games",
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
