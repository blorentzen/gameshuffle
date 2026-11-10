/**
 * War tables in Discord (GameShuffle Competitive; war tools pick 4A). Make the table (the war card's final card or More
 * menu, or /table) opens a form: a final results screenshot, a background, and the text already filled in from the war.
 * The screenshot fills any team without players, split by the tags in the names (front or back) before row color; flags
 * come from players' Discord accounts via MKCentral, or [cc] in the text. Each team's total is checked against the war; anything off comes back privately (Draw it anyway / Fix the text / Swap teams / Cancel) before the table is posted.
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
import { fillFromRows, formatTable, parsePasted, parseTable, swapTeams, tableIssues, teamTotal } from "@/lib/wars/table";
import { applyCards, EMPTY_CARDS, fixesBetween, teamCardFor, unknownOnLinked, type TeamCard } from "@/lib/wars/cards";
import { tagKey } from "@/lib/wars/tags";
import { cardSetFor, cardsReady, linksReady, listTeams, saveTeam, setRoster } from "@/lib/wars/cardStore";
import { readResults } from "@/lib/wars/tableRead";
import { createDraft, getTable, postTable, prefillFor, recentWarId, TABLE_PREFIX, tagAliases, updateTable, warTotals, type WarTableRow } from "@/lib/wars/tables";
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
function checkMessage(table: WarTableRow, war: War | null, notes: string[], guessed: boolean, cards: TeamCard[], unknown = 0): { ready: boolean; data: Record<string, unknown> } {
  const model = parseTable(table.body);
  const issues = tableIssues(model, war ? warTotals(war, cards) : null).map((i) => i.text);
  const all = [...notes, ...issues, ...(unknown ? [`${unknown === 1 ? "A name isn't" : `${unknown} names aren't`} matched to a player on their team's MKCentral list yet. Who are these? picks them from the list, once.`] : [])];
  if (!all.length) return { ready: true, data: {} };
  const summary = model.teams.filter((t) => t.players.length).map((t) => `${t.name || t.tag} ${teamTotal(t)}: ${t.players.map((p) => `${p.name} ${p.score}`).join(", ")}`).join("\n");
  return {
    ready: false,
    data: {
      content: `Check this before it's posted:\n${all.map((l) => `• ${l}`).join("\n")}`,
      embeds: summary ? [{ color: COMP_COLOR, description: summary.slice(0, 3900) }] : [],
      components: unknown ? [row(btn(`Who are these? (${unknown})`, `${TABLE_PREFIX}who:${table.id}`, 1)), ...checkButtons(table.id, guessed)] : checkButtons(table.id, guessed),
    },
  };
}

/** Names on the table that linked teams' MKCentral lists could tell (pick 7). */
async function unknownsFor(table: WarTableRow, war: War | null) {
  if (!(await linksReady())) return [];
  const model = parseTable(table.body);
  const set = await cardSetFor(table.guildId, model, war?.game ?? "mk8dx").catch(() => EMPTY_CARDS);
  return unknownOnLinked(model, set, model.teams.map((_, i) => i)).map((u) => ({ ...u, set, model }));
}

