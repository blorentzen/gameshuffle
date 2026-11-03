/**
 * /logo (GameShuffle Competitive; war tools pick 5A): a server's own team logos for war cards, tables and the overlay.
 *   /logo add tag image [name]  squares and checks the picture, then a private preview with Save / Cancel
 *   /logo get tag               the logo, privately
 *   /logo list                  a picture of the server's logos, a page at a time
 *   /logo remove tag            whoever added it, or someone who can manage the server
 * Buttons: wlogo:save:<id>, wlogo:cancel:<id>, wlogo:page:<n>.
 */

import { after } from "next/server";
import { canManageGuild } from "../guildOwner";
import { getDiscordUser } from "../user";
import { appOfApplicationId } from "../appIds";
import { fetchAttachment, guildName, type Attachment } from "./timeTrials";
import { accountForDiscord } from "@/lib/daily/results";
import { cancelLogo, confirmLogo, listLogos, liveWarsWithTag, logoRow, prepareLogo, removeLogo } from "@/lib/wars/logos";
import { LOGOS_PER_PAGE, renderLogoGrid } from "@/lib/wars/logoGrid";
import { editCard } from "@/lib/wars/discord";
import { COMP_COLOR } from "../ttPanel";

export const LOGO_PREFIX = "wlogo:";
const EPHEMERAL = 64;

const say = (content: string, extra: Record<string, unknown> = {}) => Response.json({ type: 4, data: { content, flags: EPHEMERAL, allowed_mentions: { parse: [] }, ...extra } });
const update = (data: Record<string, unknown>) => Response.json({ type: 7, data: { allowed_mentions: { parse: [] }, ...data } });
const btn = (label: string, id: string, style: 1 | 2 | 3 | 4 = 2, disabled = false) => ({ type: 2, style, label, custom_id: id, ...(disabled ? { disabled: true } : {}) });
const row = (...components: unknown[]) => ({ type: 1, components });
const cleanTag = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, 12);

function who(interaction: Record<string, unknown>): { id: string; name: string } | null {
  const user = getDiscordUser(interaction);
  if (!user?.id) return null;
  const nick = (interaction.member as { nick?: string | null } | undefined)?.nick;
  return { id: user.id, name: (nick || user.global_name || user.username || "Someone").slice(0, 32) };
}

async function editOriginal(appId: string, token: string, data: Record<string, unknown>, file?: { name: string; data: Buffer }): Promise<void> {
  const url = `https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`;
  const body = { allowed_mentions: { parse: [] }, ...data };
  if (!file) {
    await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    return;
  }
  const form = new FormData();
  form.append("payload_json", JSON.stringify({ ...body, attachments: [{ id: 0, filename: file.name }] }));
  form.append("files[0]", new Blob([new Uint8Array(file.data)], { type: "image/png" }), file.name);
  await fetch(url, { method: "PATCH", body: form }).catch(() => null);
}

const redrawWars = (guildId: string, tag: string) => after(async () => {
  for (const id of await liveWarsWithTag(guildId, tag)) await editCard(id);
});

// ── Pages of logos ────────────────────────────────────────────────────────────────────────────

/** "A to C": the first letters on a page. */
function rangeOf(tags: string[]): string {
  if (!tags.length) return "";
  const first = (t: string) => (/[a-z]/i.test(t[0]) ? t[0].toUpperCase() : "#");
  const a = first(tags[0]);
  const b = first(tags[tags.length - 1]);
  return a === b ? a : `${a} to ${b}`;
}

