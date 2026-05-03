/**
 * Bot copy templates for chat replies. Locked to the v1 spec — voice is
 * branded, restrained, "the shuffle" as the consistent noun. Variants
 * only on the highest-frequency events (join, leave) to avoid pure
 * repetition.
 *
 * Update with care — these are streamer-facing brand voice, not throwaway
 * UI strings. If you change one, update specs/gameshuffle-twitch-integration-v1.md
 * §6.1 too.
 */

import type { KartCombo } from "@/data/types";

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

const JOIN_VARIANTS = [
  (user: string, count: number, cap: number) => `🎲 @${user}'s in the shuffle. (${count}/${cap})`,
  (user: string, count: number, cap: number) => `🎲 @${user} joined the shuffle. (${count}/${cap})`,
];

const LEAVE_VARIANTS = [
  (user: string) => `@${user} stepped out of the shuffle.`,
  (user: string) => `@${user} left the shuffle.`,
];

export function joinMessage(displayName: string, count: number, cap: number): string {
  return pickRandom(JOIN_VARIANTS)(displayName, count, cap);
}

export function leaveMessage(displayName: string): string {
  return pickRandom(LEAVE_VARIANTS)(displayName);
}

export function shuffleResultMessage(displayName: string, comboText: string): string {
  return `🎲 @${displayName} drew: ${comboText}`;
}

export function myComboMessage(displayName: string, comboText: string): string {
  return `@${displayName}, you're running: ${comboText}`;
}

export function noComboYetMessage(displayName: string): string {
  return `@${displayName}, you haven't shuffled yet — type !gs-shuffle. (Full commands: !gs-help)`;
}

export function lobbyMessage(args: {
  count: number;
  cap: number;
  displayedNames: string[];
  overflow: number;
  /** Public lobby viewer URL — appended when overflow > 0 so viewers can see the full list. */
  fullListUrl?: string | null;
}): string {
  const list = args.displayedNames.length > 0 ? args.displayedNames.join(", ") : "—";
  if (args.count === 0) return `🎲 The shuffle's empty. Type !gs-join to be the first.`;
  let overflowSuffix = "";
  if (args.overflow > 0) {
    overflowSuffix = `, ... + ${args.overflow} more`;
    if (args.fullListUrl) overflowSuffix += ` — full list: ${args.fullListUrl}`;
  }
  return `🎲 In the shuffle (${args.count}/${args.cap}): ${list}${overflowSuffix}`;
}

export function lobbyFullMessage(): string {
  return `🎲 Shuffle's full. However, stick around if a spot opens up.`;
}

export function rejoinCooldownMessage(displayName: string, seconds: number): string {
  return `@${displayName}, you can rejoin in ${seconds} second${seconds === 1 ? "" : "s"}.`;
}

export function shuffleCooldownMessage(displayName: string, seconds: number): string {
  return `@${displayName}, you can shuffle again in ${seconds} second${seconds === 1 ? "" : "s"}.`;
}

export function notInShuffleMessage(displayName: string): string {
  return `@${displayName}, you're not in the shuffle. Type !gs-join first. (Full commands: !gs-help)`;
}

export function queueModeShuffleMessage(): string {
  return `🎲 This is a queue session — no combo to roll. Type !gs-lobby to see the line.`;
}

export function queueModeNoComboMessage(displayName: string): string {
  return `@${displayName}, queue mode — no combo to recall. You're in line via !gs-lobby.`;
}

export function alreadyInShuffleMessage(displayName: string): string {
  return `@${displayName}, you're already in the shuffle.`;
}

export function kickedTimedMessage(displayName: string, minutes: number): string {
  return `@${displayName} was removed from the shuffle for ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

export function kickedMessage(displayName: string): string {
  return `@${displayName} was removed from the shuffle.`;
}

export function kickTargetNotFoundMessage(target: string): string {
  return `Couldn't find @${target} in the shuffle.`;
}

export function clearMessage(): string {
  return `🎲 Shuffle cleared. Type !gs-join to get in for the next round.`;
}

export function userIsKickedMessage(displayName: string, secondsRemaining: number): string {
  const minutes = Math.ceil(secondsRemaining / 60);
  return `@${displayName}, you can rejoin in ~${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

/** Per-slot emoji labels so chat readers can parse which part of the
 * combo is which at a glance (character vs kart vs wheels vs glider). */
const SLOT_EMOJI = {
  character: "🧑",
  vehicle: "🏎️",
  wheels: "🛞",
  glider: "🪂",
} as const;

/** Format a randomized combo to the spec's middle-dot style. */
export function formatCombo(
  combo: KartCombo,
  game: { hasWheels: boolean; hasGlider: boolean }
): string {
  const parts = [
    `${SLOT_EMOJI.character} ${combo.character.name}`,
    `${SLOT_EMOJI.vehicle} ${combo.vehicle.name}`,
  ];
  if (game.hasWheels) parts.push(`${SLOT_EMOJI.wheels} ${combo.wheels.name}`);
  if (game.hasGlider) parts.push(`${SLOT_EMOJI.glider} ${combo.glider.name}`);
  return parts.join(" · ");
}

/**
 * Format a previously-stored combo without needing the game registry —
 * used by !gs-mycombo when the current category may differ from when the
 * combo was rolled. Drops "N/A" placeholder slots (MKWorld combos).
 */
export function formatStoredCombo(combo: KartCombo): string {
  const pairs: ReadonlyArray<readonly [string, string]> = [
    [SLOT_EMOJI.character, combo.character.name],
    [SLOT_EMOJI.vehicle, combo.vehicle.name],
    [SLOT_EMOJI.wheels, combo.wheels.name],
    [SLOT_EMOJI.glider, combo.glider.name],
  ];
  return pairs
    .filter(([, name]) => name && name !== "N/A")
    .map(([emoji, name]) => `${emoji} ${name}`)
    .join(" · ");
}

export function randomizerSwitchedMessage(newGameName: string): string {
  return `🎲 Randomizer switched to ${newGameName}. Type !gs-join to play.`;
}

export function randomizerPausedMessage(newCategoryName: string | null): string {
  if (newCategoryName) {
    return `🎲 GameShuffle doesn't support ${newCategoryName} — commands paused until you switch back to a Mario Kart category.`;
  }
  return `🎲 Randomizer paused — commands will resume when you switch to a supported Mario Kart category.`;
}

