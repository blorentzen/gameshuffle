/**
 * War tables in Discord (GameShuffle Competitive; war tools pick 4A). Make the table (the war card's final card or More
 * menu, or /table) opens a form: a final results screenshot, a background, and the text already filled in from the war.
 * The screenshot fills any team without players (flags come from players' Discord accounts via MKCentral, or [cc] in the
 * text), and each team's total is checked against the war; anything off comes back privately (Draw it anyway / Fix the text / Swap teams / Cancel) before the table is posted.
 *   wtab:make:<warId|none>   the form            wtabm:new:<warId|none>  its answer
 *   wtab:draw|fix|swap|cancel:<tableId>          the check's buttons; wtabm:fix:<tableId> the fixed text
 *   wtab:edit|copy:<tableId>                     on a posted table; wtabm:edit:<tableId>
 */

import { after } from "next/server";
import { getDiscordUser } from "../user";
import { canManageGuild } from "../guildOwner";
import { appOfApplicationId } from "../appIds";
import { fetchAttachment, type Attachment } from "./timeTrials";
import { COMP_COLOR } from "../ttPanel";
import { accountForDiscord } from "@/lib/daily/results";
import { checkImage } from "@/lib/moderation/imageCheck";
import { isR2Configured, uploadToR2 } from "@/lib/storage/r2";
import { getWar, rememberChannel, warChannel, type War } from "@/lib/wars/store";
import { fillFromRows, formatTable, parseTable, swapTeams, tableIssues, teamTotal } from "@/lib/wars/table";
import { readResults } from "@/lib/wars/tableRead";
import { createDraft, getTable, postTable, prefillFor, recentWarId, TABLE_PREFIX, updateTable, warTotals, type WarTableRow } from "@/lib/wars/tables";
import { randomBytes } from "node:crypto";
import sharp from "sharp";

export { TABLE_PREFIX };
export const TABLE_MODAL_PREFIX = "wtabm:";
const EPHEMERAL = 64;

const say = (content: string, components: unknown[] = [], extra: Record<string, unknown> = {}) => Response.json({ type: 4, data: { content, components, flags: EPHEMERAL, allowed_mentions: { parse: [] }, ...extra } });
const update = (content: string, components: unknown[] = []) => Response.json({ type: 7, data: { content, components, embeds: [], allowed_mentions: { parse: [] } } });
const btn = (label: string, id: string, style: 1 | 2 | 3 | 4 = 2) => ({ type: 2, style, label, custom_id: id });
const row = (...components: unknown[]) => ({ type: 1, components });

function who(interaction: Record<string, unknown>): { id: string; name: string } | null {
  const user = getDiscordUser(interaction);
  if (!user?.id) return null;
  const nick = (interaction.member as { nick?: string | null } | undefined)?.nick;
  return { id: user.id, name: (nick || user.global_name || user.username || "Someone").slice(0, 32) };
}

async function editOriginal(appId: string, token: string, data: Record<string, unknown>): Promise<void> {
  await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allowed_mentions: { parse: [] }, embeds: [], ...data }),
  }).catch(() => null);
}

type ModalPart = { custom_id?: string; value?: string | null; values?: string[] };
function modalParts(interaction: Record<string, unknown>): Map<string, ModalPart> {
  const out = new Map<string, ModalPart>();
  const walk = (list: unknown[]) => {
    for (const c of list as { component?: ModalPart; components?: unknown[]; custom_id?: string }[]) {
      if (c.component?.custom_id) out.set(c.component.custom_id, c.component);
      else if (c.custom_id) out.set(c.custom_id, c as ModalPart);
      if (c.components) walk(c.components);
    }
  };
  walk(((interaction.data as { components?: unknown[] } | undefined)?.components) ?? []);
  return out;
}
const attachmentOf = (interaction: Record<string, unknown>, id: string | undefined): Attachment | null =>
  (id ? ((interaction.data as { resolved?: { attachments?: Record<string, Attachment> } }).resolved?.attachments ?? {})[id] : null) ?? null;

const TEMPLATE = "#title Your team vs Their team\nTAG - Your team\nPlayer [us] 0\nTAG - Their team\nPlayer [us] 0";

function makeForm(warId: string | null, body: string): Record<string, unknown> {
  return {
    custom_id: `${TABLE_MODAL_PREFIX}new:${warId ?? "none"}`,
    title: "Make the table",
    components: [
      { type: 18, label: "Final results screenshot", description: "Optional. Every name and score is read from it; you check before it's posted.", component: { type: 19, custom_id: "shot", min_values: 0, max_values: 1, required: false, file_types: ["image"] } },
      { type: 18, label: "Background", description: "Optional. Leave it empty to use this channel's saved background.", component: { type: 19, custom_id: "bg", min_values: 0, max_values: 1, required: false, file_types: ["image"] } },
      { type: 18, label: "Players and scores", description: "Lorenzi's format: a team's tag on its own line, then Name [us] 94", component: { type: 4, custom_id: "body", style: 2, required: false, max_length: 4000, value: body.slice(0, 4000) } },
      { type: 18, label: "That background", component: { type: 21, custom_id: "keep", required: false, options: [
        { value: "once", label: "Just this table", default: true },
        { value: "keep", label: "Save it for this channel's tables" },
      ] } },
    ],
  };
}

