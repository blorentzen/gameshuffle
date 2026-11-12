/**
 * Account navigation model — the single source of truth for how the /account
 * settings surface is split into section PAGES (You · the interest sections)
 * and which tabs live under each. Shared by the section pages, the account menu
 * and the legacy `?tab=` redirect logic. Client-safe (no server deps). Platform
 * admin has its own list, `src/lib/admin/items.ts` (/admin, 2026-11-08).
 *
 * Each section is its own route; within a section, tabs switch via `?tab=`.
 */

import type { Interest } from "@/lib/interests/rules";

export interface AccountNavItem {
  /** Tab id (switches via `?tab=`). Omitted for a pure link-out (`href`). */
  id?: string;
  label: string;
  /** Tabler icon name (kebab-case). */
  iconName: string;
  /** When set, the item is a link-out to this absolute path rather than a
   *  `?tab=` within the section. */
  href?: string;
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
  /** "you" = the account's own pages, always listed; "interest" = listed under Your interests for these interests,
   *  under More for everyone else (menus and account picks 2026-11-05, 3A/4A). */
  kind: "you" | "interest";
  interests?: Interest[];
  /** What's in it, in a few words (Your home's links). */
  line?: string;
  items: AccountNavItem[];
}

/**
 * The account area (menus and account picks 2026-11-05, https://claude.ai/artifact/FVgHcSgixdcLaGZisgsd97, 3A-5A):
 * one sidebar grouped You, then the sections for your interests, then More. Every page that existed before is still
 * here, regrouped: My Stuff's tabs moved to the section they belong to (/account/stuff forwards each one), Theming
 * folded into Profile, and Discord left Streaming for a section of its own. Old `?tab=` ids are unchanged.
 */