async function listPage(guildId: string, page: number): Promise<{ data: Record<string, unknown>; file?: { name: string; data: Buffer } }> {
  const all = await listLogos(guildId);
  if (!all.length) return { data: { content: "This server has no logos of its own yet. Add one with /logo add. Teams on MKCentral show their logo without one.", embeds: [], components: [] } };
  const pages = Math.ceil(all.length / LOGOS_PER_PAGE);
  const p = Math.min(Math.max(0, page), pages - 1);
  const slice = all.slice(p * LOGOS_PER_PAGE, (p + 1) * LOGOS_PER_PAGE);
  const png = await renderLogoGrid({ server: await guildName(guildId), logos: slice, page: p, total: all.length, range: rangeOf(slice.map((l) => l.tag)) });
  const nav = pages > 1 ? [row(btn("Previous", `${LOGO_PREFIX}page:${p - 1}`, 2, p === 0), btn("Next", `${LOGO_PREFIX}page:${p + 1}`, 2, p >= pages - 1))] : [];
  return {
    data: { content: "", embeds: [{ color: COMP_COLOR, image: { url: "attachment://logos.png" }, footer: { text: "/logo get <tag> shows one · /logo remove <tag> takes one down" } }], components: nav },
    file: { name: "logos.png", data: png },
  };
}

// ── The command ───────────────────────────────────────────────────────────────────────────────

type Opt = { name: string; type?: number; value?: unknown; options?: Opt[] };

export async function handleLogoCommand(interaction: Record<string, unknown>): Promise<Response> {
  if (appOfApplicationId(interaction.application_id) !== "comp") return say("Team logos come with GameShuffle Competitive.");
  const guildId = (interaction.guild_id as string | undefined) ?? null;
  if (!guildId) return say("Logos belong to a server: use /logo in one.");
  const by = who(interaction);
  if (!by) return say("Couldn't tell who you are.");
  const sub = ((interaction.data as { options?: Opt[] } | undefined)?.options ?? [])[0];
  const opt = (n: string) => sub?.options?.find((o) => o.name === n)?.value;
  const appId = String(interaction.application_id ?? "");
  const token = String(interaction.token ?? "");

  if (sub?.name === "add") {
    const tag = cleanTag(opt("tag"));
    if (!tag) return say("Give the logo a tag, like KC.");
    const name = String(opt("name") ?? "").trim().slice(0, 60) || null;
    const attId = String(opt("image") ?? "");
    const attachment = ((interaction.data as { resolved?: { attachments?: Record<string, Attachment> } }).resolved?.attachments ?? {})[attId] ?? null;
    if (!attachment) return say("Attach the logo picture (PNG, JPEG or WebP).");
    after(async () => {
      try {
        const bytes = await fetchAttachment(attachment);
        if (!bytes) { await editOriginal(appId, token, { content: "That picture couldn't be opened. Use a PNG, JPEG or WebP under 8 MB." }); return; }
        const account = await accountForDiscord(by.id).catch(() => null);
        const res = await prepareLogo({ guildId, tag, name, image: bytes, by, userId: account });
        if (!res.ok) {
          const why = res.error === "refused" ? `That picture can't be used as a logo here.${res.reason ? ` ${res.reason}` : ""}` : res.error === "storage_off" ? "Logos can't be saved right now. Try again later." : "That picture couldn't be opened. Use a PNG, JPEG or WebP.";
          await editOriginal(appId, token, { content: why });
          return;
        }
        const lines = [`Here's **${tag}**${name ? ` (${name})` : ""}. It shows on war cards, tables and the overlay in this server.`];
        if (res.replaces) lines.push(`It replaces the logo ${res.replaces.createdByName ?? "someone"} added.`);
        if (res.unsure) lines.push("It works in this server; it stays off GameShuffle's own pages until we've had a look.");
        await editOriginal(appId, token, {
          content: lines.join("\n"),
          embeds: [{ color: COMP_COLOR, image: { url: res.logo.url } }],
          components: [row(btn("Save", `${LOGO_PREFIX}save:${res.logo.id}`, 3), btn("Cancel", `${LOGO_PREFIX}cancel:${res.logo.id}`))],
        });
      } catch (err) {
        console.error("[wars] logo add failed:", err);
        await editOriginal(appId, token, { content: "The logo couldn't be saved. Try again in a moment." });
      }
    });
    return Response.json({ type: 5, data: { flags: EPHEMERAL } });
  }

  if (sub?.name === "get") {
    const tag = cleanTag(opt("tag"));
    const logo = tag ? await logoRow(guildId, tag) : null;
    if (!logo) return say(`This server has no logo for **${tag || "that tag"}**. Add one with /logo add.`);
    return say(`**${logo.tag}**${logo.name ? ` (${logo.name})` : ""}, added by ${logo.createdByName ?? "someone"}.`, { embeds: [{ color: COMP_COLOR, image: { url: logo.url } }] });
  }

  if (sub?.name === "remove") {
    const tag = cleanTag(opt("tag"));
    const res = await removeLogo(guildId, tag, by, canManageGuild(interaction));
    if (!res.ok) return say(res.error === "none" ? `This server has no logo for **${tag}**.` : "Only whoever added that logo, or someone who can manage the server, can remove it.");
    redrawWars(guildId, res.logo.tag);
    return say(`Removed **${res.logo.tag}**'s logo. Wars show MKCentral's logo for it again, if the team has one there.`);
  }

  // list
  after(async () => {
    try {
      const { data, file } = await listPage(guildId, 0);
      await editOriginal(appId, token, data, file);
    } catch (err) {
      console.error("[wars] logo list failed:", err);
      await editOriginal(appId, token, { content: "The logos couldn't load. Try again in a moment." });
    }
  });
  return Response.json({ type: 5, data: { flags: EPHEMERAL } });
}

