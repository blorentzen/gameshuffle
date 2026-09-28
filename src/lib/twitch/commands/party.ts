/**
 * Party night chat commands (GS Pro) — stream mode for live Mario Party nights.
 * They act on the streamer's open live night (started from a party randomizer).
 *
 *   !party                        where to join (everyone)
 *   !party join                   take an open seat as yourself (everyone)
 *   !chance [help|crutch] [@name] deal a Chance card, random or to someone (mods)
 *   !chance vote [help|crutch]    chat votes who gets it (mods)
 *   !mission [@name]              deal a mission (mods)
 *   !mission done @name           confirm their mission: points, plus tokens
 *                                 from the streamer's allowance (mods)
 *
 * Pro-gated and silent for non-Pro, like !poll. Cards dealt from chat show on
 * the OBS overlay and in chat, because stream nights are played in public.
 */

import "server-only";
import { sendChatMessage } from "@/lib/twitch/client";
import { isProUser } from "@/lib/subscription-server";
import { getBaseUrl } from "@/lib/env";
import { getIdentityById, resolveIdentity } from "@/lib/economy/identity";
import { activeNightForHost, joinFromChat, PartyError, runAction, seatByName, showOnOverlay, type Loaded } from "@/lib/party/nights";
import { startChanceVote } from "@/lib/party/stream";
import { resolveEconomyContext } from "./economy";
import { registerCommand, type CmdContext } from "./registry";
import type { ShuffleContext } from "./shuffle";

function asShuffleCtx(cmd: CmdContext): ShuffleContext {
  return {
    userId: cmd.userId, broadcasterTwitchId: cmd.broadcasterTwitchId, senderTwitchId: cmd.senderTwitchId,
    senderLogin: cmd.senderLogin, senderDisplayName: cmd.senderDisplayName, isBroadcaster: cmd.isBroadcaster,
    botTwitchId: cmd.botTwitchId, overlayToken: cmd.overlayToken ?? null,
  };
}
function reply(cmd: CmdContext, message: string): Promise<unknown> {
  return sendChatMessage({ broadcasterId: cmd.broadcasterTwitchId, senderId: cmd.botTwitchId, message }).catch(() => null);
}

const ERR: Record<string, string> = {
  full: "Every seat is taken.",
  ended: "That party night has ended.",
  deck_empty: "Every card of that kind is already in play.",
  unavailable: "Party nights aren't switched on yet.",
};

/** The streamer's live night, or a chat nudge to start one. Null = stop (already replied or not Pro). */
async function nightFor(cmd: CmdContext, quietIfNone = false): Promise<Loaded | null> {
  if (!(await isProUser(cmd.userId))) return null;
  try {
    const l = await activeNightForHost(cmd.userId);
    if (!l && !quietIfNone) await reply(cmd, "🎲 No party night is running. Start a live night from the Mario Party randomizer on GameShuffle.");
    return l;
  } catch (e) {
    if (e instanceof PartyError && e.code === "unavailable") await reply(cmd, `🎲 ${ERR.unavailable}`);
    return null;
  }
}

function parseEffect(word: string | undefined): "help" | "crutch" | "both" | null {
  const w = (word ?? "").toLowerCase();
  if (w === "help" || w === "helps") return "help";
  if (w === "crutch" || w === "crutches") return "crutch";
  return w ? null : "both";
}

registerCommand({
  name: "party.join",
  trigger: ["party", "join"],
  actor: "everyone",
  surface: ["chat"],
  economy: "none",
  category: "social",
  family: "play",
  minAuthority: "viewer",
  vipOnly: false,
  cooldownSeconds: 3,
  help: { summary: "Take a seat in the streamer's party night.", usage: "!party join" },
  handler: async (cmd) => {
    const l = await nightFor(cmd);
    if (!l) return { ok: false, reason: "no_night" };
    try {
      const { identityId } = await resolveIdentity({ platform: "twitch", platformId: cmd.senderTwitchId, displayName: cmd.senderDisplayName });
      const identity = await getIdentityById(identityId);
      const res = await joinFromChat(l, { id: identityId, displayName: cmd.senderDisplayName, accountUserId: identity?.gs_account_id ?? null });
      await reply(cmd, res.already ? `🎲 ${cmd.senderDisplayName}, you're already in seat ${res.seat + 1}.` : `🎲 ${cmd.senderDisplayName} takes seat ${res.seat + 1}. Cards and missions dealt to you show here and on stream.`);
      return { ok: true };
    } catch (e) {
      await reply(cmd, `🎲 ${ERR[(e as PartyError).code] ?? "Couldn't take a seat. Try again."}`);
      return { ok: false, reason: "join_failed" };
    }
  },
});