export const ACCOUNT_SECTIONS: AccountNavSection[] = [
  {
    label: "You",
    route: "/account",
    defaultTab: "home",
    iconName: "user",
    kind: "you",
    items: [
      { id: "home", label: "Your home", iconName: "home" },
      { id: "profile", label: "Profile", iconName: "user", tabs: [
        { id: "profile", label: "About you" },
        { id: "games", label: "Games" },
        { id: "gamertags", label: "Gamertags & socials" },
        { id: "friends", label: "Friends" },
        { id: "theme", label: "Theme" },
        { id: "profile-page", label: "Profile page" },
        { id: "walkup", label: "Walk-up song" },
        { id: "gifs", label: "GIFs" },
      ] },
      { id: "settings", label: "Settings", iconName: "settings", tabs: [
        { id: "settings", label: "General" },
        { id: "security", label: "Sign-in & security" },
        { id: "notifications", label: "Notifications" },
        { id: "privacy", label: "Privacy" },
      ] },
      { id: "plans", label: "Plans & billing", iconName: "credit-card" },
      { id: "tickets", label: "Purchases", iconName: "receipt", tabs: [
        { id: "tickets", label: "Tickets" },
        { id: "orders", label: "Shop orders" },
      ] },
      { id: "support", label: "Support GameShuffle", iconName: "heart" },
      { id: "invite", label: "Invite friends", iconName: "user-plus" },
    ],
  },
  {
    label: "Competitive",
    route: "/account/competitive",
    defaultTab: "competitive",
    iconName: "flag",
    kind: "interest",
    interests: ["competitive"],
    line: "Your times, lounge names and MMR card",
    items: [
      { id: "competitive", label: "Competitive Mario Kart", iconName: "flag" },
    ],
  },
  {
    label: "Pokémon",
    route: "/account/pokemon",
    defaultTab: "my-cards",
    iconName: "pokeball",
    kind: "interest",
    interests: ["pokemon"],
    line: "My Cards and your deck lists",
    items: [
      { id: "my-cards", label: "My Cards", iconName: "stack-2" },
      { id: "tcg-decks", label: "Deck lists", iconName: "cards" },
    ],
  },
  {
    label: "Your events",
    route: "/account/events",
    defaultTab: "tournaments",
    iconName: "calendar",
    kind: "interest",
    interests: ["home", "events"],
    line: "Tournaments, game nights, trivia and communities",
    items: [
      { id: "tournaments", label: "Events", iconName: "calendar", tabs: [
        { id: "tournaments", label: "Tournaments" },
        { id: "game-nights", label: "Game nights" },
        { id: "trivia", label: "Trivia" },
        // Ticket sales payouts: a tab (not its own item) so it can stay hidden until paid entry is on.
        { id: "payouts", label: "Payouts" },
      ] },
      { id: "communities", label: "Communities", iconName: "users" },
      { id: "setups", label: "Saved setups", iconName: "bookmark" },
      // Your own Chance cards, missions and house rules (moved from Streaming ▸ Game defaults).
      { id: "decks", label: "Game night decks", iconName: "cards" },
    ],
  },
  {
    // Stream Setup + Community & Chat, merged 2026-10-09 (mockups
    // https://claude.ai/artifact/K23oSsSY9FJvFBKfVTfX6S). /account/streamer and
    // /account/community forward here; every old tab id is kept. The Discord
    // screens moved to /account/discord (2026-11-05). Free accounts see Get started.
    label: "Streaming",
    route: "/account/streaming",
    defaultTab: "integrations",
    iconName: "video",
    kind: "interest",
    interests: ["stream"],
    line: "Setup, overlay, chat and live games",
    items: [
      { id: "get-started", label: "Get started", iconName: "star", freeOnly: true },
      { id: "integrations", label: "Setup", iconName: "link", proOnly: true, tabs: [
        { id: "integrations", label: "Twitch" },
        { id: "youtube", label: "YouTube & Kick" },
        { id: "schedule", label: "Schedule" },
        { id: "mods", label: "Mods" },
      ] },
      { id: "overlay-layout", label: "Overlay", iconName: "layout-dashboard", proOnly: true, tabs: [
        { id: "overlay-layout", label: "Layout" },
        { id: "stream-tools", label: "Tool looks" },
        { id: "wheels", label: "Wheels" },
        { id: "chat-feed", label: "Chat feed" },
      ] },
      { id: "chat-commands", label: "Chat", iconName: "message-circle", proOnly: true, tabs: [
        { id: "chat-commands", label: "Commands" },
        { id: "community", label: "Modules" },
        { id: "game-modules", label: "Game defaults" },
      ] },
      { id: "polls", label: "Live games", iconName: "player-play", proOnly: true, tabs: [
        { id: "polls", label: "Polls" },
        { id: "bingo", label: "Bingo" },
        { id: "draft", label: "Chat Draft" },
        { id: "chat-brain", label: "Chat Brain" },
        { id: "break-mode", label: "Break mode" },
        { id: "level-queue", label: "Level queue" },
      ] },
      { id: "engagement", label: "Viewers", iconName: "users", proOnly: true, tabs: [
        { id: "engagement", label: "Engagement" },
        { id: "anthems", label: "Walk-up songs" },
      ] },
    ],
  },
  {
    // Both Discord apps in one place (2026-11-05): GameShuffle's bot and, where it exists, the Mario Kart bot.
    label: "Discord",
    route: "/account/discord",
    defaultTab: "discord",
    iconName: "brand-discord",
    kind: "interest",
    interests: ["stream", "events", "competitive"],
    line: "Your servers, channels, roles and replies",
    items: [
      { id: "discord", label: "Servers", iconName: "brand-discord" },
      { id: "discord-bot", label: "Posts & roles", iconName: "message-circle", tabs: [
        { id: "discord-bot", label: "Channels & posts" },
        { id: "discord-roles", label: "Roles" },
        { id: "discord-automod", label: "AutoMod & logs" },
        { id: "discord-qotd", label: "Question of the Day" },
        { id: "discord-tags", label: "Server replies" },
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
  // Built-in commands joined the one Commands list (2026-10-10).
  "built-in": "chat-commands",
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
