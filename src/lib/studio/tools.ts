/**
 * The Studio's tools (journeys picks 2026-11-06, 10A): one page each at /hub/tools/<id>, holding the settings screen it
 * had in Account ▸ Streaming (`screen`, a key of `proScreens`), a picture of its overlay piece where one is filmed, and
 * how chat uses it. Setup's parts (/hub/setup/<id>) are the connection screens. Client-safe.
 */

import {
  IconAdjustmentsHorizontal, IconArrowsShuffle, IconBrain, IconChartBar, IconClock, IconDice5, IconGridDots, IconLayoutDashboard, IconListNumbers,
  IconMessageCircle, IconMusic, IconPuzzle, IconStopwatch, IconTerminal2, IconUsers, IconUsersGroup, type Icon,
} from "@tabler/icons-react";
import { speedrunShown } from "@/lib/games-visibility";

export type StudioTone = "blue" | "violet" | "magenta" | "teal" | "green" | "orange" | "red";

export interface StudioTool {
  id: string;
  label: string;
  line: string;
  icon: Icon;
  tone: StudioTone;
  /** The settings screen from Account ▸ Streaming. */
  screen: string;
  /** Its overlay piece, filmed for the chat games guide. */
  pic?: string;
  /** How chat starts or plays it. */
  chat?: string;
  group: "games" | "overlay" | "chat" | "viewers";
}

export const STUDIO_TOOLS: StudioTool[] = [
  { id: "polls", label: "Polls", line: "Chat, Discord and your live page vote together", icon: IconChartBar, tone: "blue", screen: "polls", pic: "/images/guides/chat-games/polls.webp", chat: "!poll · !vote 2", group: "games" },
  { id: "bingo", label: "Stream Bingo", line: "A card for every viewer, numbers on a timer", icon: IconGridDots, tone: "orange", screen: "bingo", pic: "/images/guides/chat-games/stream-bingo.webp", chat: "!bingo start · !bingocard", group: "games" },
  { id: "chat-brain", label: "Chat Brain", line: "Chat guesses the top answers", icon: IconBrain, tone: "magenta", screen: "chat-brain", pic: "/images/guides/chat-games/chat-brain.webp", chat: "!cb start · !a", group: "games" },
  { id: "break-mode", label: "Break mode", line: "Games that run while you're away", icon: IconClock, tone: "teal", screen: "break-mode", pic: "/images/guides/chat-games/break.webp", chat: "!gs brb · !gs back", group: "games" },
  { id: "draft", label: "Chat Draft", line: "Chat picks your team, one pick at a time", icon: IconUsers, tone: "violet", screen: "draft", pic: "/images/guides/chat-games/chat-draft.webp", chat: "!draft start", group: "games" },
  { id: "level-queue", label: "Level queue", line: "Viewers send levels, you play them in order", icon: IconListNumbers, tone: "red", screen: "level-queue", chat: "!add · !level next", group: "games" },
  { id: "wheels", label: "Wheels", line: "Spin from chat, the overlay lands it", icon: IconArrowsShuffle, tone: "green", screen: "wheels", pic: "/images/guides/chat-games/wheel.webp", chat: "!spin", group: "games" },
  { id: "overlay", label: "Overlay layout", line: "Where every piece sits in OBS", icon: IconLayoutDashboard, tone: "violet", screen: "overlay-layout", group: "overlay" },
  { id: "tool-looks", label: "Dice, coin and timer", line: "How the overlay's tools look", icon: IconDice5, tone: "orange", screen: "stream-tools", chat: "!roll · !flip · !gs timer", group: "overlay" },
  { id: "chat-feed", label: "Chat feed", line: "Your chat on the overlay", icon: IconMessageCircle, tone: "blue", screen: "chat-feed", group: "overlay" },
  // Speedrunning (picks 2026-11-09): its own setup (the /speedrun page's), not an Account ▸ Streaming screen.
  ...(speedrunShown() ? [{ id: "speedrun", label: "Speedrun", line: "Your splits on stream, from the timer you already use", icon: IconStopwatch, tone: "teal" as const, screen: "speedrun", group: "overlay" as const }] : []),
  { id: "commands", label: "Commands", line: "Every command on your channel", icon: IconTerminal2, tone: "blue", screen: "chat-commands", group: "chat" },
  { id: "modules", label: "Modules", line: "Turn chat features on and off", icon: IconPuzzle, tone: "teal", screen: "community", group: "chat" },
  { id: "game-defaults", label: "Game defaults", line: "Mario Kart session settings", icon: IconAdjustmentsHorizontal, tone: "red", screen: "game-modules", group: "chat" },
  { id: "engagement", label: "Engagement", line: "Who plays along, and how much", icon: IconUsersGroup, tone: "magenta", screen: "engagement", group: "viewers" },
  { id: "walkup", label: "Walk-up songs", line: "Viewers' songs when they arrive", icon: IconMusic, tone: "violet", screen: "anthems", group: "viewers" },
];

export const TOOL_GROUPS: { id: StudioTool["group"]; label: string }[] = [
  { id: "games", label: "Live games" },
  { id: "overlay", label: "Overlay" },
  { id: "chat", label: "Chat" },
  { id: "viewers", label: "Viewers" },
];

export const SETUP_PARTS: { id: string; label: string; line: string; screen: string }[] = [
  { id: "twitch", label: "Twitch", line: "Connection, the bot in your chat, channel points", screen: "integrations" },
  { id: "youtube", label: "YouTube and Kick", line: "More platforms for your lobbies", screen: "youtube" },
  { id: "schedule", label: "Schedule", line: "Your regular stream times", screen: "schedule" },
  { id: "mods", label: "Mods", line: "Who helps run your streams", screen: "mods" },
];

export const studioTool = (id: string) => STUDIO_TOOLS.find((t) => t.id === id) ?? null;

/** Account ▸ Streaming's old `?tab=` ids → their Studio page. */
export const STREAMING_TAB_TO_STUDIO: Record<string, string> = {
  integrations: "/hub/setup/twitch",
  youtube: "/hub/setup/youtube",
  schedule: "/hub/setup/schedule",
  mods: "/hub/setup/mods",
  ...Object.fromEntries(STUDIO_TOOLS.map((t) => [t.screen, `/hub/tools/${t.id}`])),
};
