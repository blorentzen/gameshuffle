/**
 * Built-in command registrations — Spec 03 §1.
 *
 * One module per command "family" would scale better, but for the
 * v1 surface the registry fits comfortably in a single file so a
 * reader sees the full chat grammar in one place. Each registration
 * is a thin adapter that:
 *
 *   1. Pulls whatever the existing handler needs (session, module
 *      ctx, race ctx) from CmdContext.
 *   2. Calls the existing handler.
 *
 * Handlers themselves stay in their family modules (shuffle.ts,
 * participants.ts, race.ts, etc.) so the migration is metadata-only
 * — the actual chat behavior is unchanged from M1.
 *
 * Canonical names are space-separated per Spec 03's "no hyphenated
 * multi-word command names exist" acceptance criterion. Each entry
 * declares its legacy hyphenated alias (e.g. `!gs-market-open`) so
 * existing chatters / docs don't break overnight.
 */

import "server-only";
import { sendChatMessage } from "@/lib/twitch/client";
import { findTwitchSessionForUser } from "@/lib/sessions/twitch-platform";
import { getLiveUrlForUser } from "@/lib/twitch/streamerSlug";
import { getSessionModule } from "@/lib/modules/store";
import {
  handleShuffleCommand,
  type ShuffleContext,
} from "./shuffle";
import {
  handleJoinCommand,
  handleLeaveCommand,
  handleLobbyCommand,
  handleMyComboCommand,
} from "./participants";
import { handleClearCommand, handleKickCommand } from "./moderation";
import {
  handlePickCommand,
  handlePicksListCommand,
  handlePickResetCommand,
} from "@/lib/modules/picks";
import {
  handleBanCommand,
  handleBansListCommand,
  handleBanResetCommand,
} from "@/lib/modules/bans";
import {
  handleItemsCommand,
  handleRaceCommand,
  handleRallyCommand,
  handleTrackCommand,
  type RaceCommandContext,
} from "./race";
import {
  handlePicksOpenCommand,
  handlePicksCloseCommand,
} from "./picksBans";
import {
  handleAwardCommand,
  handleBetCommand,
  handleBountyAwardCommand,
  handleBountyCancelCommand,
  handleBountyOpenCommand,
  handleGiveCommand,
  handleLeaderboardCommand,
  handleMarketCloseCommand,
  handleMarketLockCommand,
  handleMarketOpenCommand,
  handleResolveCommand,
  handleTokensCommand,
} from "./economy";
import { liveLinkMessage } from "./messages";
import { renderHelp } from "./helpRenderer";
import { registerCommand, type CmdContext } from "./registry";

// ---------------------------------------------------------------------------
// Shared adapters
// ---------------------------------------------------------------------------

/**
 * Construct the ShuffleContext shape from a CmdContext. The chat-
 * side shuffle / economy handlers take this subset — CmdContext is
 * already a superset so the adapter is a structural extract.
 */
function asShuffleCtx(cmd: CmdContext): ShuffleContext {
  return {
    userId: cmd.userId,
    broadcasterTwitchId: cmd.broadcasterTwitchId,
    senderTwitchId: cmd.senderTwitchId,
    senderLogin: cmd.senderLogin,
    senderDisplayName: cmd.senderDisplayName,
    isBroadcaster: cmd.isBroadcaster,
    botTwitchId: cmd.botTwitchId,
    overlayToken: cmd.overlayToken ?? null,
  };
}

function asRaceCtx(cmd: CmdContext): RaceCommandContext {
  return {
    userId: cmd.userId,
    broadcasterTwitchId: cmd.broadcasterTwitchId,
    senderTwitchId: cmd.senderTwitchId,
    senderDisplayName: cmd.senderDisplayName,
    botTwitchId: cmd.botTwitchId,
  };
}

interface ResolvedSession {
  id: string;
  randomizer_slug: string | null;
}

/** Look up the streamer's active or test session. Returns null when
 *  no session is live — module commands silently no-op in that case
 *  per the existing pattern. */
async function loadActiveSession(userId: string): Promise<ResolvedSession | null> {
  const session = await findTwitchSessionForUser(userId, ["active", "test"]);
  if (!session) return null;
  return { id: session.id, randomizer_slug: session.randomizer_slug };
}

/**
 * Module-aware session resolve. Used by the picks/bans/race
 * registrations: returns null + posts an admin nudge if no session
 * is live AND the caller is the broadcaster (so the streamer
 * actually sees a hint when they try a module command outside a
 * session). Viewers + mods get silent ignore — keeps chat clean.
 */