registerCommand({
  name: "party",
  trigger: ["party"],
  actor: "everyone",
  surface: ["chat"],
  economy: "none",
  category: "social",
  family: "play",
  minAuthority: "viewer",
  vipOnly: false,
  cooldownSeconds: 20,
  help: {
    summary: "Where to join the streamer's Mario Party night.",
    usage: "!party  ·  !party join",
    detail: "Shows the party night's join link. !party join takes an open seat as you. GS Pro.",
  },
  handler: async (cmd) => {
    const l = await nightFor(cmd);
    if (!l) return { ok: false, reason: "no_night" };
    const open = l.seats.filter((s) => !s.is_cpu && !s.user_id && !s.guest_key_hash && !s.identity_id).length;
    await reply(cmd, `🎲 Party night: ${getBaseUrl()}/party/${l.night.join_code} · ${open ? `${open} open seat${open === 1 ? "" : "s"}, type !party join` : "every seat is taken"}.`);
    return { ok: true };
  },
});

registerCommand({
  name: "chance.vote",
  trigger: ["chance", "vote"],
  actor: "crew",
  surface: ["chat"],
  economy: "none",
  category: "broadcaster",
  family: "play",
  minAuthority: "mod",
  vipOnly: false,
  cooldownSeconds: 30,
  help: { summary: "Let chat vote who gets the next Chance card.", usage: "!chance vote [help|crutch]" },
  handler: async (cmd) => {
    const l = await nightFor(cmd);
    if (!l) return { ok: false, reason: "no_night" };
    const econ = await resolveEconomyContext(asShuffleCtx(cmd));
    if (!econ) return { ok: false, reason: "no_economy" };
    const effect = parseEffect(cmd.args.trim().split(/\s+/)[0]) ?? "both";
    const res = await startChanceVote(l, econ.community.id, effect);
    if (!res.ok) {
      await reply(cmd, res.reason === "need_two" ? "🎲 A vote needs at least two people seated." : "🎲 Couldn't start the vote.");
      return { ok: false, reason: res.reason };
    }
    await reply(cmd, `🗳️ Who gets ${effect === "help" ? "a help" : effect === "crutch" ? "a crutch" : "a Chance card"}? ${res.names.map((n, i) => `!vote ${i + 1} ${n}`).join(" · ")} (45 seconds)`);
    return { ok: true };
  },
});

registerCommand({
  name: "chance",
  trigger: ["chance"],
  actor: "crew",
  surface: ["chat"],
  economy: "none",
  category: "broadcaster",
  family: "play",
  minAuthority: "mod",
  vipOnly: false,
  cooldownSeconds: 5,
  help: {
    summary: "Deal a Chance card (a help or a crutch) in the party night.",
    usage: "!chance [help|crutch] [@name]  ·  !chance vote [help|crutch]",
    detail: "Deals a Chance card to someone seated, or at random. It shows on your overlay and in chat. !chance vote lets chat pick who gets it. GS Pro.",
  },
  handler: async (cmd) => {
    const l = await nightFor(cmd);
    if (!l) return { ok: false, reason: "no_night" };
    const words = cmd.args.trim().split(/\s+/).filter(Boolean);
    let effect = parseEffect(words[0]);
    let nameWord = words[1];
    if (effect === null) { effect = "both"; nameWord = words[0]; }
    let seat: number | null = null;
    if (nameWord) {
      seat = seatByName(l, nameWord);
      if (seat === null) { await reply(cmd, `🎲 ${nameWord.replace(/^@/, "")} isn't seated. Type !party to see how to join.`); return { ok: false, reason: "no_seat" }; }
    }
    try {
      const out = await runAction(l, { isHost: true, seat: null }, { action: "draw", effect, seat });
      if (out.card) {
        await showOnOverlay(l, out.card, cmd.senderDisplayName);
        await reply(cmd, `🎴 ${out.card.effect === "help" ? "Help" : "Crutch"}: ${out.card.title}. ${out.card.text}`);
      }
      return { ok: true };
    } catch (e) {
      await reply(cmd, `🎲 ${ERR[(e as PartyError).code] ?? "Couldn't deal that."}`);
      return { ok: false, reason: "deal_failed" };
    }
  },
});