const textForm = (prefix: "fix" | "edit", table: WarTableRow) => ({
  custom_id: `${TABLE_MODAL_PREFIX}${prefix}:${table.id}`,
  title: prefix === "fix" ? "Fix the table" : "Edit the table",
  components: [{ type: 18, label: "Players and scores", description: "Lorenzi's format: a team's tag on its own line, then Name [us] 94", component: { type: 4, custom_id: "body", style: 2, required: true, max_length: 4000, value: table.body } }],
});

/** Opens the form for a war (or a blank table). */
export async function tableForm(warId: string | null): Promise<Response> {
  const war = warId ? await getWar(warId) : null;
  const body = war ? await prefillFor(war) : TEMPLATE;
  return Response.json({ type: 9, data: makeForm(war?.id ?? null, body) });
}

/** /table: the channel's war from the last few hours, or a blank one. */
export async function handleTableCommand(interaction: Record<string, unknown>): Promise<Response> {
  if (appOfApplicationId(interaction.application_id) !== "comp") return say("Tables come with GameShuffle Competitive.");
  const guildId = (interaction.guild_id as string | undefined) ?? null;
  const channelId = (interaction.channel_id as string | undefined) ?? null;
  if (!guildId || !channelId) return say("Make tables in a server's channel.");
  return tableForm(await recentWarId(guildId, channelId));
}

// ── Building, checking, posting ───────────────────────────────────────────────────────────────

const checkButtons = (id: string, guessed: boolean) => [row(
  btn("Draw it anyway", `${TABLE_PREFIX}draw:${id}`, 3),
  btn("Fix the text", `${TABLE_PREFIX}fix:${id}`),
  ...(guessed ? [btn("Swap teams", `${TABLE_PREFIX}swap:${id}`)] : []),
  btn("Cancel", `${TABLE_PREFIX}cancel:${id}`),
)];

/** What the private check message says for a table body, and whether it's ready to post. */
function checkMessage(table: WarTableRow, war: War | null, notes: string[], guessed: boolean): { ready: boolean; data: Record<string, unknown> } {
  const model = parseTable(table.body);
  const issues = tableIssues(model, war ? warTotals(war) : null).map((i) => i.text);
  const all = [...notes, ...(guessed ? ["Teams were sorted by row color; check they're the right way round."] : []), ...issues];
  if (!all.length) return { ready: true, data: {} };
  const summary = model.teams.filter((t) => t.players.length).map((t) => `${t.name || t.tag} ${teamTotal(t)}: ${t.players.map((p) => `${p.name} ${p.score}`).join(", ")}`).join("\n");
  return {
    ready: false,
    data: {
      content: `Check this before it's posted:\n${all.map((l) => `• ${l}`).join("\n")}`,
      embeds: summary ? [{ color: COMP_COLOR, description: summary.slice(0, 3900) }] : [],
      components: checkButtons(table.id, guessed),
    },
  };
}

