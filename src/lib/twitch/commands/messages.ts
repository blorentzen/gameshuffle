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

/** Join-confirmation chat reply. Appends the live URL when known — the
 *  join moment is peak intent (viewer just opted in) and the live page
 *  is where they see their queue position, vote on picks/bans, and
 *  track everyone else's combos.
 *
 *  `liveUrl` can be null (slug not resolvable, transient lookup failure
 *  during a burst, etc.) — message degrades to the join-only line. */
export function joinMessage(
  displayName: string,
  count: number,
  cap: number,
  liveUrl?: string | null,
): string {
  const base = pickRandom(JOIN_VARIANTS)(displayName, count, cap);
  if (!liveUrl) return base;
  return `${base} · See your spot + vote on picks/bans: ${liveUrl}`;
}

export function leaveMessage(displayName: string): string {
  return pickRandom(LEAVE_VARIANTS)(displayName);
}

export function shuffleResultMessage(displayName: string, comboText: string): string {
  return `🎲 @${displayName} drew: ${comboText}`;
}

export function wheelSpinResultMessage(label: string): string {
  return `🎡 The wheel landed on: ${label}!`;
}

export function wheelNoSetupMessage(reason: "no_wheel" | "empty_wheel"): string {
  return reason === "empty_wheel"
    ? `🎡 Your wheel has no segments yet — add some at gameshuffle.co/account?tab=wheels`
    : `🎡 No wheel set up yet — build one at gameshuffle.co/account?tab=wheels`;
}

export function wheelAddedMessage(displayName: string, label: string, count: number, max: number): string {
  return `🎡 @${displayName} added "${label}" to the wheel (${count}/${max}).`;
}

export function wheelDuplicateMessage(displayName: string, label: string): string {
  return `@${displayName}, "${label}" is already on the wheel.`;
}

export function wheelFullMessage(): string {
  return `🎡 The wheel's full — no more entries right now.`;
}

export function wheelPerViewerLimitMessage(displayName: string): string {
  return `@${displayName}, you've already added your entry to the wheel.`;
}

export function wheelAddUsageMessage(): string {
  return `Usage: !wheel add <option>`;
}

export function wheelRemovedMessage(displayName: string, label: string): string {
  return `🎡 @${displayName} removed "${label}" from the wheel.`;
}

export function wheelRemoveMissMessage(displayName: string): string {
  return `@${displayName}, couldn't find that entry to remove.`;
}

export function wheelRemoveUsageMessage(): string {
  return `Usage: !wheel remove <option>`;
}

export function wheelListMessage(labels: string[]): string {
  if (labels.length === 0) return `🎡 No viewer entries on the wheel yet — add one with !wheel add <option>`;
  return `🎡 On the wheel: ${labels.join(", ")}`;
}

export function wheelClearedMessage(): string {
  return `🎡 Viewer entries cleared from the wheel.`;
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
  /** Live URL — appended so the viewer who spent points + others can
   *  watch the combo land on the live page. Peak engagement moment. */
  liveUrl?: string | null;
}): string {
  const base = `🎲 @${args.viewerDisplayName} rerolled the streamer — @${args.streamerDisplayName} drew: ${args.comboText}`;
  if (!args.liveUrl) return base;
  return `${base} · See it live: ${args.liveUrl}`;
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

/** Direct response to `!gs-live` — viewer asked for the link, give it
 *  to them with minimal framing. Falls back to a friendly nudge when
 *  the streamer slug isn't resolvable. */
export function liveLinkMessage(liveUrl: string | null): string {
  if (!liveUrl) {
    return `🎲 Live page isn't set up yet — streamer can finish onboarding at gameshuffle.co/account.`;
  }
  return `🎲 GameShuffle live page: ${liveUrl} — votes, queue, recent rolls, all in one spot.`;
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
  /** Live URL — appended so viewers can see how the vote landed.
   *  Closed-round results are visible on the live page even after
   *  voting ends, so this is a meaningful conversion point. */
  liveUrl?: string | null;
}): string {
  let body: string;
  if (args.ballotCount === 0) {
    body = `🗳️ Picks/bans round closed for ${args.gameName} — no ballots locked in.`;
  } else {
    body = `🗳️ Picks/bans round closed for ${args.gameName} — ${args.ballotCount} ballot${args.ballotCount === 1 ? "" : "s"} in. Streamer's reviewing the top picks.`;
  }
  if (!args.liveUrl) return body;
  return `${body} · Results: ${args.liveUrl}`;
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