/** Tag suggestions for /logo get and /logo remove: this server's logos. */
export async function logoAutocomplete(interaction: Record<string, unknown>): Promise<Response> {
  const guildId = (interaction.guild_id as string | undefined) ?? null;
  const sub = ((interaction.data as { options?: Opt[] } | undefined)?.options ?? [])[0];
  const q = String(sub?.options?.find((o) => (o as { focused?: boolean }).focused)?.value ?? "").trim().toLowerCase();
  const logos = guildId ? await listLogos(guildId).catch(() => []) : [];
  const choices = logos.filter((l) => !q || l.tag.toLowerCase().startsWith(q) || (l.name ?? "").toLowerCase().includes(q)).slice(0, 25)
    .map((l) => ({ name: `${l.tag}${l.name ? ` · ${l.name}` : ""}`.slice(0, 100), value: l.tag }));
  return Response.json({ type: 8, data: { choices } });
}

export async function handleLogoComponent(interaction: Record<string, unknown>, customId: string): Promise<Response> {
  const by = who(interaction);
  if (!by) return say("Couldn't tell who you are.");
  const [kind, arg] = customId.slice(LOGO_PREFIX.length).split(":");
  if (kind === "save") {
    const res = await confirmLogo(arg, by, canManageGuild(interaction));
    if (!res.ok) return update({ content: res.error === "taken" ? "Someone else added this tag's logo. Only they, or someone who can manage the server, can replace it." : "That preview has gone stale. Run /logo add again.", embeds: [], components: [] });
    redrawWars(res.logo.guildId, res.logo.tag);
    return update({ content: `Saved **${res.logo.tag}**'s logo. It shows on war cards, tables and the overlay in this server.`, components: [] });
  }
  if (kind === "cancel") {
    await cancelLogo(arg, by);
    return update({ content: "Not saved.", embeds: [], components: [] });
  }
  if (kind === "page") {
    const guildId = (interaction.guild_id as string | undefined) ?? null;
    if (!guildId) return say("Use this in the server.");
    const appId = String(interaction.application_id ?? "");
    const token = String(interaction.token ?? "");
    after(async () => {
      const { data, file } = await listPage(guildId, Number(arg) || 0);
      await editOriginal(appId, token, data, file);
    });
    return Response.json({ type: 6 });
  }
  return say("Unknown button.");
}