/** "Who are these?": a menu per name, that team's MKCentral players nobody on the table is yet. */
async function whoForm(table: WarTableRow, war: War | null): Promise<Record<string, unknown> | null> {
  const list = await unknownsFor(table, war);
  if (!list.length) return null;
  return {
    custom_id: `${TABLE_MODAL_PREFIX}who:${table.id}`,
    title: "Who are these?",
    components: list.map((u) => ({
      type: 18, label: `${u.ingame} on ${u.model.teams[u.team].name || u.model.teams[u.team].tag}`.slice(0, 45),
      component: {
        type: 3, custom_id: `who:${u.team}:${u.ingame}`.slice(0, 100), required: false, placeholder: "Pick a player…",
        options: [
          ...u.options.map((p) => ({ label: p.name.slice(0, 100), value: String(p.id), ...(p.country ? { description: p.country.toUpperCase() } : {}) })),
          { label: `Not on ${u.model.teams[u.team].name || u.model.teams[u.team].tag}'s list`.slice(0, 100), value: "none" },
        ],
      },
    })),
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

async function finish(table: WarTableRow, war: War | null, appId: string, token: string, notes: string[], guessed: boolean, opts: { skipWho?: boolean } = {}): Promise<void> {
  const unknown = opts.skipWho ? 0 : (await unknownsFor(table, war).catch(() => [])).length;
  const check = checkMessage(table, war, notes, guessed, await listTeams(table.guildId).catch(() => []), unknown);
  if (!check.ready) { await editOriginal(appId, token, check.data); return; }
  const res = await postTable(table.id, war);
  if (res === "ok") { await editOriginal(appId, token, rememberPrompt(table, "The table is up.")); return; }
  await editOriginal(appId, token, { content: res === "no_access" ? "I can't post here. Give GameShuffle Competitive Send Messages and Attach Files in this channel." : "The table couldn't be posted. Try again in a moment.", components: checkButtons(table.id, false) });
}

/**
 * After a fixed table goes up (overrides pick 3): the names someone changed from what the screenshot said, with
 * "Remember for <team>" per team, so the next table fills them in. Nothing to remember = just the first line.
 */
function rememberPrompt(table: WarTableRow, first: string, skip: number[] = []): Record<string, unknown> {
  if (!table.readBody) return { content: first, components: [], embeds: [] };
  const posted = parseTable(table.body);
  const fixes = fixesBetween(parseTable(table.readBody), posted).filter((f) => !skip.includes(f.team));
  if (!fixes.length) return { content: first, components: [], embeds: [] };
  const teams = [...new Set(fixes.map((f) => f.team))].slice(0, 3);
  const label = (i: number) => posted.teams[i]?.name || posted.teams[i]?.tag || "this team";
  const said = teams.map((i) => `${fixes.filter((f) => f.team === i).length} on ${label(i)}'s side`).join(" and ");
  return {
    content: `${first} You changed ${said}. Remember them for next time?`,
    embeds: [{ color: COMP_COLOR, description: fixes.slice(0, 20).map((f) => `${f.ingame} → **${f.shown}**${f.flag ? ` \`${f.flag}\`` : ""}`).join("\n") }],
    components: [row(
      ...teams.map((i) => btn(`Remember for ${label(i)}`.slice(0, 80), `${TABLE_PREFIX}rem:${table.id}:${i}:${skip.join(".")}`, 3)),
      btn("Just this table", `${TABLE_PREFIX}norem:${table.id}`),
    )],
  };
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
        // The blank form's sample text counts as nothing typed, so a screenshot can make the teams.
        const typed = text.trim() && text.trim() !== TEMPLATE ? text : "";
        let model = parsePasted(typed || (war ? await prefillFor(war) : ""));
        let guessed = false;
        const before = model.teams.map((t) => t.players.length);
        if (shot) {
          const bytes = await fetchAttachment(shot);
          const read = bytes ? await readResults(bytes, { userId: account, capKey: `d:${by.id}` }) : { ok: false as const, error: "failed" as const };
          if (read.ok) {
            let fill = fillFromRows(model, read.rows);
            if (fill.tags.length) fill = fillFromRows(model, read.rows, { aliases: await tagAliases(fill.tags, war?.game ?? "mk8dx", guildId).catch(() => ({})) });
            ({ model, guessed } = fill);
            if (guessed) notes.push(fill.by === "tags" ? `The tags on the screen (${fill.tags.join(", ")}) didn't match the teams, so they went in order; check they're the right way round.` : "Teams were sorted by row color; check they're the right way round.");
          } else notes.push(read.error === "cap" ? "That's all the screenshots I can read for you today; type the scores in." : read.error === "not_results" ? "That screenshot doesn't look like a results screen." : "The screenshot couldn't be read.");
        }
        // Team cards and player cards (overrides pick 1): the screenshot's players shown as people set them. Flags
        // otherwise come from the taps' Discord accounts (prefill) or the text; a name alone matches too many lounge players.
        const filled = model.teams.map((t, i) => (!before[i] && t.players.length ? i : -1)).filter((i) => i >= 0);
        if (await cardsReady()) model = applyCards(model, await cardSetFor(guildId, model, war?.game ?? "mk8dx").catch(() => EMPTY_CARDS), filled);
        const readBody = shot && filled.length ? formatTable(model) : null;
        let backgroundUrl: string | null = null;
        if (bg) {
          const bytes = await fetchAttachment(bg);
          const stored = bytes ? await storeBackground(bytes, guildId, by, account) : { url: null, note: "That background couldn't be opened." };
          if (stored.note) notes.push(stored.note);
          backgroundUrl = stored.url;
          if (stored.url && keep) await rememberChannel(guildId, channelId, { background: stored.url });
        }
        if (!backgroundUrl) backgroundUrl = (await warChannel(guildId, channelId))?.background ?? null;
        const id = await createDraft({ warId: war?.id ?? null, guildId, channelId, body: formatTable(model), backgroundUrl, by, readBody });
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
  if (!body && kind !== "who") return say("The table needs some text.");

  if (kind === "who") {
    const manage = canManageGuild(interaction);
    after(async () => {
      try {
        const war = table.warId ? await getWar(table.warId) : null;
        const list = await unknownsFor(table, war);
        const model = parseTable(table.body);
        const read = table.readBody ? parseTable(table.readBody) : null;
        let named = 0;
        for (const [id, part] of parts) {
          const m = /^who:(\d+):(.+)$/.exec(id);
          const v = part.values?.[0];
          if (!m || !v || v === "none") continue;
          const u = list.find((x) => x.team === Number(m[1]) && x.ingame === m[2]);
          const player = u?.options.find((p) => String(p.id) === v);
          const t = u ? model.teams[u.team] : null;
          const card = u && t ? teamCardFor(u.set.teams, t.tag, t.name) : null;
          if (!u || !player || !t || !card) continue;
          const own = player.discordId ? u.set.cards.find((c) => c.discordId === player.discordId) : undefined;
          const shown = (own?.shown ?? player.name.split("/")[0].trim()).slice(0, 32);
          const flag = own?.flag ?? player.country;
          await setRoster(table.guildId, card.id, [{ ingame: u.ingame, shown, flag, mkcPlayerId: player.id }], by, manage, "remember");
          for (const m2 of [model, read]) {
            const p = m2?.teams[u.team]?.players.find((x) => x.name === u.ingame);
            if (p) { p.name = shown; p.flag = flag; }
          }
          named++;
        }
        await updateTable(table.id, { body: formatTable(model), ...(read ? { readBody: formatTable(read) } : {}) });
        const fresh = await getTable(table.id);
        await finish(fresh!, war, appId, token, named ? [] : ["Nobody was picked, so the names stay as they are."], false, { skipWho: true });
      } catch (err) {
        console.error("[wars] who are these failed:", err);
        await editOriginal(appId, token, { content: "That didn't save. Try Who are these? again." });
      }
    });
    return Response.json({ type: 6 });
  }

  if (kind === "fix") {
    after(async () => {
      await updateTable(table.id, { body: formatTable(parsePasted(body)) });
      const fresh = await getTable(table.id);
      await finish(fresh!, table.warId ? await getWar(table.warId) : null, appId, token, [], false);
    });
    return Response.json({ type: 6 });
  }

  if (kind === "edit") {
    after(async () => {
      await updateTable(table.id, { body: formatTable(parsePasted(body)) });
      const res = await postTable(table.id, table.warId ? await getWar(table.warId) : null);
      const fresh = await getTable(table.id);
      await editOriginal(appId, token, res === "ok" && fresh ? rememberPrompt(fresh, "Updated.") : { content: res === "ok" ? "Updated." : "The table couldn't be updated. Try again in a moment." });
    });
    return Response.json({ type: 5, data: { flags: EPHEMERAL } });
  }
  return say("Unknown form.");
}

export async function handleTableComponent(interaction: Record<string, unknown>, customId: string): Promise<Response> {
  const by = who(interaction);
  if (!by) return say("Couldn't tell who you are.");
  const [kind, ref, a, b] = customId.slice(TABLE_PREFIX.length).split(":");
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
    case "rem": {
      if (!(await cardsReady()) || !table.readBody) return update("There's nothing to remember from this table.");
      const idx = Number(a);
      const skip = (b ?? "").split(".").filter(Boolean).map(Number);
      const posted = parseTable(table.body);
      const read = parseTable(table.readBody);
      const team = posted.teams[idx];
      if (!team) return update("That team isn't on the table any more.");
      const fixes = fixesBetween(read, posted).filter((f) => f.team === idx);
      const manage = canManageGuild(interaction);
      // The team's card (made now if it has none), with the tag the screen showed when someone changed it. A team
      // shown under the war's tag as its name keeps that as one of its tags, not its name.
      const warTags = war ? [war.us.tag, war.them.tag].map(tagKey) : [];
      const nameIsTag = !!team.name && warTags.includes(tagKey(team.name));
      const before = read.teams[idx];
      const extra = [...(before && tagKey(before.tag) !== tagKey(team.tag) ? [before.tag] : []), ...(nameIsTag ? [team.name!] : [])].filter((t) => t !== "?");
      let card = teamCardFor(await listTeams(table.guildId), team.tag, team.name);
      if (!card) {
        const made = await saveTeam(table.guildId, { tags: [team.tag, ...extra], name: nameIsTag ? null : team.name }, by, manage);
        if (made.ok) card = made.team;
      } else if (extra.length) await saveTeam(table.guildId, { id: card.id, addTags: extra }, by, manage).catch(() => null);
      if (!card) return update("That team couldn't be set up. Try /team set first.");
      const res = await setRoster(table.guildId, card.id, fixes.map((f) => ({ ingame: f.ingame, shown: f.shown, flag: f.flag })), by, manage, "remember");
      const kept = res.skipped.length ? ` ${res.skipped.length} already set by someone else stayed as they were.` : "";
      const next = rememberPrompt(table, `Remembered ${res.added + res.changed} for ${card.name ?? card.tags[0]}.${kept}`, [...skip, idx]);
      return Response.json({ type: 7, data: { allowed_mentions: { parse: [] }, embeds: [], ...next } });
    }
    case "norem": return update("Kept to this table.");
    case "who": {
      const form = await whoForm(table, war);
      return form ? Response.json({ type: 9, data: form }) : update("Everyone on the table is matched now.");
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
