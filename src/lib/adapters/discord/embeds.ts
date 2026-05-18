/**
 * Discord embed templates for cross-platform announcement events.
 * Phase 1.1 ships only the stream-live embed; subsequent PRs append
 * the round + recap templates here so the embed surface stays in one
 * file. All copy is consistent with the in-app voice (terse, branded,
 * "the shuffle" as the persistent noun).
 *
 * Per `specs/gs-pro-updates/gs-discord-cross-platform-spec.md` §Embed templates.
 */

import "server-only";
import type { DiscordEmbed } from "./adapter";

// Discord embed colors are decimal RGB ints. Picked to be readable in
// both light + dark Discord themes.
const COLOR_LIVE = 0x22c55e; // emerald green
const COLOR_ENDED = 0x6b7280; // slate gray
const COLOR_ROUND_OPEN = 0xf59e0b; // amber — "pay attention now"
const COLOR_ROUND_CLOSED = 0x6366f1; // indigo — "results landed"
const COLOR_RECAP = 0x0ea5e9; // sky blue — calm post-stream wrap

export interface StreamLiveEmbedArgs {
  streamerName: string;
  /** Public Twitch channel handle (lowercase). When set, the embed
   *  links the title to twitch.tv/<handle>. */
  twitchHandle: string | null;
  /** Human-readable game name (e.g. "Mario Kart 8 Deluxe"). */
  gameName: string | null;
  /** Public GameShuffle live page URL — viewers see queue, picks/bans,
   *  recent rolls here. */
  liveUrl: string | null;
  /** Streamer's avatar URL — shown as the embed thumbnail. */
  avatarUrl?: string | null;
  /** Session-start timestamp (ISO). Used for the embed's relative-time
   *  footer ("Started 3 min ago" — rendered Discord-side). */
  startedAt: string;
}

export function streamLiveEmbed(args: StreamLiveEmbedArgs): DiscordEmbed {
  const fields = [];
  if (args.gameName) {
    fields.push({ name: "Now playing", value: args.gameName, inline: true });
  }
  if (args.liveUrl) {
    fields.push({
      name: "Live page",
      value: `[${args.liveUrl}](https://${args.liveUrl})`,
      inline: true,
    });
  }

  const embed: DiscordEmbed = {
    title: `🔴 ${args.streamerName} is live on Twitch`,
    color: COLOR_LIVE,
    fields,
    timestamp: args.startedAt,
    footer: { text: "GameShuffle" },
  };

  if (args.twitchHandle) {
    embed.url = `https://www.twitch.tv/${args.twitchHandle}`;
    embed.description = `Watch on Twitch: https://www.twitch.tv/${args.twitchHandle}`;
  }
  if (args.avatarUrl) {
    embed.thumbnail = { url: args.avatarUrl };
  }

  return embed;
}

export { COLOR_ENDED };

// ---------------------------------------------------------------------------
// streamUpdateEmbed — game-pivot in-place edit on the live announcement.
// Fired on `active_game_changed`; keeps the original message id so the
// announcement updates rather than spamming a second post.
// ---------------------------------------------------------------------------

export interface StreamUpdateEmbedArgs extends StreamLiveEmbedArgs {
  /** Previous game name — when present, the embed shows "<old> → <new>"
   *  so viewers scrolling back see the pivot, not just a fresh "now
   *  playing" line. */
  previousGameName: string | null;
}

export function streamUpdateEmbed(args: StreamUpdateEmbedArgs): DiscordEmbed {
  const fields = [] as { name: string; value: string; inline?: boolean }[];
  if (args.gameName) {
    const value =
      args.previousGameName && args.previousGameName !== args.gameName
        ? `${args.previousGameName} → **${args.gameName}**`
        : args.gameName;
    fields.push({ name: "Now playing", value, inline: true });
  }
  if (args.liveUrl) {
    fields.push({
      name: "Live page",
      value: `[${args.liveUrl}](https://${args.liveUrl})`,
      inline: true,
    });
  }

  const embed: DiscordEmbed = {
    title: `🔴 ${args.streamerName} is live on Twitch`,
    color: COLOR_LIVE,
    fields,
    timestamp: args.startedAt,
    footer: { text: "GameShuffle" },
  };
  if (args.twitchHandle) {
    embed.url = `https://www.twitch.tv/${args.twitchHandle}`;
    embed.description = `Watch on Twitch: https://www.twitch.tv/${args.twitchHandle}`;
  }
  if (args.avatarUrl) embed.thumbnail = { url: args.avatarUrl };
  return embed;
}

// ---------------------------------------------------------------------------
// streamEndedEmbed — final in-place edit on session end. Replaces the
// "🔴 Live" framing with a calmer wrap so the channel doesn't keep
// suggesting the streamer is still live.
// ---------------------------------------------------------------------------

export interface StreamEndedEmbedArgs {
  streamerName: string;
  /** Last game played, when known. */
  gameName: string | null;
  /** Session-end ISO timestamp — drives the Discord relative-time
   *  footer ("ended 5 min ago"). */
  endedAt: string;
  avatarUrl?: string | null;
}