async function loadActiveSessionForModule(
  cmd: CmdContext,
): Promise<ResolvedSession | null> {
  const session = await loadActiveSession(cmd.userId);
  if (session) return session;
  if (cmd.isBroadcaster) {
    await sendChatMessage({
      broadcasterId: cmd.broadcasterTwitchId,
      senderId: cmd.botTwitchId,
      message: "🎲 No active session — start one from your dashboard before using module commands.",
    });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Core / lifecycle
// ---------------------------------------------------------------------------

registerCommand({
  name: "gs",
  trigger: ["gs"],
  actor: "everyone",
  surface: ["chat"],
  economy: "none",
  category: "core",
  family: "core",
  minAuthority: "viewer",
  vipOnly: false,
  help: {
    summary: "What is GameShuffle? Get the one-liner.",
    usage: "!gs",
  },
  handler: async (cmd) => {
    await sendChatMessage({
      broadcasterId: cmd.broadcasterTwitchId,
      senderId: cmd.botTwitchId,
      message: "🎲 GameShuffle randomizes your loadout each round. Type !gs help for commands.",
    });
    return { ok: true };
  },
});

registerCommand({
  name: "gs.help",
  trigger: ["gs", "help"],
  aliases: [["help"]],
  actor: "everyone",
  surface: ["chat"],
  economy: "none",
  category: "core",
  family: "core",
  minAuthority: "viewer",
  vipOnly: false,
  help: {
    summary: "List commands for your role.",
    usage: "!gs help [topic]",
    detail: "With a topic, prints that command's usage + detail.",
  },
  handler: async (cmd) => {
    const message = await renderHelp({
      callerTier: cmd.callerTier,
      topic: cmd.args.trim() || null,
      streamerSlug: cmd.streamerSlug ?? null,
    });
    await sendChatMessage({
      broadcasterId: cmd.broadcasterTwitchId,
      senderId: cmd.botTwitchId,
      message,
    });
    return { ok: true };
  },
});

registerCommand({
  name: "gs.live",
  trigger: ["gs", "live"],
  aliases: [["live"]],
  actor: "everyone",
  surface: ["chat"],
  economy: "none",
  category: "core",
  family: "core",
  minAuthority: "viewer",
  vipOnly: false,
  help: {
    summary: "Link to the streamer's live GameShuffle page.",
    usage: "!gs live",
  },
  handler: async (cmd) => {
    const liveUrl = await getLiveUrlForUser(cmd.userId).catch(() => null);
    await sendChatMessage({
      broadcasterId: cmd.broadcasterTwitchId,
      senderId: cmd.botTwitchId,
      message: liveLinkMessage(liveUrl),
    });
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// Randomizer lifecycle
// ---------------------------------------------------------------------------

registerCommand({
  name: "gs.shuffle",
  trigger: ["gs", "shuffle"],
  aliases: [["gs-shuffle"], ["shuffle"]],
  actor: "everyone",
  surface: ["chat"],
  economy: "none",
  category: "lifecycle",
  family: "play",
  minAuthority: "viewer",
  vipOnly: false,
  help: {
    summary: "Roll a fresh kart loadout.",
    usage: "!gs shuffle",
    detail: "Rolls the caller's own combo. Broadcaster shuffles instantly; viewers may be cooldown-gated.",
  },
  handler: async (cmd) => {
    await handleShuffleCommand(asShuffleCtx(cmd));
    return { ok: true };
  },
});

registerCommand({
  name: "gs.join",
  trigger: ["gs", "join"],
  aliases: [["gs-join"], ["join"]],
  actor: "everyone",
  surface: ["chat"],
  economy: "none",
  category: "lifecycle",
  family: "play",
  minAuthority: "viewer",
  vipOnly: false,
  help: {
    summary: "Join the active lobby.",
    usage: "!gs join",
  },
  handler: async (cmd) => {
    await handleJoinCommand({
      userId: cmd.userId,
      broadcasterTwitchId: cmd.broadcasterTwitchId,
      senderTwitchId: cmd.senderTwitchId,
      senderLogin: cmd.senderLogin,
      senderDisplayName: cmd.senderDisplayName,
      isBroadcaster: cmd.isBroadcaster,
      botTwitchId: cmd.botTwitchId,
      overlayToken: cmd.overlayToken ?? null,
    });
    return { ok: true };
  },
});

registerCommand({
  name: "gs.leave",
  trigger: ["gs", "leave"],
  aliases: [["gs-leave"], ["leave"]],
  actor: "everyone",
  surface: ["chat"],
  economy: "none",
  category: "lifecycle",
  family: "play",
  minAuthority: "viewer",
  vipOnly: false,
  help: {
    summary: "Leave the lobby.",
    usage: "!gs leave",
  },
  handler: async (cmd) => {
    await handleLeaveCommand({
      userId: cmd.userId,
      broadcasterTwitchId: cmd.broadcasterTwitchId,
      senderTwitchId: cmd.senderTwitchId,
      senderLogin: cmd.senderLogin,
      senderDisplayName: cmd.senderDisplayName,
      isBroadcaster: cmd.isBroadcaster,
      botTwitchId: cmd.botTwitchId,
      overlayToken: cmd.overlayToken ?? null,
    });
    return { ok: true };
  },
});

registerCommand({
  name: "gs.mycombo",
  trigger: ["gs", "mycombo"],
  aliases: [["gs-mycombo"], ["mycombo"]],
  actor: "everyone",
  surface: ["chat"],
  economy: "none",
  category: "lifecycle",
  family: "play",
  minAuthority: "viewer",
  vipOnly: false,
  help: {
    summary: "Show your current combo.",
    usage: "!gs mycombo",
  },
  handler: async (cmd) => {
    await handleMyComboCommand({
      userId: cmd.userId,
      broadcasterTwitchId: cmd.broadcasterTwitchId,
      senderTwitchId: cmd.senderTwitchId,
      senderLogin: cmd.senderLogin,
      senderDisplayName: cmd.senderDisplayName,
      isBroadcaster: cmd.isBroadcaster,
      botTwitchId: cmd.botTwitchId,
      overlayToken: cmd.overlayToken ?? null,
    });
    return { ok: true };
  },
});

registerCommand({
  name: "gs.lobby",
  trigger: ["gs", "lobby"],
  aliases: [["gs-lobby"], ["lobby"]],
  actor: "everyone",
  surface: ["chat"],
  economy: "none",
  category: "lifecycle",
  family: "play",
  minAuthority: "viewer",
  vipOnly: false,
  help: {
    summary: "See who's in the lobby.",
    usage: "!gs lobby",
  },
  handler: async (cmd) => {
    await handleLobbyCommand({
      userId: cmd.userId,
      broadcasterTwitchId: cmd.broadcasterTwitchId,
      senderTwitchId: cmd.senderTwitchId,
      senderLogin: cmd.senderLogin,
      senderDisplayName: cmd.senderDisplayName,
      isBroadcaster: cmd.isBroadcaster,
      botTwitchId: cmd.botTwitchId,
      overlayToken: cmd.overlayToken ?? null,
    });
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------

registerCommand({
  name: "gs.kick",
  trigger: ["gs", "kick"],
  aliases: [["gs-kick"]],
  actor: "crew",
  surface: ["chat"],
  economy: "none",
  category: "moderation",
  family: "mod",
  minAuthority: "mod",
  vipOnly: false,
  help: {
    summary: "Kick a viewer from the lobby (mods + host).",
    usage: "!gs kick @user [minutes]",
  },
  handler: async (cmd) => {
    await handleKickCommand(
      {
        userId: cmd.userId,
        broadcasterTwitchId: cmd.broadcasterTwitchId,
        botTwitchId: cmd.botTwitchId,
      },
      cmd.args,
    );
    return { ok: true };
  },
});

registerCommand({
  name: "gs.clear",
  trigger: ["gs", "clear"],
  aliases: [["gs-clear"], ["clear"]],
  actor: "crew",
  surface: ["chat"],
  economy: "none",
  category: "moderation",
  family: "mod",
  minAuthority: "mod",
  vipOnly: false,
  help: {
    summary: "Clear the lobby (mods + host).",
    usage: "!gs clear",
  },
  handler: async (cmd) => {
    // Use the module-aware resolver so the broadcaster gets a
    // "no active session" hint when there's nothing to clear. Mods
    // stay silent — this avoids per-mod-tap chat spam if a mod
    // accidentally taps !gs clear before a session opens.
    const session = await loadActiveSessionForModule(cmd);
    if (!session) return { ok: false, reason: "no_session" };
    await handleClearCommand({
      userId: cmd.userId,
      broadcasterTwitchId: cmd.broadcasterTwitchId,
      botTwitchId: cmd.botTwitchId,
    });
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// Picks / Bans (module-gated)
// ---------------------------------------------------------------------------

function picksCtxFor(cmd: CmdContext, session: ResolvedSession) {
  return {
    sessionId: session.id,
    broadcasterTwitchId: cmd.broadcasterTwitchId,
    botTwitchId: cmd.botTwitchId,
    senderTwitchId: cmd.senderTwitchId,
    senderLogin: cmd.senderLogin,
    isBroadcaster: cmd.isBroadcaster,
    isModerator: cmd.isModerator,
    randomizerSlug: session.randomizer_slug,
  };
}

registerCommand({
  name: "gs.pick",
  trigger: ["gs", "pick"],
  aliases: [["gs-pick"], ["pick"]],
  actor: "everyone",
  surface: ["chat"],
  economy: "none",
  category: "picks-bans",
  family: "picks",
  minAuthority: "viewer",
  vipOnly: false,
  help: {
    summary: "Cast a pick in the current round.",
    usage: "!gs pick <option>",
  },
  handler: async (cmd) => {
    const session = await loadActiveSession(cmd.userId);
    if (!session) return { ok: false, reason: "no_session" };
    await handlePickCommand(picksCtxFor(cmd, session), cmd.args);
    return { ok: true };
  },
});

registerCommand({
  name: "gs.picks",
  trigger: ["gs", "picks"],
  aliases: [["gs-picks"], ["picks"]],
  actor: "everyone",
  surface: ["chat"],
  economy: "none",
  category: "picks-bans",
  family: "picks",
  minAuthority: "viewer",
  vipOnly: false,
  help: {
    summary: "List current picks.",
    usage: "!gs picks",
  },
  handler: async (cmd) => {
    const session = await loadActiveSession(cmd.userId);
    if (!session) return { ok: false, reason: "no_session" };
    await handlePicksListCommand(picksCtxFor(cmd, session));
    return { ok: true };
  },
});

registerCommand({
  name: "gs.pickreset",
  trigger: ["gs", "pickreset"],
  aliases: [["gs-pickreset"], ["pickreset"]],
  actor: "crew",
  surface: ["chat"],
  economy: "none",
  category: "picks-bans",
  family: "picks",
  minAuthority: "mod",
  vipOnly: false,
  help: {
    summary: "Reset picks for a target.",
    usage: "!gs pickreset [@user]",
  },
  handler: async (cmd) => {
    const session = await loadActiveSession(cmd.userId);
    if (!session) return { ok: false, reason: "no_session" };
    await handlePickResetCommand(picksCtxFor(cmd, session), cmd.args);
    return { ok: true };
  },
});

registerCommand({
  name: "gs.ban",
  trigger: ["gs", "ban"],
  aliases: [["gs-ban"], ["ban"]],
  actor: "everyone",
  surface: ["chat"],
  economy: "none",
  category: "picks-bans",
  family: "picks",
  minAuthority: "viewer",
  vipOnly: false,
  help: {
    summary: "Cast a ban in the current round.",
    usage: "!gs ban <option>",
  },
  handler: async (cmd) => {
    const session = await loadActiveSession(cmd.userId);
    if (!session) return { ok: false, reason: "no_session" };
    await handleBanCommand(picksCtxFor(cmd, session), cmd.args);
    return { ok: true };
  },
});

registerCommand({
  name: "gs.bans",
  trigger: ["gs", "bans"],
  aliases: [["gs-bans"], ["bans"]],
  actor: "everyone",
  surface: ["chat"],
  economy: "none",
  category: "picks-bans",
  family: "picks",
  minAuthority: "viewer",
  vipOnly: false,
  help: {
    summary: "List current bans.",
    usage: "!gs bans",
  },
  handler: async (cmd) => {
    const session = await loadActiveSession(cmd.userId);
    if (!session) return { ok: false, reason: "no_session" };
    await handleBansListCommand(picksCtxFor(cmd, session));
    return { ok: true };
  },
});

registerCommand({
  name: "gs.banreset",
  trigger: ["gs", "banreset"],
  aliases: [["gs-banreset"], ["banreset"]],
  actor: "crew",
  surface: ["chat"],
  economy: "none",
  category: "picks-bans",
  family: "picks",
  minAuthority: "mod",
  vipOnly: false,
  help: {
    summary: "Reset bans for a target.",
    usage: "!gs banreset [@user]",
  },
  handler: async (cmd) => {
    const session = await loadActiveSession(cmd.userId);
    if (!session) return { ok: false, reason: "no_session" };
    await handleBanResetCommand(picksCtxFor(cmd, session), cmd.args);
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// Race randomizer (host-only, gated by race_randomizer module)
// ---------------------------------------------------------------------------

async function ensureRaceModule(cmd: CmdContext): Promise<boolean> {
  // Go through the module-aware resolver so the broadcaster gets a
  // "no active session" hint when this short-circuits. Viewers /
  // mods stay silent — the chat would get spammy otherwise.
  const session = await loadActiveSessionForModule(cmd);
  if (!session) return false;
  const moduleRow = await getSessionModule({
    sessionId: session.id,
    moduleId: "race_randomizer",
    includeDisabled: false,
  });
  if (!moduleRow?.enabled) {
    // The streamer typed a race command without enabling the module —
    // post a one-liner so they know what to fix. Viewers stay silent.
    if (cmd.isBroadcaster) {
      await sendChatMessage({
        broadcasterId: cmd.broadcasterTwitchId,
        senderId: cmd.botTwitchId,
        message:
          "🏁 Race randomizer isn't enabled on this session. Streamer: turn it on in your modules dashboard.",
      });
    }
    return false;
  }
  return true;
}

registerCommand({
  name: "gs.track",
  trigger: ["gs", "track"],
  aliases: [["gs-track"], ["track"]],
  actor: "host",
  surface: ["chat"],
  economy: "none",
  category: "race",
  family: "race",
  minAuthority: "host",
  vipOnly: false,
  help: {
    summary: "Pick or randomize the next track (host).",
    usage: "!gs track [N]",
  },
  handler: async (cmd) => {
    if (!(await ensureRaceModule(cmd))) return { ok: false, reason: "race_module_off" };
    await handleTrackCommand(asRaceCtx(cmd), cmd.args);
    return { ok: true };
  },
});

registerCommand({
  name: "gs.items",
  trigger: ["gs", "items"],
  aliases: [["gs-items"], ["items"]],
  actor: "host",
  surface: ["chat"],
  economy: "none",
  category: "race",
  family: "race",
  minAuthority: "host",
  vipOnly: false,
  help: {
    summary: "Randomize item mode (host).",
    usage: "!gs items",
  },
  handler: async (cmd) => {
    if (!(await ensureRaceModule(cmd))) return { ok: false, reason: "race_module_off" };
    await handleItemsCommand(asRaceCtx(cmd), cmd.args);
    return { ok: true };
  },
});

registerCommand({
  name: "gs.race",
  trigger: ["gs", "race"],
  aliases: [["gs-race"], ["race"]],
  actor: "host",
  surface: ["chat"],
  economy: "none",
  category: "race",
  family: "race",
  minAuthority: "host",
  vipOnly: false,
  help: {
    summary: "Roll the race randomizer (host).",
    usage: "!gs race [N]",
  },
  handler: async (cmd) => {
    if (!(await ensureRaceModule(cmd))) return { ok: false, reason: "race_module_off" };
    await handleRaceCommand(asRaceCtx(cmd), cmd.args);
    return { ok: true };
  },
});

registerCommand({
  name: "gs.rally",
  trigger: ["gs", "rally"],
  aliases: [["gs-rally"]],
  actor: "host",
  surface: ["chat"],
  economy: "none",
  category: "race",
  family: "race",
  minAuthority: "host",
  vipOnly: false,
  help: {
    summary: "Roll a knockout rally (host, MKWorld).",
    usage: "!gs rally",
  },
  handler: async (cmd) => {
    if (!(await ensureRaceModule(cmd))) return { ok: false, reason: "race_module_off" };
    await handleRallyCommand(asRaceCtx(cmd));
    return { ok: true };
  },
});

registerCommand({
  name: "gs.picks.open",
  trigger: ["gs", "picks", "open"],
  aliases: [["gs-picks-open"]],
  actor: "host",
  surface: ["chat"],
  economy: "none",
  category: "picks-bans",
  family: "picks",
  minAuthority: "host",
  vipOnly: false,
  help: {
    summary: "Open a picks/bans round (host).",
    usage: "!gs picks open",
  },
  handler: async (cmd) => {
    await handlePicksOpenCommand(asRaceCtx(cmd));
    return { ok: true };
  },
});

registerCommand({
  name: "gs.picks.close",
  trigger: ["gs", "picks", "close"],
  aliases: [["gs-picks-close"]],
  actor: "host",
  surface: ["chat"],
  economy: "none",
  category: "picks-bans",
  family: "picks",
  minAuthority: "host",
  vipOnly: false,
  help: {
    summary: "Close the open picks/bans round (host).",
    usage: "!gs picks close",
  },
  handler: async (cmd) => {
    await handlePicksCloseCommand(asRaceCtx(cmd));
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// Token economy
// ---------------------------------------------------------------------------

registerCommand({
  name: "tokens",
  trigger: ["tokens"],
  actor: "everyone",
  surface: ["chat"],
  economy: "read",
  category: "tokens",
  family: "tokens",
  minAuthority: "viewer",
  vipOnly: false,
  help: {
    summary: "Check your token balance.",
    usage: "!tokens [@user]",
  },
  handler: async (cmd) => {
    await handleTokensCommand(asShuffleCtx(cmd), cmd.args);
    return { ok: true };
  },
});

registerCommand({
  name: "give",
  trigger: ["give"],
  actor: "everyone",
  surface: ["chat"],
  economy: "transfer",
  category: "tokens",
  family: "tokens",
  minAuthority: "viewer",
  vipOnly: false,
  help: {
    summary: "Send tokens to another viewer.",
    usage: "!give @user <amount>",
    detail: "Amount accepts a positive int, N% of your balance, or 'all'.",
  },
  handler: async (cmd) => {
    await handleGiveCommand(asShuffleCtx(cmd), cmd.args);
    return { ok: true };
  },
});

registerCommand({
  name: "leaderboard",
  trigger: ["leaderboard"],
  actor: "everyone",
  surface: ["chat"],
  economy: "read",
  moduleKey: "leaderboard",
  category: "tokens",
  family: "tokens",
  minAuthority: "viewer",
  vipOnly: false,
  help: {
    summary: "Top 5 token holders in this community.",
    usage: "!leaderboard",
  },
  handler: async (cmd) => {
    await handleLeaderboardCommand(asShuffleCtx(cmd));
    return { ok: true };
  },
});

registerCommand({
  name: "bet",
  trigger: ["bet"],
  actor: "everyone",
  surface: ["chat", "tactile"],
  economy: "wager",
  complianceClass: "prediction_pool",
  moduleKey: "markets",
  category: "markets",
  family: "market",
  minAuthority: "viewer",
  vipOnly: false,
  liveOnly: true,
  help: {
    summary: "Bet on the active market.",
    usage: "!bet <option> <amount>",
    detail: "Amount accepts a positive int, N% of your balance, or 'all'. Restricted regions participate as spectators (pick + badge, no stake).",
  },
  handler: async (cmd) => {
    const behavior =
      cmd.complianceBehavior === "spectator" ? "spectator" : "full";
    await handleBetCommand(asShuffleCtx(cmd), cmd.args, behavior);
    return { ok: true };
  },
});

registerCommand({
  name: "gs.market.open",
  trigger: ["gs", "market", "open"],
  aliases: [["gs-market-open"]],
  actor: "host",
  surface: ["chat"],
  economy: "none",
  complianceClass: "prediction_pool",
  moduleKey: "markets",
  category: "markets",
  family: "market",
  minAuthority: "host",
  vipOnly: false,
  liveOnly: true,
  help: {
    summary: "Open a prediction market (host).",
    usage: "!gs market open [1|3|5]",
    detail: "Optional lock timer in minutes. Defaults to 1.",
  },
  handler: async (cmd) => {
    await handleMarketOpenCommand(asShuffleCtx(cmd), cmd.args, cmd.isBroadcaster);
    return { ok: true };
  },
});

registerCommand({
  name: "gs.market.lock",
  trigger: ["gs", "market", "lock"],
  aliases: [["gs-market-lock"]],
  actor: "host",
  surface: ["chat"],
  economy: "none",
  complianceClass: "prediction_pool",
  moduleKey: "markets",
  category: "markets",
  family: "market",
  minAuthority: "host",
  vipOnly: false,
  help: {
    summary: "Lock the active market early (host).",
    usage: "!gs market lock",
  },
  handler: async (cmd) => {
    await handleMarketLockCommand(asShuffleCtx(cmd), cmd.isBroadcaster);
    return { ok: true };
  },
});

registerCommand({
  name: "gs.market.close",
  trigger: ["gs", "market", "close"],
  aliases: [["gs-market-close"]],
  actor: "host",
  surface: ["chat"],
  economy: "none",
  complianceClass: "prediction_pool",
  moduleKey: "markets",
  category: "markets",
  family: "market",
  minAuthority: "host",
  vipOnly: false,
  help: {
    summary: "Cancel the active market + refund (host).",
    usage: "!gs market close",
  },
  handler: async (cmd) => {
    await handleMarketCloseCommand(asShuffleCtx(cmd), cmd.isBroadcaster);
    return { ok: true };
  },
});

registerCommand({
  name: "gs.resolve",
  trigger: ["gs", "resolve"],
  aliases: [["gs-resolve"]],
  actor: "host",
  surface: ["chat"],
  economy: "none",
  complianceClass: "prediction_pool",
  moduleKey: "markets",
  category: "markets",
  family: "market",
  minAuthority: "host",
  vipOnly: false,
  help: {
    summary: "Resolve the locked market (host).",
    usage: "!gs resolve <value>",
    detail: "For placement markets pass a positive integer; for binary/pickone, the winning option key.",
  },
  handler: async (cmd) => {
    await handleResolveCommand(asShuffleCtx(cmd), cmd.args, cmd.isBroadcaster);
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// Streamer→viewer mint flows (Spec 01 §3.10 + Spec 02 §8a)
// ---------------------------------------------------------------------------

registerCommand({
  name: "gs.award",
  trigger: ["gs", "award"],
  aliases: [["gs-award"]],
  actor: "host",
  surface: ["chat"],
  economy: "earn",
  moduleKey: "award",
  category: "tokens",
  family: "tokens",
  minAuthority: "host",
  vipOnly: false,
  help: {
    summary: "Discretionary award to a viewer (host).",
    usage: "!gs award @user <amount>",
    detail: "Mints from your monthly allowance directly into the viewer's balance. Rejected if allowance is exhausted or you have no paid tier.",
  },
  handler: async (cmd) => {
    await handleAwardCommand(asShuffleCtx(cmd), cmd.args, cmd.isBroadcaster);
    return { ok: true };
  },
});

// `!gs bounty award @user` and `!gs bounty cancel` are registered
// BEFORE the catch-all `!gs bounty <amount> <description>` so the
// dispatcher's path resolver matches the subnoun forms first; the
// open form receives anything else as args.
registerCommand({
  name: "gs.bounty.award",
  trigger: ["gs", "bounty", "award"],
  aliases: [["gs-bounty-award"]],
  actor: "host",
  surface: ["chat"],
  economy: "earn",
  moduleKey: "bounty",
  category: "tokens",
  family: "tokens",
  minAuthority: "host",
  vipOnly: false,
  help: {
    summary: "Pay out the open bounty to a viewer (host).",
    usage: "!gs bounty award @user",
  },
  handler: async (cmd) => {
    await handleBountyAwardCommand(asShuffleCtx(cmd), cmd.args, cmd.isBroadcaster);
    return { ok: true };
  },
});

registerCommand({
  name: "gs.bounty.cancel",
  trigger: ["gs", "bounty", "cancel"],
  aliases: [["gs-bounty-cancel"]],
  actor: "host",
  surface: ["chat"],
  economy: "none",
  moduleKey: "bounty",
  category: "tokens",
  family: "tokens",
  minAuthority: "host",
  vipOnly: false,
  help: {
    summary: "Release the open bounty (host).",
    usage: "!gs bounty cancel",
  },
  handler: async (cmd) => {
    await handleBountyCancelCommand(asShuffleCtx(cmd), cmd.isBroadcaster);
    return { ok: true };
  },
});

registerCommand({
  name: "gs.bounty",
  trigger: ["gs", "bounty"],
  aliases: [["gs-bounty"]],
  actor: "host",
  surface: ["chat"],
  economy: "earn",
  moduleKey: "bounty",
  category: "tokens",
  family: "tokens",
  minAuthority: "host",
  vipOnly: false,
  liveOnly: true,
  help: {
    summary: "Open an outcome-pegged bounty (host).",
    usage: "!gs bounty <amount> <description>",
    detail: "Reserves the amount against your monthly allowance. Pay out with !gs bounty award @user, or release with !gs bounty cancel.",
  },
  handler: async (cmd) => {
    await handleBountyOpenCommand(asShuffleCtx(cmd), cmd.args, cmd.isBroadcaster);
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// !lurk — Tier 2 logic command (Spec 03 §2.2)
// ---------------------------------------------------------------------------

import { setLurk } from "./lurkState";
import {
  resolveIdentity,
} from "@/lib/economy/identity";
import { ensureCommunity } from "@/lib/economy/community";

registerCommand({
  name: "lurk",
  trigger: ["lurk"],
  actor: "everyone",
  surface: ["chat"],
  economy: "none",
  moduleKey: "lurk",
  category: "social",
  family: "community",
  minAuthority: "viewer",
  vipOnly: false,
  communityType: "info",
  cooldownSeconds: 10,
  help: {
    summary: "Signal that you're lurking — bot welcomes you back on return.",
    usage: "!lurk",
    detail: "Records you as lurking. Your next chat message in this community triggers a 'welcome back' from the bot.",
  },
  handler: async (cmd) => {
    if (!cmd.streamerSlug) return { ok: false, reason: "no_slug" };
    const caller = await resolveIdentity({
      platform: "twitch",
      platformId: cmd.senderTwitchId,
      displayName: cmd.senderDisplayName,
    });
    // Resolve community by slug; if missing, the streamer hasn't
    // had any economy activity yet and we can't pin lurk state.
    const community = await (
      await import("@/lib/economy/community")
    ).getCommunityBySlug(cmd.streamerSlug);
    if (!community) {
      await sendChatMessage({
        broadcasterId: cmd.broadcasterTwitchId,
        senderId: cmd.botTwitchId,
        message: `🫥 @${cmd.senderDisplayName}, lurk noted — see you when you come back!`,
      });
      return { ok: true };
    }
    await setLurk({
      identityId: caller.identityId,
      communityId: community.id,
    });
    await sendChatMessage({
      broadcasterId: cmd.broadcasterTwitchId,
      senderId: cmd.botTwitchId,
      message: `🫥 @${cmd.senderDisplayName} is lurking — bot will welcome you back!`,
    });
    return { ok: true };
  },
});

// Avoid unused-import warnings while the helpers are wired for the
// command body above.
void ensureCommunity;

// ---------------------------------------------------------------------------
// Custom commands management (host-only)
// ---------------------------------------------------------------------------

import {
  deleteCustomCommand,
  resolveCommunityForCallerSlug,
  upsertCustomCommand,
} from "./customCommands";

registerCommand({
  name: "commands",
  trigger: ["commands"],
  actor: "host",
  surface: ["chat"],
  economy: "none",
  moduleKey: "custom_commands",
  category: "custom",
  family: "commands_admin",
  minAuthority: "host",
  vipOnly: false,
  help: {
    summary: "Manage custom commands (host).",
    usage: "!commands add|edit|delete|list <trigger> [response]",
    detail: "Add: !commands add !socials https://twitch.tv/me · Edit: !commands edit !socials <text> · Delete: !commands delete !socials · List: !commands list",
  },
  handler: async (cmd) => {
    const trimmed = cmd.args.trim();
    if (!trimmed) {
      await sendChatMessage({
        broadcasterId: cmd.broadcasterTwitchId,
        senderId: cmd.botTwitchId,
        message: "🎲 Usage: !commands add|edit|delete|list <trigger> [response]",
      });
      return { ok: false, reason: "no_args" };
    }
    const [subcommand, ...rest] = trimmed.split(/\s+/);
    const community = await resolveCommunityForCallerSlug(cmd.streamerSlug ?? null);
    if (!community) {
      await sendChatMessage({
        broadcasterId: cmd.broadcasterTwitchId,
        senderId: cmd.botTwitchId,
        message: "🎲 Couldn't resolve your community — try again in a moment.",
      });
      return { ok: false, reason: "no_community" };
    }

    if (subcommand === "add" || subcommand === "edit") {
      const [triggerArg, ...responseParts] = rest;
      if (!triggerArg || responseParts.length === 0) {
        await sendChatMessage({
          broadcasterId: cmd.broadcasterTwitchId,
          senderId: cmd.botTwitchId,
          message: `🎲 Usage: !commands ${subcommand} <trigger> <response>`,
        });
        return { ok: false, reason: "missing_args" };
      }
      const result = await upsertCustomCommand({
        communityId: community.id,
        trigger: triggerArg,
        responseTmpl: responseParts.join(" "),
      });
      const verb = subcommand === "add" ? "Saved" : "Updated";
      const reply = result.ok
        ? `🎲 ${verb} ${triggerArg.startsWith("!") ? triggerArg : "!" + triggerArg}.`
        : `🎲 Couldn't save (${result.reason ?? "unknown"}).`;
      await sendChatMessage({
        broadcasterId: cmd.broadcasterTwitchId,
        senderId: cmd.botTwitchId,
        message: reply,
      });
      return { ok: result.ok, reason: result.reason };
    }

    if (subcommand === "delete" || subcommand === "remove") {
      const [triggerArg] = rest;
      if (!triggerArg) {
        await sendChatMessage({
          broadcasterId: cmd.broadcasterTwitchId,
          senderId: cmd.botTwitchId,
          message: "🎲 Usage: !commands delete <trigger>",
        });
        return { ok: false, reason: "missing_trigger" };
      }
      const result = await deleteCustomCommand({
        communityId: community.id,
        trigger: triggerArg,
      });
      const reply = result.ok
        ? `🎲 Deleted ${triggerArg.startsWith("!") ? triggerArg : "!" + triggerArg}.`
        : `🎲 Couldn't delete (${result.reason ?? "unknown"}).`;
      await sendChatMessage({
        broadcasterId: cmd.broadcasterTwitchId,
        senderId: cmd.botTwitchId,
        message: reply,
      });
      return { ok: result.ok, reason: result.reason };
    }

    if (subcommand === "list") {
      // List is a hint that the manage UI exists; chat is too small
      // for an itemized listing. !help renders them as part of the
      // category view, so we point chatters there.
      await sendChatMessage({
        broadcasterId: cmd.broadcasterTwitchId,
        senderId: cmd.botTwitchId,
        message: "🎲 See !help — custom commands appear under their category. The dashboard at /twitch has the full editor.",
      });
      return { ok: true };
    }

    await sendChatMessage({
      broadcasterId: cmd.broadcasterTwitchId,
      senderId: cmd.botTwitchId,
      message: "🎲 !commands add|edit|delete|list",
    });
    return { ok: false, reason: "unknown_subcommand" };
  },
});

// Required for the module to count as a true side-effect import (no
// emit of any exported value, just the registration runs above).
export const __REGISTERED__ = true;

// Side-effect: load seed library + Event System + custom commands.
// Order matters only insofar as each can register new entries; if
// any collide with built-ins above, registration throws — which we
// want, because that surfaces the conflict at boot rather than
// silently overriding chat behavior.
//
// Custom commands per community are loaded lazily by the dispatcher
// helper `loadCustomCommandsForCommunity(community.id)` — the seed
// library + Event System, by contrast, ship statically.
import "./seedLibrary";
import "./eventCommands";
