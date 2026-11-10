/**
 * What a free account keeps in each game space, shown to visitors as dashed empty slots (journeys picks 2026-11-06,
 * 2A and 3A): on the game band under a search page's tool, and on the space itself. Client-safe.
 */

import { IconBookmark, IconCalendarEvent, IconCards, IconChartBar, IconFlame, IconMessage, IconRoute, IconStopwatch, IconTrophy, type Icon } from "@tabler/icons-react";

export interface Keep { label: string; sub: string; icon: Icon }

export const KEEPS: Record<string, Keep[]> = {
  "mario-kart-8-deluxe": [
    { label: "Your best times", sub: "on the boards", icon: IconStopwatch },
    { label: "Your lounge", sub: "MMR and division", icon: IconChartBar },
    { label: "Your build", sub: "saved from a roll", icon: IconBookmark },
  ],
  "mario-kart-world": [
    { label: "Your best times", sub: "on the boards", icon: IconStopwatch },
    { label: "Your lounge", sub: "MMR and division", icon: IconChartBar },
    { label: "Your build", sub: "saved from a roll", icon: IconBookmark },
  ],
  smash: [
    { label: "Your streak", sub: "Fighter of the day", icon: IconFlame },
    { label: "Your Gauntlet", sub: "five fighters a week", icon: IconTrophy },
    { label: "Your setups", sub: "saved from a roll", icon: IconBookmark },
  ],
  "mario-party": [
    { label: "Your streak", sub: "Party of the day", icon: IconFlame },
    { label: "Your nights", sub: "scores and seasons", icon: IconCalendarEvent },
    { label: "Your setups", sub: "saved from a roll", icon: IconBookmark },
  ],
  pokemon: [
    { label: "Your streaks", sub: "Dex and Duel", icon: IconFlame },
    { label: "Your Trainer Road", sub: "badges and stars", icon: IconRoute },
    { label: "Your cards", sub: "collection and decks", icon: IconCards },
  ],
  // First wave (2026-11-09). Spaces where nothing is yours yet (Overwatch, Rivals, the fighting games, ideas spaces)
  // have no slots: visitors get the header's Join free.
  "splatoon-3": [
    { label: "Your setups", sub: "saved from a roll", icon: IconBookmark },
    { label: "Your events", sub: "tournaments you join", icon: IconCalendarEvent },
    { label: "Your posts", sub: "with Splatoon players", icon: IconMessage },
  ],
  "kirby-air-riders": [
    { label: "Your setups", sub: "saved from a roll", icon: IconBookmark },
    { label: "Your month", sub: "points from live nights", icon: IconTrophy },
    { label: "Your events", sub: "cups and nights", icon: IconCalendarEvent },
  ],
  sonic: [
    { label: "Your setups", sub: "saved from a roll", icon: IconBookmark },
    { label: "Your events", sub: "tournaments you join", icon: IconCalendarEvent },
    { label: "Your posts", sub: "with Sonic players", icon: IconMessage },
  ],
};
