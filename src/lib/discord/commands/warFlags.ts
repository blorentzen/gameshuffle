/**
 * /flag (GameShuffle Competitive; works like /logo): a server's own flags for war tables, for codes the country flags
 * don't cover ([eu] is there, [kc] or a region isn't) or to draw a code its own way.
 *   /flag add code image [name]  squares and checks the picture, then a private preview with Save / Cancel
 *   /flag get code               the flag, privately
 *   /flag list                   the server's flags
 *   /flag remove code            whoever added it, or someone who can manage the server
 * Buttons: wflag:save:<id>, wflag:cancel:<id>.
 */

import { after } from "next/server";
import { canManageGuild } from "../guildOwner";
import { getDiscordUser } from "../user";
import { appOfApplicationId } from "../appIds";
import { fetchAttachment, type Attachment } from "./timeTrials";
import { accountForDiscord } from "@/lib/daily/results";
import { cancelFlag, cleanFlagCode, confirmFlag, flagRow, flagsReady, listFlags, prepareFlag, removeFlag } from "@/lib/wars/flags";
import { flagUrl } from "@/lib/lounge/flags";
import { COMP_COLOR } from "../ttPanel";

export const FLAG_PREFIX = "wflag:";
const EPHEMERAL = 64;

const say = (content: string, extra: Record<string, unknown> = {}) => Response.json({ type: 4, data: { content, flags: EPHEMERAL, allowed_mentions: { parse: [] }, ...extra } });
const update = (data: Record<string, unknown>) => Response.json({ type: 7, data: { allowed_mentions: { parse: [] }, ...data } });
const btn = (label: string, id: string, style: 1 | 2 | 3 | 4 = 2) => ({ type: 2, style, label, custom_id: id });
const row = (...components: unknown[]) => ({ type: 1, components });
const shown = (code: string) => `[${code}]`;

function who(interaction: Record<string, unknown>): { id: string; name: string } | null {
  const user = getDiscordUser(interaction);
  if (!user?.id) return null;
  const nick = (interaction.member as { nick?: string | null } | undefined)?.nick;
  return { id: user.id, name: (nick || user.global_name || user.username || "Someone").slice(0, 32) };
}

async function editOriginal(appId: string, token: string, data: Record<string, unknown>): Promise<void> {
  await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allowed_mentions: { parse: [] }, ...data }),
  }).catch(() => null);
}

type Opt = { name: string; type?: number; value?: unknown; options?: Opt[] };

