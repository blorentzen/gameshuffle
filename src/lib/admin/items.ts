/**
 * Platform admin, one list (admin like Settings, Britton's picks 2026-11-08, all as recommended): the views in five
 * groups, each `/admin/<id>` with its screens as tabs (`?tab=<tab id>`). Every screen keeps its old id (`key`,
 * `platform-…`) so `/account/platform?tab=platform-…` links in emails, notifications and bookmarks still land
 * (`adminHrefFor`). Search reads a view's line and keywords, and each tab's own, so "orders" opens Shop ▸ Orders.
 * Client-safe.
 */

import {
  IconActivity, IconBooks, IconCoins, IconCreditCard, IconFlag, IconHeart, IconMessageCircle, IconSettings, IconShoppingCart,
  IconSparkles, IconToggleRight, IconTrophy, IconUsers, type Icon,
} from "@tabler/icons-react";
import type { SettingsTone } from "@/lib/settings/items";

export interface AdminTab {
  /** The tab in the address (`/admin/shop?tab=orders`). */
  id: string;
  /** The screen's old id (`?tab=platform-shop-orders`). */
  key: string;
  label: string;
  /** One line, shown when search finds this tab. */
  sub: string;
  keywords: string;
}

export interface AdminItem {
  id: string;
  label: string;
  sub: string;
  icon: Icon;
  tone: SettingsTone;
  keywords: string;
  /** A one-screen view's old id. */
  key?: string;
  /** A view with screens across its top; the first opens by default. */
  tabs?: AdminTab[];
}

export interface AdminGroup { label: string; items: AdminItem[] }

