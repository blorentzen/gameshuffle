/**
 * "Save to GameShuffle": a message command for Quaxly's time trials list (migration picks
 * 2026-10-29, all as recommended). Press and hold Quaxly's reply (right-click on a computer), Apps,
 * Save to GameShuffle. Discord hands us the reply as it is, so there's nothing to copy and no AI.
 *
 *   1A  reads the list with the same parser the import page uses (src/lib/timeTrials/quaxly.ts)
 *   2A  works anywhere the person has added GameShuffle to their own account (user install); the
 *       answer is always private, so it never posts in someone else's server
 *   3A  only your times: a player list when you ran it or it names you, else rows under your names
 *   4A  "Save N times" right here; "Check them on GameShuffle" opens the import page's check table
 *   5A  only new or faster times are saved
 */

import { after } from "next/server";
import { getDiscordUser } from "../user";
import { SITE_URL } from "@/lib/seo";
import { createServiceClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/ratelimit";
import { discordActor, type TtActor } from "@/lib/timeTrials/players";
import { ttReady } from "@/lib/timeTrials/store";
import { embedText, readQuaxly, yourRows, nameKey, type QuaxlyList } from "@/lib/timeTrials/quaxly";
import { toCheckRows, checkSummary } from "@/lib/timeTrials/importRows";
import { bestsMap, dropDraft, loadQuaxlyDraft, saveImported, saveQuaxlyDraft } from "@/lib/timeTrials/importFlow";
import { gamePath, TT_GAMES, type TtGame } from "@/lib/timeTrials/tracks";
import type { TtItems } from "@/lib/timeTrials/categories";
import { editOriginal } from "./timeTrials";
import { lineInPlace, onCard, saveListCard, savedCard, EPHEMERAL, TT_IMPORT_PREFIX, type Message } from "../ttCards";

/** The message command's name as Discord shows it under Apps. */
export const TT_SAVE_COMMAND = "Save to GameShuffle";
export { TT_IMPORT_PREFIX };

const privateReply = (content: string) => Response.json({ type: 4, data: { content, flags: EPHEMERAL, allowed_mentions: { parse: [] } } });

type Embed = { title?: string | null; description?: string | null; author?: { name?: string | null } | null; fields?: { name?: string | null; value?: string | null }[] | null; footer?: { text?: string | null } | null };
export type Msg = {
  content?: string;
  embeds?: Embed[];
  author?: { id?: string; username?: string; bot?: boolean };
  interaction?: { name?: string; user?: { id?: string } };
  interaction_metadata?: { name?: string; user?: { id?: string } };
};

/** Which game a Quaxly reply is for, from the command that made it ("dx display_time" is MK8DX). */
function gameFromCommand(msg: Msg): TtGame | undefined {
  const name = (msg.interaction_metadata?.name ?? msg.interaction?.name ?? "").toLowerCase();
  if (/\bdx\b/.test(name)) return "mk8dx";
  if (/display_time/.test(name)) return "mkworld";
  return undefined;
}

/** Your names as a list might show them: server nickname, Discord display name and username, and your GameShuffle names. */
async function yourNames(interaction: Record<string, unknown>, user: { username: string; global_name?: string }, actor: TtActor): Promise<string[]> {
  const nick = (interaction.member as { nick?: string | null } | undefined)?.nick ?? null;
  const names = [nick, user.global_name ?? null, user.username];
  if (actor.userId) {
    const { data } = await createServiceClient().from("users").select("display_name, username").eq("id", actor.userId).maybeSingle();
    const u = data as { display_name: string | null; username: string | null } | null;
    names.push(u?.display_name ?? null, u?.username ?? null);
  }
  return [...new Set(names.filter((n): n is string => !!n && n.trim().length > 0))];
}

/** Whether a list without holders is the importer's own: they ran Quaxly's command, or it names them. */
function ownList(msg: Msg, userId: string, names: string[], text: string): boolean {
  const ranBy = msg.interaction_metadata?.user?.id ?? msg.interaction?.user?.id ?? null;
  if (ranBy === userId) return true;
  const header = [msg.embeds?.[0]?.title, msg.embeds?.[0]?.author?.name, msg.embeds?.[0]?.footer?.text].filter(Boolean).join(" ");
  const keys = names.map(nameKey).filter((k) => k.length >= 3);
  return keys.some((k) => nameKey(header).includes(k)) || keys.some((k) => nameKey(text.split("\n")[0] ?? "").includes(k));
}

function listItems(list: QuaxlyList): TtItems {
  return list.items === "none" ? "none" : "shrooms";
}
/** "150cc, with mushrooms" (the speed only for a game with two). */
function listCategory(list: QuaxlyList): string {
  const g = TT_GAMES[list.game];
  return `${g.classes.length > 1 ? `${list.cc}cc, ` : ""}${listItems(list) === "none" ? "no mushrooms" : "with mushrooms"}`;
}

export async function handleTtSaveCommand(interaction: Record<string, unknown>): Promise<Response> {
  const user = getDiscordUser(interaction);
  if (!user?.id) return privateReply("Couldn't tell who you are.");
  const data = interaction.data as { target_id?: string; resolved?: { messages?: Record<string, Msg> } };
  const msg = data.target_id ? data.resolved?.messages?.[data.target_id] : undefined;
  if (!msg) return privateReply("Couldn't read that message. Try again on Quaxly's reply.");
  const text = [msg.content ?? "", ...(msg.embeds ?? []).map(embedText)].filter(Boolean).join("\n");
  const list = readQuaxly(text, gameFromCommand(msg));
  if (!list || !list.rows.some((r) => r.trackId && r.timeMs)) {
    return privateReply("I couldn't find time trial times in that message. Use Save to GameShuffle on Quaxly's reply to `/dx display_time` (or `/display_time` for Mario Kart World), with yourself as the player.");
  }
  if (!(await rateLimit(`tt-save:${user.id}`, { max: 10, windowMs: 10 * 60_000 })).ok) return privateReply("That's a lot of lists. Wait a few minutes and try again.");
  if (!(await ttReady())) return privateReply("Time trials aren't open yet. Try again soon.");

  const appId = String(interaction.application_id ?? "");
  const token = String(interaction.token ?? "");
  const guildId = (interaction.guild_id as string | undefined) ?? null;
  after(async () => editOriginal(appId, token, await saveReplyFor(interaction, user, msg, list, text, guildId)));
  return Response.json({ type: 5, data: { flags: EPHEMERAL } });
}

/** "Save N times": saves the draft's ticked rows (fresh check against what's saved now). */
export async function handleTtSaveButton(interaction: Record<string, unknown>, customId: string): Promise<Response> {
  const user = getDiscordUser(interaction);
  if (!user?.id) return privateReply("Couldn't tell who you are.");
  const draftId = customId.slice(TT_IMPORT_PREFIX.length);
  const loaded = await loadQuaxlyDraft(draftId);
  if (!loaded) return Response.json({ type: 7, data: lineInPlace(interaction, "That list waited too long. Use Save to GameShuffle on Quaxly's reply again.") });
  if (loaded.discordId !== user.id) return privateReply("That isn't yours to save.");
  const appId = String(interaction.application_id ?? "");
  const token = String(interaction.token ?? "");
  after(async () => {
    const actor = await discordActor(user);
    const { list, mine } = loaded.draft;
    const bests = await bestsMap(actor.player, list.game, listItems(list));
    const rows = toCheckRows(list.rows, list.game, list.cc, new Set(mine), bests).filter((r) => r.keep && r.trackId && r.timeMs);
    const tally = await saveImported(actor, list.game, rows.map((r) => ({ track: r.trackId!, cc: r.cc, time: r.timeMs! })), loaded.guildId, listItems(list));
    await dropDraft(draftId);
    await editOriginal(appId, token, savedCard({
      saved: tally.saved, already: tally.already, refused: tally.refused, gameLabel: TT_GAMES[list.game].label, category: listCategory(list),
      seeUrl: `${SITE_URL}${gamePath(list.game, list.cc)}`, unlinked: !actor.userId,
    }));
  });
  // The list's reply is a card: Saved replaces it in place. One from before the cards gets a new private message.
  return Response.json(onCard(interaction) ? { type: 6 } : { type: 5, data: { flags: EPHEMERAL } });
}

/** The private reply for Save to GameShuffle (split out so it can be run without Discord): a card, or one plain line
 *  when none of the times are yours. */
export async function saveReplyFor(interaction: Record<string, unknown>, user: { id: string; username: string; global_name?: string }, msg: Msg, list: QuaxlyList, text: string, guildId: string | null): Promise<Message> {
  const actor = await discordActor(user);
  const names = await yourNames(interaction, user, actor);
  const own = list.hasHolders ? false : ownList(msg, user.id, names, text);
  const { mine } = yourRows(list, names, own);
  const mineIdx = new Set(mine.map((r) => list.rows.indexOf(r)));
  if (!mineIdx.size) {
    const content = list.hasHolders
      ? `None of these times are under your name (${names.slice(0, 3).join(", ")}). Run \`${list.game === "mk8dx" ? "/dx display_time" : "/display_time"}\` with yourself as the player, then save that list.`
      : `This list is someone else's. Run \`${list.game === "mk8dx" ? "/dx display_time" : "/display_time"}\` with yourself as the player, then save that one.`;
    return { content, components: [] };
  }
  const bests = await bestsMap(actor.player, list.game, listItems(list));
  const rows = toCheckRows(list.rows, list.game, list.cc, mineIdx, bests);
  const sum = checkSummary(rows.filter((_, i) => mineIdx.has(i)));
  const draftId = await saveQuaxlyDraft(actor, user.id, guildId, { kind: "quaxly", list, mine: [...mineIdx], names });
  const checkUrl = draftId ? `${SITE_URL}/time-trials/import?d=${draftId}` : `${SITE_URL}/time-trials/import`;
  return saveListCard({
    keep: sum.keep, already: sum.already, unclear: sum.unclear, record: sum.record,
    gameLabel: TT_GAMES[list.game].label, category: listCategory(list), draftId, checkUrl,
    seeUrl: `${SITE_URL}${gamePath(list.game, list.cc)}`, unlinked: !actor.userId,
  });
}
