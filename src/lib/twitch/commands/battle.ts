/**
 * `!gs battle` — a viewer battle (mods + host). Rolls everyone in the lobby at
 * once for the game on stream, each pick different from the last where the
 * game allows (Smash, Mario Party), plus one stage for everyone in Smash.
 *
 *   - Each player's roll lands on their lobby row, so `!gs-mycombo`, the lobby
 *     page and /live show it like any roll.
 *   - Chat gets the lineup (split over up to three messages; past that, a
 *     link to the lobby page).
 *   - The overlay shows one card with everyone on it, recorded as a streamer
 *     shuffle event whose roll carries a title ("Viewer battle on Smashville").
 */

import "server-only";
import { collectionForTwitchSender } from "@/lib/collection/server";
import { getBaseUrl } from "@/lib/env";
import {
  findTwitchSessionForUser,
  listActiveTwitchParticipants,
  patchTwitchParticipantById,
  recordTwitchShuffleEvent,
} from "@/lib/sessions/twitch-platform";
import { getChatGame } from "@/lib/twitch/chatGames";
import { rollSlots, type ChatRoll, type RollSlot } from "@/lib/twitch/chatRoll";
import { adapterFor, type ShuffleContext } from "./shuffle";

/** Tiles on the overlay card; the rest of a big lobby is in chat and on the lobby page. */
const OVERLAY_TILES = 12;
const MAX_MESSAGES = 3;

/**
 * The lineup as chat messages: the heading, then "Name: pick" joined with
 * dots, no message longer than `maxChars`. Past the last message, the rest
 * becomes "+N more" and the lobby link (the last message keeps room for it).
 */
export function lineupMessages(head: string, lines: string[], fullListUrl: string | null, maxChars: number): string[] {
  const more = (n: number) => ` · +${n} more${fullListUrl ? `: ${fullListUrl}` : " on the lobby page"}`;
  const reserve = more(99).length;
  const out: string[] = [];
  let cur = head;
  let i = 0;
  for (; i < lines.length; i++) {
    const last = out.length + 1 >= MAX_MESSAGES;
    const next = `${cur}${cur === head ? " " : " · "}${lines[i]}`;
    if (next.length + (last && i < lines.length - 1 ? reserve : 0) <= maxChars) { cur = next; continue; }
    if (last) break;
    out.push(cur);
    cur = lines[i];
  }
  if (i < lines.length) cur += more(lines.length - i);
  out.push(cur);
  return out;
}

export async function handleBattleCommand(ctx: ShuffleContext): Promise<void> {
  const session = await findTwitchSessionForUser(ctx.userId, ["active", "test"]);
  const adapter = adapterFor(ctx, session?.id ?? "no-session");
  if (!session) {
    if (ctx.isBroadcaster) await adapter.postChatMessage("⚔️ No active shuffle session. Go live in a supported game (or start a test session from your dashboard).");
    return;
  }
  const game = getChatGame(session.randomizer_slug);
  if (!game) {
    await adapter.postChatMessage("⚔️ Viewer battles need a game GameShuffle can roll for. This session is a queue.");
    return;
  }
  if (game.streamerOnly) {
    await adapter.postChatMessage(`⚔️ No viewer battles in ${game.title}: chat rolls the streamer's team there.`);
    return;
  }

  const platform = ctx.platform === "youtube" ? "youtube" : "twitch";
  const players = (await listActiveTwitchParticipants(session.id, platform)).slice(0, game.lobbyCap);
  if (players.length < 2) {
    await adapter.postChatMessage("⚔️ A viewer battle needs at least two in the lobby. Type !gs-join to get in.");
    return;
  }

  // Each player's own collection, like their own !gs-shuffle.
  const broadcasterId = ctx.broadcasterPlatformId ?? ctx.broadcasterTwitchId;
  const owned = await Promise.all(players.map((p) => collectionForTwitchSender({
    twitchUserId: p.twitch_user_id, streamerUserId: ctx.userId, isBroadcaster: p.twitch_user_id === broadcasterId, slug: game.slug,
  })));
  const taken: string[] = [];
  const rolls = players.map((player, i) => {
    const roll = game.roll({ owned: owned[i], arg: "", taken: [...taken] });
    const first = rollSlots(roll)[0]?.name;
    if (first) taken.push(first);
    return { player, roll };
  });
  const setting = game.battleSetting?.() ?? null;

  const now = new Date().toISOString();
  await Promise.all(rolls.map(({ player, roll }) => patchTwitchParticipantById(player.id, {
    current_combo: roll as unknown as Record<string, unknown>,
    current_combo_at: now,
  })));

  const title = `Viewer battle${setting ? ` on ${setting}` : ""}`;
  const lines = rolls.map(({ player, roll }) => `${player.twitch_display_name}: ${roll.text}`);
  const fullListUrl = ctx.overlayToken ? `${getBaseUrl()}/lobby/${ctx.overlayToken}` : null;
  // YouTube live chat caps a message at 200 characters, Twitch at 500.
  for (const message of lineupMessages(`⚔️ ${title}!`, lines, fullListUrl, platform === "youtube" ? 190 : 480)) {
    await adapter.postChatMessage(message);
  }

  // One overlay card: each player's first part (their fighter, character, hero), their name underneath.
  const slots: RollSlot[] = rolls.slice(0, OVERLAY_TILES).flatMap(({ player, roll }) => {
    const first = rollSlots(roll)[0];
    return first ? [{ ...first, detail: player.twitch_display_name }] : [];
  });
  const card: ChatRoll = { v: 2, kind: "battle", game: game.slug, title, slots, text: lines.join(" · ") };
  await recordTwitchShuffleEvent({
    sessionId: session.id,
    twitchUserId: ctx.senderTwitchId,
    twitchDisplayName: ctx.senderDisplayName,
    triggerType: "battle",
    combo: card as unknown as Record<string, unknown>,
    isBroadcaster: true,
  });
}
