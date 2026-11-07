/**
 * Settings, one list (journeys picks 2026-11-06, 8A, https://claude.ai/artifact/DqZuBnVSJFAuDSDY4Ssb11): three groups
 * of things that are settings (You, Money) and links to the places that run your tools and your games until they move
 * (the Studio, the You tab in each game space). Each settings item is /settings/<id>; a link item opens its own page.
 * Client-safe.
 */

import {
  IconBell, IconBrandDiscord, IconCalendarEvent, IconCards, IconCreditCard, IconDeviceTv, IconFlag, IconHeart, IconLock,
  IconMail, IconReceipt, IconShieldLock, IconUser, IconUserPlus, type Icon,
} from "@tabler/icons-react";

export type SettingsTone = "blue" | "violet" | "magenta" | "teal" | "green" | "orange" | "red";

export interface SettingsItem {
  id: string;
  label: string;
  sub: string;
  icon: Icon;
  tone: SettingsTone;
  /** Words people search for that aren't in the label. */
  keywords: string;
  /** A page of its own elsewhere (tools and games until they move). */
  href?: string;
  /** Tabs inside the item (`?tab=`), first is the default. */
  tabs?: { id: string; label: string }[];
}

export interface SettingsGroup { label: string; items: SettingsItem[] }

export const PROFILE_TABS = [
  { id: "about", label: "About you" },
  { id: "games", label: "Games" },
  { id: "gamertags", label: "Gamertags & socials" },
  { id: "friends", label: "Friends" },
  { id: "theme", label: "Theme" },
  { id: "page", label: "Profile page" },
  { id: "walkup", label: "Walk-up song" },
  { id: "gifs", label: "GIFs" },
];

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    label: "You",
    items: [
      { id: "profile", label: "Profile", sub: "Picture, bio, games, theme", icon: IconUser, tone: "blue", keywords: "avatar picture banner bio pronouns location games favorites gamertags socials friends theme colors brand skin css walk-up song anthem gifs profile page layout", tabs: PROFILE_TABS },
      { id: "account", label: "General", sub: "Email, what you're here for, display", icon: IconMail, tone: "blue", keywords: "email username display dark light theme time zone timezone interests recap" },
      { id: "security", label: "Sign-in and security", sub: "Password, two-factor, connections", icon: IconShieldLock, tone: "green", keywords: "password two-factor 2fa mfa recovery codes connections twitch discord facebook link unlink sign in" },
      { id: "notifications", label: "Notifications", sub: "Site, email and texts", icon: IconBell, tone: "orange", keywords: "alerts email texts sms phone reminders" },
      { id: "privacy", label: "Privacy", sub: "Who sees what, blocked people", icon: IconLock, tone: "violet", keywords: "public profile leaderboard winners blocked data request delete account" },
      { id: "invite", label: "Invite friends", sub: "Your link and tokens", icon: IconUserPlus, tone: "teal", keywords: "referral link tokens invite" },
    ],
  },
  {
    label: "Money",
    items: [
      { id: "plans", label: "Plans and billing", sub: "GS Pro and GS Circuit", icon: IconCreditCard, tone: "violet", keywords: "gs pro circuit subscription trial cancel billing invoice card" },
      { id: "purchases", label: "Purchases", sub: "Tickets and shop orders", icon: IconReceipt, tone: "violet", keywords: "tickets orders receipts shop", tabs: [{ id: "tickets", label: "Tickets" }, { id: "orders", label: "Shop orders" }] },
      { id: "support", label: "Support GameShuffle", sub: "Your support and the wall", icon: IconHeart, tone: "magenta", keywords: "supporter backer champion monthly wall" },
    ],
  },
  {
    label: "Your tools",
    items: [
      { id: "streaming", label: "Studio", sub: "Your streams, tools and setup", icon: IconDeviceTv, tone: "magenta", keywords: "twitch stream overlay obs chat commands polls bingo bot", href: "/account/streaming" },
      { id: "discord", label: "Discord servers", sub: "Your servers, posts and roles", icon: IconBrandDiscord, tone: "blue", keywords: "discord bot server channels roles automod", href: "/account/discord" },
      { id: "events", label: "Events you run", sub: "Tournaments, game nights, trivia", icon: IconCalendarEvent, tone: "teal", keywords: "tournaments game nights trivia leagues payouts communities saved setups decks", href: "/host" },
    ],
  },
  {
    label: "Your games",
    items: [
      { id: "competitive", label: "Competitive Mario Kart", sub: "Lounge names, MMR card, times", icon: IconFlag, tone: "red", keywords: "lounge mmr card time trials", href: "/account/competitive" },
      { id: "pokemon", label: "Pokémon", sub: "My Cards and deck lists", icon: IconCards, tone: "orange", keywords: "cards collection deck lists tcg", href: "/account/pokemon" },
    ],
  },
];

export const SETTINGS_ITEMS: SettingsItem[] = SETTINGS_GROUPS.flatMap((g) => g.items);

export const settingsItem = (id: string) => SETTINGS_ITEMS.find((i) => i.id === id) ?? null;

/** Old Account (`/account?tab=`) ids → their place in Settings, so every old link still lands. */
export const ACCOUNT_TAB_TO_SETTINGS: Record<string, string> = {
  home: "/settings/account",
  settings: "/settings/account",
  security: "/settings/security",
  notifications: "/settings/notifications",
  privacy: "/settings/privacy",
  plans: "/settings/plans",
  support: "/settings/support",
  invite: "/settings/invite",
  tickets: "/settings/purchases?tab=tickets",
  orders: "/settings/purchases?tab=orders",
  profile: "/settings/profile?tab=about",
  games: "/settings/profile?tab=games",
  gamertags: "/settings/profile?tab=gamertags",
  friends: "/settings/profile?tab=friends",
  theme: "/settings/profile?tab=theme",
  "profile-page": "/settings/profile?tab=page",
  walkup: "/settings/profile?tab=walkup",
  gifs: "/settings/profile?tab=gifs",
};