async function storeBackground(bytes: Uint8Array, guildId: string, by: { id: string }, userId: string | null): Promise<{ url: string | null; note: string | null }> {
  if (!isR2Configured()) return { url: null, note: "The background couldn't be saved right now." };
  const jpg = await sharp(bytes, { animated: false }).rotate().resize(1600, 1200, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer().catch(() => null);
  if (!jpg) return { url: null, note: "That background couldn't be opened." };
  const check = await checkImage(jpg, { use: "war table background", userId, capKey: `d:${by.id}` });
  if (check.verdict === "refuse") return { url: null, note: `That background can't be used.${check.reason ? ` ${check.reason}` : ""}` };
  const url = await uploadToR2(`war-bg/${guildId}/${randomBytes(8).toString("hex")}.webp`, new Uint8Array(jpg), "image/webp");
  return { url, note: null };
}

async function finish(table: WarTableRow, war: War | null, appId: string, token: string, notes: string[], guessed: boolean): Promise<void> {
  const check = checkMessage(table, war, notes, guessed);
  if (!check.ready) { await editOriginal(appId, token, check.data); return; }
  const res = await postTable(table.id, war);
  await editOriginal(appId, token, { content: res === "ok" ? "The table is up." : res === "no_access" ? "I can't post here. Give GameShuffle Competitive Send Messages and Attach Files in this channel." : "The table couldn't be posted. Try again in a moment.", components: res === "ok" ? [] : checkButtons(table.id, false) });
}

export async function handleTableModal(interaction: Record<string, unknown>, customId: string): Promise<Response> {
  const by = who(interaction);
  if (!by) return say("Couldn't tell who you are.");
  const [kind, ref] = customId.slice(TABLE_MODAL_PREFIX.length).split(":");
  const parts = modalParts(interaction);
  const appId = String(interaction.application_id ?? "");
  const token = String(interaction.token ?? "");

  if (kind === "new") {
    const guildId = (interaction.guild_id as string | undefined) ?? null;
    const channelId = (interaction.channel_id as string | undefined) ?? null;
    if (!guildId || !channelId) return say("Make tables in a server's channel.");
    const shot = attachmentOf(interaction, parts.get("shot")?.values?.[0]);
    const bg = attachmentOf(interaction, parts.get("bg")?.values?.[0]);
    const keep = parts.get("keep")?.value === "keep";
    const text = String(parts.get("body")?.value ?? "");
    after(async () => {
      try {
        const war = ref && ref !== "none" ? await getWar(ref) : null;
        const notes: string[] = [];
        const account = await accountForDiscord(by.id).catch(() => null);
        let model = parseTable(text.trim() ? text : war ? await prefillFor(war) : "");
        let guessed = false;
        if (shot) {
          const bytes = await fetchAttachment(shot);
          const read = bytes ? await readResults(bytes, { userId: account, capKey: `d:${by.id}` }) : { ok: false as const, error: "failed" as const };
          if (read.ok) ({ model, guessed } = fillFromRows(model, read.rows));
          else notes.push(read.error === "cap" ? "That's all the screenshots I can read for you today; type the scores in." : read.error === "not_results" ? "That screenshot doesn't look like a results screen." : "The screenshot couldn't be read.");
        }
        // Flags come from the taps' Discord accounts (prefill) or the text; a name alone matches too many lounge players.
        let backgroundUrl: string | null = null;
        if (bg) {
          const bytes = await fetchAttachment(bg);
          const stored = bytes ? await storeBackground(bytes, guildId, by, account) : { url: null, note: "That background couldn't be opened." };
          if (stored.note) notes.push(stored.note);
          backgroundUrl = stored.url;
          if (stored.url && keep) await rememberChannel(guildId, channelId, { background: stored.url });
        }
        if (!backgroundUrl) backgroundUrl = (await warChannel(guildId, channelId))?.background ?? null;
        const id = await createDraft({ warId: war?.id ?? null, guildId, channelId, body: formatTable(model), backgroundUrl, by });
        const table = id ? await getTable(id) : null;
        if (!table) { await editOriginal(appId, token, { content: "The table couldn't be saved. Try again in a moment." }); return; }
        await finish(table, war, appId, token, notes, guessed);
      } catch (err) {
        console.error("[wars] table failed:", err);
        await editOriginal(appId, token, { content: "The table couldn't be made. Try again in a moment." });
      }
    });
    return Response.json({ type: 5, data: { flags: EPHEMERAL } });
  }

  const table = await getTable(ref ?? "");
  if (!table) return say("That table is gone.");
  const body = String(parts.get("body")?.value ?? "").trim();
  if (!body) return say("The table needs some text.");

  if (kind === "fix") {
    after(async () => {
      await updateTable(table.id, { body: formatTable(parseTable(body)) });
      const fresh = await getTable(table.id);
      await finish(fresh!, table.warId ? await getWar(table.warId) : null, appId, token, [], false);
    });
    return Response.json({ type: 6 });
  }

  if (kind === "edit") {
    after(async () => {
      await updateTable(table.id, { body: formatTable(parseTable(body)) });
      const res = await postTable(table.id, table.warId ? await getWar(table.warId) : null);
      await editOriginal(appId, token, { content: res === "ok" ? "Updated." : "The table couldn't be updated. Try again in a moment." });
    });
    return Response.json({ type: 5, data: { flags: EPHEMERAL } });
  }
  return say("Unknown form.");
}

export async function handleTableComponent(interaction: Record<string, unknown>, customId: string): Promise<Response> {
  const by = who(interaction);
  if (!by) return say("Couldn't tell who you are.");
  const [kind, ref] = customId.slice(TABLE_PREFIX.length).split(":");
  if (kind === "make") return tableForm(ref && ref !== "none" ? ref : null);
  const table = await getTable(ref ?? "");
  if (!table) return say("That table is gone.");
  const appId = String(interaction.application_id ?? "");
  const token = String(interaction.token ?? "");
  const war = table.warId ? await getWar(table.warId) : null;

  switch (kind) {
    case "draw": {
      after(async () => {
        const res = await postTable(table.id, war);
        await editOriginal(appId, token, { content: res === "ok" ? "The table is up." : "The table couldn't be posted. Try again in a moment.", components: [] });
      });
      return Response.json({ type: 6 });
    }
    case "fix": return Response.json({ type: 9, data: textForm("fix", table) });
    case "swap": {
      after(async () => {
        await updateTable(table.id, { body: formatTable(swapTeams(parseTable(table.body))) });
        await finish((await getTable(table.id))!, war, appId, token, [], false);
      });
      return Response.json({ type: 6 });
    }
    case "cancel": {
      await updateTable(table.id, { status: "canceled" });
      return update("Not posted.");
    }
    case "edit": {
      if (table.createdBy !== by.id && !canManageGuild(interaction)) return say("Only whoever made this table, or someone who can manage the server, can edit it.");
      return Response.json({ type: 9, data: textForm("edit", table) });
    }
    case "copy": return say("Lorenzi's text for this table:", [], { embeds: [{ color: COMP_COLOR, description: `\`\`\`\n${table.body.slice(0, 3900)}\n\`\`\`` }] });
    default: return say("Unknown button.");
  }
}
