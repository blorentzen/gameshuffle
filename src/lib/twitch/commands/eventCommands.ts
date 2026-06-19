/**
 * Event System chat handlers — Spec 04 §3 (`!chaos`) + §4 (`!random`).
 *
 *   - `!chaos`  — viewer-paid disruption. Cost is in the platform
 *                 band [chaos_price_min, chaos_price_max] (50–200
 *                 by default); per-community price defaults to
 *                 `chaos_price_default` until Spec 06 module
 *                 registry ships per-community config. The cost is
 *                 burned (`chaos_burn` type) — destroyed, never paid
 *                 to the streamer.
 *
 *   - `!random` — free user-fire ambient surprise. System-fired
 *                 firings come through the same engine with
 *                 `trigger='system'`.
 */

import "server-only";
import { fireEvent } from "@/lib/economy/events/engine";
import { spend } from "@/lib/economy/tokens";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  resolveEconomyContext,
  type EconomyContext,
} from "./economy";
import { TwitchAdapter } from "@/lib/adapters/twitch";
import { registerCommand, type CmdContext } from "./registry";
import type { ShuffleContext } from "./shuffle";

// Map a CmdContext to the legacy ShuffleContext that
// resolveEconomyContext expects. Identical to the helper in
// houseGameCommands.ts before that file was excised — kept inline
// here to avoid resurrecting a deleted module.
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