registerCommand({
  name: "mission.done",
  trigger: ["mission", "done"],
  actor: "crew",
  surface: ["chat"],
  economy: "earn",
  category: "broadcaster",
  family: "play",
  minAuthority: "mod",
  vipOnly: false,
  cooldownSeconds: 3,
  help: { summary: "Confirm someone finished their mission.", usage: "!mission done @name" },
  handler: async (cmd) => {
    const l = await nightFor(cmd);
    if (!l) return { ok: false, reason: "no_night" };
    const name = cmd.args.trim().split(/\s+/)[0] ?? "";
    const seat = seatByName(l, name);
    if (seat === null) { await reply(cmd, "🎲 Usage: !mission done @name (someone seated)."); return { ok: false, reason: "no_seat" }; }
    // Their oldest unfinished mission: pending first, then held.
    const open = l.cards.filter((c) => c.kind === "mission" && c.seat_index === seat && (c.status === "pending" || c.status === "held"))
      .sort((a, b) => (a.status === b.status ? a.created_at.localeCompare(b.created_at) : a.status === "pending" ? -1 : 1));
    if (!open.length) { await reply(cmd, `🎲 ${name.replace(/^@/, "")} has no open mission.`); return { ok: false, reason: "no_mission" }; }
    try {
      const out = await runAction(l, { isHost: true, seat: null }, { action: "confirm", cardRow: open[0].id });
      const who = l.seats.find((s) => s.seat_index === seat)?.display_name ?? name;
      const paid = out.paid && out.paid.tokens > 0 ? ` +${out.paid.tokens}🪙` : "";
      await reply(cmd, `✅ ${who} completed "${out.card?.title ?? "their mission"}" (${out.card?.worth ?? 1} pt${out.card?.worth === 1 ? "" : "s"})${paid}.`);
      if (out.card) await showOnOverlay(l, { ...out.card, title: `${who} completed ${out.card.title}` }, cmd.senderDisplayName);
      return { ok: true };
    } catch (e) {
      await reply(cmd, `🎲 ${ERR[(e as PartyError).code] ?? "Couldn't confirm that."}`);
      return { ok: false, reason: "confirm_failed" };
    }
  },
});

registerCommand({
  name: "mission",
  trigger: ["mission"],
  actor: "crew",
  surface: ["chat"],
  economy: "none",
  category: "broadcaster",
  family: "play",
  minAuthority: "mod",
  vipOnly: false,
  cooldownSeconds: 5,
  help: {
    summary: "Deal a mission in the party night, or confirm one.",
    usage: "!mission [@name]  ·  !mission done @name",
    detail: "Deals a mission (worth 1 to 3 points) to someone seated. !mission done @name confirms it, adds their points and pays tokens from your monthly allowance. GS Pro.",
  },
  handler: async (cmd) => {
    const l = await nightFor(cmd);
    if (!l) return { ok: false, reason: "no_night" };
    const nameWord = cmd.args.trim().split(/\s+/)[0];
    const seat = nameWord ? seatByName(l, nameWord) : null;
    if (nameWord && seat === null) { await reply(cmd, `🎲 ${nameWord.replace(/^@/, "")} isn't seated.`); return { ok: false, reason: "no_seat" }; }
    try {
      const out = await runAction(l, { isHost: true, seat: null }, { action: "mission", seat });
      if (out.card) {
        await showOnOverlay(l, out.card, cmd.senderDisplayName);
        const who = out.card.seat !== null ? l.seats.find((s) => s.seat_index === out.card!.seat)?.display_name : "someone";
        await reply(cmd, `🎯 Mission for ${who} (${out.card.worth} pt${out.card.worth === 1 ? "" : "s"}): ${out.card.title}. ${out.card.text}`);
      }
      return { ok: true };
    } catch (e) {
      await reply(cmd, `🎲 ${ERR[(e as PartyError).code] ?? "Couldn't deal that."}`);
      return { ok: false, reason: "deal_failed" };
    }
  },
});
