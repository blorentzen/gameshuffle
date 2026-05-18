/**
 * Per-game command catalog — single source of truth for "what chat
 * commands work for this game?" The Hub Modules tab renders this list
 * inside the per-game module surface so streamers can quickly answer
 * the question without context-switching to docs.
 *
 * Categories mirror who runs the command:
 *   - viewer:      anyone in chat
 *   - broadcaster: only the streamer (or the broadcaster badge)
 *   - mod:         broadcaster + moderators
 *
 * Availability is per-game-slug:
 *   - "all"                       — works in every session
 *   - ["mario-kart-8-deluxe", …]  — only when the active game is one of these
 *   - "supported_game"            — any race-randomizer game (mk8dx, mkworld)
 *   - "queue"                     — only when no game is configured (GS Queue floor)
 */

import { GS_DEFAULT_SLUG } from "@/lib/games/artwork";

export type CommandCategory = "viewer" | "broadcaster" | "mod";

export type CommandAvailability =
  | "all"
  | "supported_game"
  | "queue"
  | string[];

export interface CommandSpec {
  name: string;
  args?: string;
  description: string;
  category: CommandCategory;
  availability: CommandAvailability;
  /** Optional caveat shown next to the command when it's available but
   *  has a known limitation for a specific game (e.g. "MKWorld item
   *  modes aren't catalogued yet"). */
  caveatBySlug?: Record<string, string>;
}

export const ALL_COMMANDS: CommandSpec[] = [
  // ---- Viewer-facing lobby commands (universal) -------------------------
  {
    name: "!gs-join",
    description: "Join the shuffle lobby.",
    category: "viewer",
    availability: "all",
  },
  {
    name: "!gs-leave",
    description: "Leave the lobby.",
    category: "viewer",
    availability: "all",
  },
  {
    name: "!gs-lobby",
    description: "Show who's currently in the lobby.",
    category: "viewer",
    availability: "all",
  },
  {
    name: "!gs-shuffle",
    description: "Roll your own kart combo.",
    category: "viewer",
    availability: ["mario-kart-8-deluxe", "mario-kart-world"],
  },
  {
    name: "!gs-mycombo",
    description: "Recall the combo you last rolled.",
    category: "viewer",
    availability: ["mario-kart-8-deluxe", "mario-kart-world"],
  },
  {
    name: "!gs-help",
    description: "Show the command list.",
    category: "viewer",
    availability: "all",
  },
  {
    name: "!gs-live",
    description:
      "Get the GameShuffle live page link — view queue, vote on picks/bans, see recent rolls.",
    category: "viewer",
    availability: "all",
  },

  // ---- Broadcaster — race randomizer ------------------------------------
  {
    name: "!gs-track",
    args: "[N]",
    description:
      "Roll a track. Optional N rolls a series of N tracks (defaults to your saved series length).",
    category: "broadcaster",
    availability: ["mario-kart-8-deluxe", "mario-kart-world"],
  },
  {
    name: "!gs-items",
    description:
      "Roll an item mode. If the rolled mode is Custom, also picks a literal item subset.",
    category: "broadcaster",
    availability: ["mario-kart-8-deluxe", "mario-kart-world"],
  },
  {
    name: "!gs-race",
    args: "[N]",
    description:
      "Roll a track + item mode together. Optional N for a series. What it rolls (race vs rally) follows the streamer's Tracks-tab Race/Rally setting.",
    category: "broadcaster",
    availability: ["mario-kart-8-deluxe", "mario-kart-world"],
  },
  {
    name: "!gs-rally",
    description:
      "Force-roll a knockout rally (MKWorld only). Bypasses the !gs-race default.",
    category: "broadcaster",
    availability: ["mario-kart-world"],
  },

  // ---- Broadcaster — picks/bans rounds ----------------------------------
  {
    name: "!gs-picks-open",
    description:
      "Open a picks/bans round for the current game. Viewers vote at gameshuffle.co/live/[your-slug].",
    category: "broadcaster",
    availability: ["mario-kart-8-deluxe", "mario-kart-world"],
  },
  {
    name: "!gs-picks-close",
    description:
      "Close the active picks/bans round. Streamer reviews the top picks via the Hub.",
    category: "broadcaster",
    availability: ["mario-kart-8-deluxe", "mario-kart-world"],
  },

  // ---- Mod commands (broadcaster + moderator) ---------------------------
  {
    name: "!gs-kick",
    args: "@user [min]",
    description: "Kick a viewer from the lobby. Optional cooldown in minutes.",
    category: "mod",
    availability: "all",
  },
  {
    name: "!gs-clear",
    description: "Clear the lobby (broadcaster stays).",
    category: "mod",
    availability: "all",
  },
];

/**
 * Filter the catalog to commands available for the given game slug.
 * Returns commands grouped by category so the UI can render
 * sections cleanly.
 */
export function getCommandsForGame(slug: string): {
  viewer: CommandSpec[];
  broadcaster: CommandSpec[];
  mod: CommandSpec[];
} {
  const result: {
    viewer: CommandSpec[];
    broadcaster: CommandSpec[];
    mod: CommandSpec[];
  } = { viewer: [], broadcaster: [], mod: [] };

  for (const cmd of ALL_COMMANDS) {
    if (!isAvailable(cmd, slug)) continue;
    result[cmd.category].push(cmd);
  }

  return result;
}

function isAvailable(cmd: CommandSpec, slug: string): boolean {
  if (cmd.availability === "all") return true;
  if (cmd.availability === "supported_game") return true;
  if (cmd.availability === "queue") return slug === GS_DEFAULT_SLUG;
  if (Array.isArray(cmd.availability)) {
    return cmd.availability.includes(slug);
  }
  return false;
}