export function broadcasterAlwaysInMessage(displayName: string): string {
  return `@${displayName}, the broadcaster's always in the shuffle.`;
}

export function cantKickBroadcasterMessage(): string {
  return `Can't kick the broadcaster.`;
}

export function redemptionRerollMessage(args: {
  viewerDisplayName: string;
  streamerDisplayName: string;
  comboText: string;
}): string {
  return `🎲 @${args.viewerDisplayName} rerolled the streamer — @${args.streamerDisplayName} drew: ${args.comboText}`;
}

export function redemptionRefundNotSupportedMessage(viewerDisplayName: string): string {
  return `@${viewerDisplayName}, GameShuffle doesn't support this game — refunding your points.`;
}

export function redemptionRefundNotRunningMessage(viewerDisplayName: string): string {
  return `@${viewerDisplayName}, GameShuffle isn't running right now — refunding your points.`;
}

// =============================================================================
// Picks/Bans round messages — multi-game refinements PR B/C
// =============================================================================
//
// Communication matrix between GS web ↔ Twitch chat for picks/bans rounds.
// See `docs/picks-bans-messaging-matrix.md` for the full table. Strings
// stay in this file so the brand voice is consistent and updates land
// in one place.

const LIVE_VIEW_BASE = "gameshuffle.co/live";

function liveViewUrl(streamerSlug: string): string {
  return `${LIVE_VIEW_BASE}/${encodeURIComponent(streamerSlug)}`;
}

/** Round opened — viewers should head to the live view to vote. */
export function picksBansOpenedMessage(args: {
  streamerSlug: string;
  gameName: string;
}): string {
  return `🗳️ Picks/bans open for ${args.gameName} — vote at ${liveViewUrl(args.streamerSlug)} and lock your ballot before it closes.`;
}

/** Round closed without auto-apply — streamer is reviewing. */
export function picksBansClosedMessage(args: {
  gameName: string;
  ballotCount: number;
}): string {
  if (args.ballotCount === 0) {
    return `🗳️ Picks/bans round closed for ${args.gameName} — no ballots locked in.`;
  }
  return `🗳️ Picks/bans round closed for ${args.gameName} — ${args.ballotCount} ballot${args.ballotCount === 1 ? "" : "s"} in. Streamer's reviewing the top picks.`;
}

/** Round cancelled — by streamer or category pivot. */
export function picksBansCancelledMessage(args: {
  gameName: string | null;
  reason: "manual" | "category_pivot";
}): string {
  if (args.reason === "category_pivot") {
    return `🗳️ Picks/bans round cancelled — Twitch category changed.`;
  }
  return `🗳️ Picks/bans round cancelled${args.gameName ? ` for ${args.gameName}` : ""}.`;
}

/** Streamer applied results — recap what landed in the active config. */
export function picksBansAppliedMessage(args: {
  gameName: string;
  appliedPicks: string[];
  appliedBans: string[];
}): string {
  const parts: string[] = [`🗳️ Picks/bans applied for ${args.gameName}.`];
  if (args.appliedPicks.length > 0) {
    parts.push(`✓ ${args.appliedPicks.slice(0, 5).join(", ")}`);
  }
  if (args.appliedBans.length > 0) {
    parts.push(`✗ ${args.appliedBans.slice(0, 5).join(", ")}`);
  }
  if (args.appliedPicks.length === 0 && args.appliedBans.length === 0) {
    parts.push(`(no changes — empty results)`);
  }
  return parts.join(" · ");
}

/** Auto-apply on close — combined close + apply post since they happen together. */
export function picksBansAutoAppliedMessage(args: {
  gameName: string;
  appliedPicks: string[];
  appliedBans: string[];
}): string {
  const parts: string[] = [`🗳️ Picks/bans round closed + auto-applied for ${args.gameName}.`];
  if (args.appliedPicks.length > 0) {
    parts.push(`✓ ${args.appliedPicks.slice(0, 5).join(", ")}`);
  }
  if (args.appliedBans.length > 0) {
    parts.push(`✗ ${args.appliedBans.slice(0, 5).join(", ")}`);
  }
  if (args.appliedPicks.length === 0 && args.appliedBans.length === 0) {
    parts.push(`(no ballots — config unchanged)`);
  }
  return parts.join(" · ");
}