export async function handleFlagCommand(interaction: Record<string, unknown>): Promise<Response> {
  if (appOfApplicationId(interaction.application_id) !== "comp") return say("Flags come with GameShuffle Competitive.");
  const guildId = (interaction.guild_id as string | undefined) ?? null;
  if (!guildId) return say("Flags belong to a server: use /flag in one.");
  if (!(await flagsReady())) return say("Flags need a quick update on our side first. Try again later.");
  const by = who(interaction);
  if (!by) return say("Couldn't tell who you are.");
  const sub = ((interaction.data as { options?: Opt[] } | undefined)?.options ?? [])[0];
  const opt = (n: string) => sub?.options?.find((o) => o.name === n)?.value;
  const appId = String(interaction.application_id ?? "");
  const token = String(interaction.token ?? "");

  if (sub?.name === "add") {
    const code = cleanFlagCode(opt("code"));
    if (!code) return say("A flag code is 2 to 10 letters, like kc or eu (gb_eng works too).");
    const name = String(opt("name") ?? "").trim().slice(0, 60) || null;
    const attId = String(opt("image") ?? "");
    const attachment = ((interaction.data as { resolved?: { attachments?: Record<string, Attachment> } }).resolved?.attachments ?? {})[attId] ?? null;
    if (!attachment) return say("Attach the flag picture (PNG, JPEG or WebP).");
    after(async () => {
      try {
        const bytes = await fetchAttachment(attachment);
        if (!bytes) { await editOriginal(appId, token, { content: "That picture couldn't be opened. Use a PNG, JPEG or WebP under 8 MB." }); return; }
        const account = await accountForDiscord(by.id).catch(() => null);
        const res = await prepareFlag({ guildId, code, name, image: bytes, by, userId: account });
        if (!res.ok) {
          const why = res.error === "refused" ? `That picture can't be used as a flag here.${res.reason ? ` ${res.reason}` : ""}` : res.error === "storage_off" || res.error === "not_ready" ? "Flags can't be saved right now. Try again later." : "That picture couldn't be opened. Use a PNG, JPEG or WebP.";
          await editOriginal(appId, token, { content: why });
          return;
        }
        const lines = [`Here's **${shown(code)}**${name ? ` (${name})` : ""}. Players with ${shown(code)} on this server's tables get it.`];
        if (res.replaces) lines.push(`It replaces the flag ${res.replaces.createdByName ?? "someone"} added.`);
        else if (flagUrl(code)) lines.push(`It's drawn instead of the country flag for ${shown(code)}, in this server only.`);
        if (res.unsure) lines.push("It works in this server; it stays off GameShuffle's own pages until we've had a look.");
        await editOriginal(appId, token, {
          content: lines.join("\n"),
          embeds: [{ color: COMP_COLOR, image: { url: res.flag.url } }],
          components: [row(btn("Save", `${FLAG_PREFIX}save:${res.flag.id}`, 3), btn("Cancel", `${FLAG_PREFIX}cancel:${res.flag.id}`))],
        });
      } catch (err) {
        console.error("[wars] flag add failed:", err);
        await editOriginal(appId, token, { content: "The flag couldn't be saved. Try again in a moment." });
      }
    });
    return Response.json({ type: 5, data: { flags: EPHEMERAL } });
  }

  if (sub?.name === "get") {
    const code = cleanFlagCode(opt("code"));
    const flag = code ? await flagRow(guildId, code) : null;
    if (!flag) return say(code && flagUrl(code) ? `${shown(code)} uses the country flag. Add your own with /flag add.` : `This server has no flag for **${code ? shown(code) : "that code"}**. Add one with /flag add.`);
    return say(`**${shown(flag.code)}**${flag.name ? ` (${flag.name})` : ""}, added by ${flag.createdByName ?? "someone"}.`, { embeds: [{ color: COMP_COLOR, image: { url: flag.url } }] });
  }

  if (sub?.name === "remove") {
    const code = cleanFlagCode(opt("code"));
    if (!code) return say("That isn't a flag code.");
    const res = await removeFlag(guildId, code, by, canManageGuild(interaction));
    if (!res.ok) return say(res.error === "none" ? `This server has no flag for **${shown(code)}**.` : "Only whoever added that flag, or someone who can manage the server, can remove it.");
    return say(`Removed **${shown(res.flag.code)}**.${flagUrl(code) ? " Tables draw the country flag for it again." : " Tables show the code as text again."}`);
  }

  // list
  const flags = await listFlags(guildId);
  if (!flags.length) return say("This server has no flags of its own. Country codes like [us] or [jp] draw their flag without one; add others with /flag add.");
  const lines = flags.map((f) => `**${shown(f.code)}**${f.name ? ` ${f.name}` : ""} · added by ${f.createdByName ?? "someone"}`);
  return say(`Flags in this server (${flags.length}):\n${lines.slice(0, 40).join("\n")}${flags.length > 40 ? `\n…and ${flags.length - 40} more` : ""}\n-# Country codes like [us] draw their flag without one.`);
}

/** Code suggestions for /flag get and /flag remove: this server's flags. */
export async function flagAutocomplete(interaction: Record<string, unknown>): Promise<Response> {
  const guildId = (interaction.guild_id as string | undefined) ?? null;
  const sub = ((interaction.data as { options?: Opt[] } | undefined)?.options ?? [])[0];
  const q = String(sub?.options?.find((o) => (o as { focused?: boolean }).focused)?.value ?? "").trim().toLowerCase().replace(/^\[/, "");
  const flags = guildId ? await listFlags(guildId).catch(() => []) : [];
  const choices = flags.filter((f) => !q || f.code.startsWith(q) || (f.name ?? "").toLowerCase().includes(q)).slice(0, 25)
    .map((f) => ({ name: `${shown(f.code)}${f.name ? ` · ${f.name}` : ""}`.slice(0, 100), value: f.code }));
  return Response.json({ type: 8, data: { choices } });
}

export async function handleFlagComponent(interaction: Record<string, unknown>, customId: string): Promise<Response> {
  const by = who(interaction);
  if (!by) return say("Couldn't tell who you are.");
  const [kind, arg] = customId.slice(FLAG_PREFIX.length).split(":");
  if (kind === "save") {
    const res = await confirmFlag(arg, by, canManageGuild(interaction));
    if (!res.ok) return update({ content: res.error === "taken" ? "Someone else added this code's flag. Only they, or someone who can manage the server, can replace it." : "That preview has gone stale. Run /flag add again.", embeds: [], components: [] });
    return update({ content: `Saved **${shown(res.flag.code)}**. Players with ${shown(res.flag.code)} on this server's tables get it.`, components: [] });
  }
  if (kind === "cancel") {
    await cancelFlag(arg, by);
    return update({ content: "Not saved.", embeds: [], components: [] });
  }
  return say("Unknown button.");
}