export const ADMIN_GROUPS: AdminGroup[] = [
  {
    label: "Run the site",
    items: [
      { id: "overview", label: "Overview", sub: "Health, growth, revenue, AI usage", icon: IconActivity, tone: "blue", keywords: "dashboard numbers", tabs: [
        { id: "health", key: "platform-health", label: "Health", sub: "What's happening right now", keywords: "online live streams accounts hero rosters checks" },
        { id: "growth", key: "platform-growth", label: "Growth", sub: "Sign-ups and who stays", keywords: "signups retention churn mailing list" },
        { id: "revenue", key: "platform-revenue", label: "Revenue", sub: "Monthly revenue by plan", keywords: "mrr money subscriptions trials cancellations" },
        { id: "ai", key: "platform-ai", label: "AI usage", sub: "Generations, tokens and limits", keywords: "claude allowance generations" },
      ] },
      { id: "switches", label: "Switches", sub: "Turn features on and off", icon: IconToggleRight, tone: "teal", key: "platform-switches", keywords: "flags feature flag launch shop open circuit billing paid entry facebook sign-in" },
    ],
  },
  {
    label: "Shop",
    items: [
      { id: "shop", label: "Shop", sub: "Orders, merch, card packs, states", icon: IconShoppingCart, tone: "orange", keywords: "store", tabs: [
        { id: "orders", key: "platform-shop-orders", label: "Orders", sub: "Packs and merch to ship", keywords: "refund refunds tracking shipping ship order" },
        { id: "merch", key: "platform-shop-merch", label: "Merch", sub: "Printful products for the shop", keywords: "printful shirts hoodies collections" },
        { id: "packs", key: "platform-shop-products", label: "Card packs", sub: "Packs, prices and stock", keywords: "products stock stripe price" },
        { id: "states", key: "platform-shop-states", label: "States", sub: "Sales by state, for sales tax", keywords: "tax nexus" },
        { id: "featured", key: "platform-shop", label: "Featured cards", sub: "Our TCGplayer cards on the site", keywords: "tcgplayer singles sold" },
      ] },
    ],
  },
  {
    label: "Content",
    items: [
      { id: "originals", label: "Originals", sub: "Chat Brain, Weekly, trivia, break mode", icon: IconSparkles, tone: "violet", keywords: "daily games", tabs: [
        { id: "overview", key: "platform-originals", label: "Overview", sub: "How our own games are doing", keywords: "daily shuffle dex" },
        { id: "chat-brain", key: "platform-chat-brain", label: "Chat Brain", sub: "Questions, answers and boards", keywords: "survey questions boards review" },
        { id: "weekly", key: "platform-weekly", label: "Weekly Challenge", sub: "This week's question and picks", keywords: "tier war survey" },
        { id: "trivia", key: "platform-trivia", label: "Trivia", sub: "The question pack hosts use", keywords: "questions pack approve fire round wrong answers" },
        { id: "break", key: "platform-break", label: "Break mode", sub: "Questions mods pulled from breaks", keywords: "pulled break games" },
      ] },
      { id: "library", label: "Library", sub: "Guides, card decks, game catalog", icon: IconBooks, tone: "teal", keywords: "content", tabs: [
        { id: "guides", key: "platform-guides", label: "Guides", sub: "The how-to guides", keywords: "articles publish draft" },
        { id: "decks", key: "platform-decks", label: "Card decks", sub: "Official game night cards", keywords: "chance missions mario party smash" },
        { id: "games", key: "platform-games", label: "Game catalog", sub: "Every game we know, with box art", keywords: "box art favorites asked for" },
      ] },
    ],
  },
  {
    label: "Community",
    items: [
      { id: "chat-bot", label: "Chat bot", sub: "Commands, variables, chaos events", icon: IconMessageCircle, tone: "magenta", keywords: "twitch discord bot", tabs: [
        { id: "commands", key: "platform-default-commands", label: "Commands", sub: "Ready-made chat commands", keywords: "lurk 8ball roll replies" },
        { id: "variables", key: "platform-variables", label: "Variables", sub: "The {words} replies fill in", keywords: "curly brackets" },
        { id: "chaos", key: "platform-events", label: "Chaos events", sub: "The !chaos and !random decks", keywords: "chaos random events deck" },
        { id: "engagement", key: "platform-engagement", label: "Engagement", sub: "Points for being active in chat", keywords: "engagement points" },
      ] },
      { id: "events", label: "Events", sub: "Tournaments, ticket sales, series", icon: IconTrophy, tone: "teal", keywords: "", tabs: [
        { id: "tournaments", key: "platform-tournaments", label: "Tournaments", sub: "Every tournament, and sponsoring one", keywords: "circuit sponsor" },
        { id: "tickets", key: "platform-ticketing", label: "Ticket sales", sub: "Paid tickets and payouts", keywords: "tickets fees organizers payouts" },
        { id: "series", key: "platform-series", label: "Series", sub: "Our own team events", keywords: "teams draft" },
      ] },
      { id: "ranked", label: "GS Ranked", sub: "Lounges and their history", icon: IconFlag, tone: "red", key: "platform-ladders", keywords: "lounge ladders ranked mmr" },
      { id: "people", label: "People", sub: "Moderation, GIFs, time trials, staff", icon: IconUsers, tone: "blue", keywords: "accounts", tabs: [
        { id: "moderation", key: "platform-moderation", label: "Moderation", sub: "Reports, suspensions and appeals", keywords: "reports ban suspend warn appeal block" },
        { id: "gifs", key: "platform-gifs", label: "GIFs", sub: "Held and reported GIFs", keywords: "stickers reported" },
        { id: "time-trials", key: "platform-time-trials", label: "Time trials", sub: "Clips, reported times, reviewers", keywords: "verify clips times" },
        { id: "staff", key: "platform-staff", label: "Staff and roles", sub: "Staff, admins and beta testers", keywords: "roles admin beta" },
      ] },
    ],
  },
  {
    label: "Money",
    items: [
      { id: "pricing", label: "Pricing", sub: "Plans, fees and limits", icon: IconCreditCard, tone: "violet", key: "platform-pricing", keywords: "gs pro circuit stripe prices fees ai allowances" },
      { id: "support", label: "Support", sub: "Supporters, the wall, updates", icon: IconHeart, tone: "magenta", key: "platform-support", keywords: "supporters backer champion goal wall" },
      { id: "tokens", label: "Token economy", sub: "Streamers, history, levers, rules", icon: IconCoins, tone: "orange", keywords: "tokens economy", tabs: [
        { id: "overview", key: "platform-snapshot", label: "Overview", sub: "Tokens earned, awarded and spent", keywords: "snapshot" },
        { id: "streamers", key: "platform-token-streamers", label: "Streamers", sub: "Allowances and busiest chats", keywords: "allowance communities" },
        { id: "history", key: "platform-token-history", label: "History", sub: "Tokens by day", keywords: "activity daily" },
        { id: "levers", key: "platform-economy", label: "Levers", sub: "Every number the economy runs on", keywords: "grants prices payouts trainer road" },
        { id: "rules", key: "platform-compliance", label: "Rules", sub: "Where predictions are allowed", keywords: "region compliance predictions" },
      ] },
    ],
  },
];

export const ADMIN_ITEMS: AdminItem[] = ADMIN_GROUPS.flatMap((g) => g.items);

/** Where the list goes back to Settings (its last group). */
export const ADMIN_SETTINGS_ROW = { id: "settings", label: "Settings", sub: "Profile, sign-in, notifications", icon: IconSettings, tone: "blue" as const, keywords: "account" };

export const adminItem = (id: string) => ADMIN_ITEMS.find((i) => i.id === id) ?? null;

/** The address of a view (and tab; the first tab needs none). */
export function adminHref(item: AdminItem, tab?: AdminTab): string {
  return tab && tab !== item.tabs?.[0] ? `/admin/${item.id}?tab=${tab.id}` : `/admin/${item.id}`;
}

/** The new address for an old screen id (`platform-shop-orders` → `/admin/shop?tab=orders`); unknown → `/admin`. */
export function adminHrefFor(key: string | null | undefined): string {
  for (const item of ADMIN_ITEMS) {
    if (item.key === key) return adminHref(item);
    const tab = item.tabs?.find((t) => t.key === key);
    if (tab) return adminHref(item, tab);
  }
  return "/admin";
}