function adapterFor(cmd: CmdContext, econ: EconomyContext): TwitchAdapter {
  return new TwitchAdapter({
    sessionId: econ.activeSessionId ?? "no-session",
    ownerUserId: cmd.userId,
  });
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

async function readConfigValue(key: string, fallback: number): Promise<number> {
  const admin = createServiceClient();
  const { data } = await admin.rpc("gs_economy_config_value", {
    p_key: key,
    p_default: fallback,
  });
  return Number(data ?? fallback);
}

async function chaosPriceForCommunity(): Promise<{
  price: number;
  min: number;
  max: number;
}> {
  // Until Spec 06 module registry ships per-community config, the
  // default applies to every community. The handler still validates
  // against the platform [min, max] band.
  const [min, max, deflt] = await Promise.all([
    readConfigValue("chaos_price_min", 50),
    readConfigValue("chaos_price_max", 200),
    readConfigValue("chaos_price_default", 100),
  ]);
  // Clamp default into the band defensively.
  const clamped = Math.max(min, Math.min(max, deflt));
  return { price: clamped, min, max };
}

// ---------------------------------------------------------------------------
// !chaos — viewer-paid disruption
// ---------------------------------------------------------------------------

registerCommand({
  name: "chaos",
  trigger: ["chaos"],
  actor: "everyone",
  surface: ["chat"],
  economy: "spend",
  // No compliance class — Spec 04 + 07 §3 explicitly call chaos
  // `none`-classed (closed-loop, no wager).
  moduleKey: "chaos",
  category: "events",
  family: "community",
  minAuthority: "viewer",
  vipOnly: false,
  communityType: "fun",
  cooldownSeconds: 30,
  help: {
    summary: "Trigger a disruption event. Costs tokens.",
    usage: "!chaos",
    detail: "Burns the chaos price into the void. The streamer's balance is not affected. Draws from the chaos-event deck for the current game.",
  },
  handler: async (cmd) => {
    const econ = await resolveEconomyContext(asShuffleCtx(cmd));
    if (!econ) return { ok: false, reason: "no_economy" };
    const adapter = adapterFor(cmd, econ);

    const { price } = await chaosPriceForCommunity();

    // Burn the cost. spend() rejects atomically on insufficient
    // balance.
    const burn = await spend({
      identityId: econ.caller.id,
      amount: price,
      type: "chaos_burn",
      ctx: {
        communityId: econ.community.id,
        streamId: econ.activeStreamId,
        sessionId: econ.activeSessionId,
        meta: { source: "event", trigger: "chat", event_kind: "chaos" },
      },
    });
    if (!burn.ok) {
      if (burn.reason === "insufficient_balance") {
        await adapter.postChatMessage(
          `🎲 @${cmd.senderDisplayName}, chaos costs ${price}🪙 — you only have ${burn.balance}.`,
        );
      } else {
        await adapter.postChatMessage(
          `🎲 Couldn't fire chaos (${burn.reason ?? "unknown"}).`,
        );
      }
      return { ok: false, reason: burn.reason };
    }

    const gameKey = econ.activeGameSlug
      ? canonicalizeGameKey(econ.activeGameSlug)
      : null;
    const fired = await fireEvent({
      surface: "chaos",
      gameKey,
      actorIdentityId: econ.caller.id,
      actorDisplayName: econ.caller.display_name ?? cmd.senderDisplayName,
      streamerDisplayName: econ.streamerDisplayName,
      communityId: econ.community.id,
      chatContext: {
        streamerUserId: cmd.userId,
        senderTwitchId: cmd.senderTwitchId,
        broadcasterTwitchId: cmd.broadcasterTwitchId,
        rawArgs: cmd.args,
      },
      streamId: econ.activeStreamId,
      sessionId: econ.activeSessionId,
      trigger: "chat",
    });
    if (!fired.ok) {
      await adapter.postChatMessage(
        `🎲 Chaos fired, but no eligible events to draw — burn applied.`,
      );
      return { ok: true };
    }
    await adapter.postChatMessage(`💥 ${fired.flavor}`);
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// !random — free ambient surprise
// ---------------------------------------------------------------------------

registerCommand({
  name: "random",
  trigger: ["random"],
  actor: "everyone",
  surface: ["chat"],
  economy: "none",
  moduleKey: "random",
  category: "events",
  family: "community",
  minAuthority: "viewer",
  vipOnly: false,
  communityType: "fun",
  cooldownSeconds: 60,
  help: {
    summary: "Fire a wild event.",
    usage: "!random",
    detail: "Free to fire (per-user cooldown). Pulls from the random-event deck — a token delta, a story moment, or a future modifier.",
  },
  handler: async (cmd) => {
    const econ = await resolveEconomyContext(asShuffleCtx(cmd));
    if (!econ) return { ok: false, reason: "no_economy" };
    const adapter = adapterFor(cmd, econ);

    const gameKey = econ.activeGameSlug
      ? canonicalizeGameKey(econ.activeGameSlug)
      : null;
    const fired = await fireEvent({
      surface: "random",
      gameKey,
      actorIdentityId: econ.caller.id,
      actorDisplayName: econ.caller.display_name ?? cmd.senderDisplayName,
      streamerDisplayName: econ.streamerDisplayName,
      communityId: econ.community.id,
      chatContext: {
        streamerUserId: cmd.userId,
        senderTwitchId: cmd.senderTwitchId,
        broadcasterTwitchId: cmd.broadcasterTwitchId,
        rawArgs: cmd.args,
      },
      streamId: econ.activeStreamId,
      sessionId: econ.activeSessionId,
      trigger: "chat",
    });
    if (!fired.ok) {
      await adapter.postChatMessage(
        `🎲 @${cmd.senderDisplayName}, nothing in the random deck right now.`,
      );
      return { ok: false, reason: "no_event" };
    }
    await adapter.postChatMessage(`🎲 ${fired.flavor}`);
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// Helpers (kept local so !chaos / !random don't depend on economy.ts
// internals beyond the public resolveEconomyContext / EconomyContext)
// ---------------------------------------------------------------------------

function canonicalizeGameKey(slug: string): string | null {
  if (slug === "mk8dx" || slug === "mario-kart-8-deluxe") {
    return "mario-kart-8-deluxe";
  }
  if (slug === "mkworld" || slug === "mario-kart-world") {
    return "mario-kart-world";
  }
  return null;
}

export const __EVENT_COMMANDS_REGISTERED__ = true;
