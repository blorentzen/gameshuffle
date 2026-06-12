/**
 * Per-platform formatters for outbound domain events — Spec 02 §4.
 *
 * Each `DomainEventType` registers a Twitch (chat-line) + Discord
 * (rich embed) formatter. The publisher picks the right one based on
 * `policy.targets[]` and calls the platform's adapter method
 * (`postChatMessage` / `postAnnouncement`).
 *
 * A formatter may return `null` for a given platform — that leg is
 * skipped at routing time. Today every formatter returns content for
 * both platforms; the `null` escape hatch is for future events where
 * one surface doesn't have a natural rendering.
 *
 * Why this file is separate from `publisher.ts`:
 *   1. Pure-function tests can assert formatter output without
 *      mocking the adapter layer (see scripts/test-fanout-publisher.ts).
 *   2. Future per-streamer formatter overrides (custom copy, brand
 *      voice) layer cleanly here without touching the publisher.
 *   3. Adding a new event variant is two file edits — `types.ts`
 *      (catalog) + `formatters.ts` — instead of three.
 */

import type { AnnouncementContent } from "@/lib/adapters/types";
import type { DomainEvent, DomainEventType } from "./types";

// ---------------------------------------------------------------------------
// Formatter contract
// ---------------------------------------------------------------------------

interface EventFormatter<T extends DomainEvent["type"]> {
  twitch: (event: Extract<DomainEvent, { type: T }>) => string | null;
  discord: (event: Extract<DomainEvent, { type: T }>) => AnnouncementContent | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Render the lock-time string as a short relative window when
 * available (e.g. "locks in 3m"). Falls back to a literal absent
 * marker so the formatter doesn't crash on null lockAt.
 *
 * Exported for test coverage — Spec 02 §4 calls out sane defaults
 * + readable copy as load-bearing for streamer trust.
 */
export function lockWindow(lockAtIso: string | null): string {
  if (!lockAtIso) return "locks on host signal";
  const lockMs = Date.parse(lockAtIso);
  if (!Number.isFinite(lockMs)) return "locks on host signal";
  const deltaSec = Math.round((lockMs - Date.now()) / 1000);
  if (deltaSec <= 0) return "locks now";
  if (deltaSec < 60) return `locks in ${deltaSec}s`;
  if (deltaSec < 3600) return `locks in ${Math.round(deltaSec / 60)}m`;
  return `locks in ${Math.round(deltaSec / 3600)}h`;
}

// ---------------------------------------------------------------------------
// Per-event-type formatters
// ---------------------------------------------------------------------------

export const FORMATTERS: {
  [T in DomainEventType]: EventFormatter<T>;
} = {
  lobby_joined: {
    // Default policy is silent; this formatter only fires when a
    // streamer overrides to targets:["discord"] or similar. A short
    // line keeps the per-join cadence tolerable if they DO opt in.
    twitch: (e) =>
      `🎲 ${e.payload.participant.displayName} joined the lobby (${e.payload.lobbySize} in).`,
    discord: (e) => ({
      title: "Lobby update",
      body: `${e.payload.participant.displayName} joined (${e.payload.lobbySize} in).`,
    }),
  },
  lobby_left: {
    twitch: (e) =>
      `🎲 ${e.payload.participant.displayName} left the lobby (${e.payload.lobbySize} remaining).`,
    discord: (e) => ({
      title: "Lobby update",
      body: `${e.payload.participant.displayName} left (${e.payload.lobbySize} remaining).`,
    }),
  },
  market_opened: {
    twitch: (e) =>
      `📈 New market — "${e.payload.question}" — ${lockWindow(e.payload.lockAt)}. Type !bet <option> <amount> to wager.`,
    discord: (e) => ({
      title: "Market open",
      body: e.payload.question,
      fields: e.payload.outcomes.map((o) => ({
        label: o.label,
        value: `!bet ${o.key}`,
      })),
    }),
  },
  market_locked: {
    twitch: (e) =>
      `🔒 Market locked — "${e.payload.question}". ${e.payload.totalStaked} tokens at stake.`,
    discord: (e) => ({
      title: "Market locked",
      body: e.payload.question,
      fields: [
        { label: "Total staked", value: `${e.payload.totalStaked} tokens` },
      ],
    }),
  },
  market_resolved: {
    twitch: (e) =>
      `🏁 Market resolved — "${e.payload.question}" → ${e.payload.winningOutcomeLabel}. ${e.payload.payoutCount} viewers paid ${e.payload.payoutTotal} tokens.`,
    discord: (e) => ({
      title: "Market resolved",
      body: e.payload.question,
      fields: [
        { label: "Winner", value: e.payload.winningOutcomeLabel },
        { label: "Payouts", value: `${e.payload.payoutCount} viewers` },
        { label: "Distributed", value: `${e.payload.payoutTotal} tokens` },
      ],
    }),
  },
  bounty_opened: {
    twitch: (e) =>
      `🎯 Bounty open: ${e.payload.amount} tokens — ${e.payload.description}`,
    discord: (e) => ({
      title: "Bounty open",
      body: e.payload.description,
      fields: [{ label: "Reward", value: `${e.payload.amount} tokens` }],
    }),
  },
  session_scheduled: {
    // Default policy is discord-only — the formatter still ships a
    // Twitch line so an override that adds twitch (e.g. for a "next
    // session" auto-reminder during the current stream) works
    // without needing to plumb a new formatter.
    twitch: (e) => {
      const when = new Date(e.payload.startAt).toLocaleString();
      const tail =
        e.payload.openMode === "auto_open"
          ? " — lobby auto-opens at start."
          : "";
      return `📅 Next GameShuffle session: ${when}.${tail}`;
    },
    discord: (e) => ({
      title: "Session scheduled",
      body:
        e.payload.description ??
        "A new GameShuffle session is on the calendar.",
      fields: [
        {
          label: "Starts",
          value: new Date(e.payload.startAt).toLocaleString(),
        },
        {
          label: "Open mode",
          value:
            e.payload.openMode === "auto_open"
              ? "Auto-open lobby"
              : "Manual open by host",
        },
      ],
    }),
  },
  session_opened: {
    twitch: (e) => {
      const slug = e.payload.randomizerSlug;
      const tail = slug ? ` (${slug})` : "";
      return `🎲 Lobby open${tail} — type !gs join to claim a slot.`;
    },
    discord: (e) => ({
      title: "Lobby open",
      body: "GameShuffle lobby is open — jump into chat to join.",
      fields: e.payload.randomizerSlug
        ? [{ label: "Game", value: e.payload.randomizerSlug }]
        : undefined,
    }),
  },
};