export function streamEndedEmbed(args: StreamEndedEmbedArgs): DiscordEmbed {
  const fields = [] as { name: string; value: string; inline?: boolean }[];
  if (args.gameName) {
    fields.push({ name: "Played", value: args.gameName, inline: true });
  }
  const embed: DiscordEmbed = {
    title: `Stream wrapped — ${args.streamerName}`,
    color: COLOR_ENDED,
    fields,
    timestamp: args.endedAt,
    footer: { text: "GameShuffle" },
  };
  if (args.avatarUrl) embed.thumbnail = { url: args.avatarUrl };
  return embed;
}

// ---------------------------------------------------------------------------
// roundOpenEmbed — fired on picks/bans open. Encourages viewers to head
// to the live page and submit their ballot before close. Pings the
// notification role only when the streamer has opted in (see adapter).
// ---------------------------------------------------------------------------

export interface RoundOpenEmbedArgs {
  streamerName: string;
  gameName: string;
  /** Public live page URL — viewers click here to vote. */
  liveUrl: string | null;
  avatarUrl?: string | null;
}

export function roundOpenEmbed(args: RoundOpenEmbedArgs): DiscordEmbed {
  const fields = [] as { name: string; value: string; inline?: boolean }[];
  fields.push({ name: "Game", value: args.gameName, inline: true });
  if (args.liveUrl) {
    fields.push({
      name: "Vote",
      value: `[${args.liveUrl}](https://${args.liveUrl})`,
      inline: true,
    });
  }
  const embed: DiscordEmbed = {
    title: `🗳️ Picks & bans open — ${args.streamerName}`,
    description:
      "Pick the tracks you want to see, ban the ones you don't. Ballots count toward the next race.",
    color: COLOR_ROUND_OPEN,
    fields,
    timestamp: new Date().toISOString(),
    footer: { text: "GameShuffle" },
  };
  if (args.avatarUrl) embed.thumbnail = { url: args.avatarUrl };
  return embed;
}

// ---------------------------------------------------------------------------
// roundClosedEmbed — fired on picks/bans close. Calls out ballot count
// so viewers who skipped see what they missed. No ping by default.
// ---------------------------------------------------------------------------

export interface RoundClosedEmbedArgs {
  streamerName: string;
  gameName: string;
  ballotCount: number;
  liveUrl: string | null;
  avatarUrl?: string | null;
}

export function roundClosedEmbed(args: RoundClosedEmbedArgs): DiscordEmbed {
  const fields = [] as { name: string; value: string; inline?: boolean }[];
  fields.push({ name: "Game", value: args.gameName, inline: true });
  fields.push({
    name: "Ballots",
    value: String(args.ballotCount),
    inline: true,
  });
  if (args.liveUrl) {
    fields.push({
      name: "Live page",
      value: `[${args.liveUrl}](https://${args.liveUrl})`,
      inline: true,
    });
  }
  const embed: DiscordEmbed = {
    title: `🏁 Picks & bans closed — ${args.streamerName}`,
    description: "Results are in. Next race spinning up.",
    color: COLOR_ROUND_CLOSED,
    fields,
    timestamp: new Date().toISOString(),
    footer: { text: "GameShuffle" },
  };
  if (args.avatarUrl) embed.thumbnail = { url: args.avatarUrl };
  return embed;
}

// ---------------------------------------------------------------------------
// recapEmbed — fired on `recap_ready` (after the post-stream payload is
// computed). Surfaces durable session stats so the channel has a
// scrollback-friendly summary of what happened.
// ---------------------------------------------------------------------------

export interface RecapEmbedArgs {
  streamerName: string;
  sessionName: string;
  durationSeconds: number;
  participantCount: number;
  shuffleCount: number;
  /** Public live page URL — opens the recap surface for the most
   *  recently ended session. */
  liveUrl: string | null;
  avatarUrl?: string | null;
  endedAt: string;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(seconds, 0)}s`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins === 0 ? `${hours}h` : `${hours}h ${remMins}m`;
}

export function recapEmbed(args: RecapEmbedArgs): DiscordEmbed {
  const fields = [
    {
      name: "Length",
      value: formatDuration(args.durationSeconds),
      inline: true,
    },
    {
      name: "Participants",
      value: String(args.participantCount),
      inline: true,
    },
    { name: "Shuffles", value: String(args.shuffleCount), inline: true },
  ];
  if (args.liveUrl) {
    fields.push({
      name: "Recap",
      value: `[${args.liveUrl}](https://${args.liveUrl})`,
      inline: false,
    });
  }
  const embed: DiscordEmbed = {
    title: `📼 Stream recap — ${args.streamerName}`,
    description: args.sessionName,
    color: COLOR_RECAP,
    fields,
    timestamp: args.endedAt,
    footer: { text: "GameShuffle" },
  };
  if (args.avatarUrl) embed.thumbnail = { url: args.avatarUrl };
  return embed;
}
