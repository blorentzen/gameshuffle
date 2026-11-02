/**
 * /ranked, GS Ranked (GameShuffle Competitive; lounge plan step 1, results first; was /ladder, which still answers). A
 * lounge runs its own ranked board in its own server:
 *   /ranked setup    makes or changes this server's lounge (people who can manage the server)
 *   /ranked submit   a reporter's table: a results screenshot or the text, checked privately, then posted for updaters
 *   /ranked mmr      a player's MMR, division and rank
 *   /ranked join     ties your Discord account to your name on the lounge
 * Buttons and forms: src/lib/ladders/discord.ts names the custom ids.
 */

import { after } from "next/server";
import { getDiscordUser } from "../user";
import { canManageGuild } from "../guildOwner";
import { appOfApplicationId } from "../appIds";
import { COMP_COLOR } from "../ttPanel";
import { fetchAttachment, type Attachment } from "./timeTrials";
import { accountForDiscord } from "@/lib/daily/results";
import { createServiceClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/seo";
import { checkMessage, issuesFor, LADDER_MODAL_PREFIX, LADDER_PREFIX, postCard, type CardState } from "@/lib/ladders/discord";
import { readLadderShot } from "@/lib/ladders/read";
import { intakeTable } from "@/lib/ladders/intake";
import { givePenalty, logAction, requestName, undoPenalty, type Actor } from "@/lib/ladders/staffStore";
import { handleQueueCommand, roomTableIn } from "./rankedQueue";
import { startFromMkc } from "@/lib/ladders/mkcStart";
import { askToJoin } from "@/lib/ladders/joinStore";
import { isMode, MODES, modeSettings } from "@/lib/ladders/modes";
import type { PenaltyKind } from "@/lib/ladders/discipline";
import { blocking, nameKey, signed } from "@/lib/ladders/rules";
import {
  createTable, denyTable, getLadder, getTable, laddersInGuild, laddersOpen, laddersReady, linkDiscord, playerByName, playerForDiscord, playerNames,
  playerSeason, playersByKeys, saveLadder, tableRoom, undoTable, updateTable, verifyTable, type LadderTable,
  tableChanges,
} from "@/lib/ladders/store";
import { cleanSlug, formatLabel, FORMATS, isFormat, LADDER_GAMES, LADDER_KINDS, ladderPath, ladderPlayerPath, ladderStaffPath, type Ladder, type LadderGame, type LadderKind } from "@/lib/ladders/types";

export { LADDER_PREFIX, LADDER_MODAL_PREFIX };
const EPHEMERAL = 64;

const say = (content: string, components: unknown[] = [], extra: Record<string, unknown> = {}) => Response.json({ type: 4, data: { content, components, flags: EPHEMERAL, allowed_mentions: { parse: [] }, ...extra } });
const update = (content: string, components: unknown[] = []) => Response.json({ type: 7, data: { content, components, embeds: [], allowed_mentions: { parse: [] } } });
const btn = (label: string, id: string, style: 1 | 2 | 3 | 4 = 2) => ({ type: 2, style, label, custom_id: id });
const row = (...components: unknown[]) => ({ type: 1, components });
const num = (n: number) => n.toLocaleString("en-US");

type Opt = { name: string; type: number; value?: unknown; focused?: boolean; options?: Opt[] };

export function who(interaction: Record<string, unknown>): { id: string; name: string } | null {
  const user = getDiscordUser(interaction);
  if (!user?.id) return null;
  const nick = (interaction.member as { nick?: string | null } | undefined)?.nick;
  return { id: user.id, name: (nick || user.global_name || user.username || "Someone").slice(0, 32) };
}
const actorOf = (by: { id: string; name: string }): Actor => ({ id: by.id, name: by.name, via: "discord" });
const rolesOf = (interaction: Record<string, unknown>): string[] => ((interaction.member as { roles?: string[] } | undefined)?.roles ?? []);
const hasRole = (interaction: Record<string, unknown>, roles: string[]) => roles.some((r) => rolesOf(interaction).includes(r));

/** Updaters verify, send back and undo: the ladder's updater roles, or anyone who can manage the server. */
export const isUpdater = (ladder: Ladder, interaction: Record<string, unknown>) => canManageGuild(interaction) || hasRole(interaction, ladder.updaterRoles);
/** Reporters submit: the reporter roles (anyone when there are none), and updaters. */
export const canReport = (ladder: Ladder, interaction: Record<string, unknown>) => isUpdater(ladder, interaction) || !ladder.reporterRoles.length || hasRole(interaction, ladder.reporterRoles);

async function editOriginal(appId: string, token: string, data: Record<string, unknown>): Promise<void> {
  await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allowed_mentions: { parse: [] }, embeds: [], components: [], ...data }),
  }).catch(() => null);
}
async function followUp(appId: string, token: string, content: string): Promise<void> {
  await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, flags: EPHEMERAL, allowed_mentions: { parse: [] } }),
  }).catch(() => null);
}

type ModalPart = { custom_id?: string; value?: string | null; values?: string[] };
export function modalParts(interaction: Record<string, unknown>): Map<string, ModalPart> {
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

/** The server's ladder for a command: the one named, else its only one. */
export async function pickLadder(guildId: string, slug: string | null): Promise<{ ok: true; ladder: Ladder } | { ok: false; message: string }> {
  const ladders = await laddersInGuild(guildId);
  if (!ladders.length) return { ok: false, message: "This server isn't on GS Ranked yet. Someone who can manage the server can set it up with `/ranked setup`." };
  if (slug) {
    const hit = ladders.find((l) => l.slug === slug.toLowerCase() || l.name.toLowerCase() === slug.toLowerCase());
    return hit ? { ok: true, ladder: hit } : { ok: false, message: `This server has no lounge called "${slug}".` };
  }
  if (ladders.length === 1) return { ok: true, ladder: ladders[0] };
  return { ok: false, message: `This server runs ${ladders.length} lounges. Pick one with the \`lounge\` option: ${ladders.map((l) => l.name).join(", ")}.` };
}

// ── The forms ──────────────────────────────────────────────────────────────────────────────────

/** Discord cuts a form description at 100 characters. Teams can also be headed by a line with the team's name. */
const FORMAT_HELP = "Juno 82 on each line, teams in order. Leave it empty to use the screenshot.";

export function submitForm(ladder: Ladder, prefix: "new" | "fix", ref: string, prefill?: { body: string; format: number; tier: string | null; missed?: string }): Record<string, unknown> {
  const knockout = ladder.kind === "knockout";
  const components: unknown[] = [];
  if (prefix === "new") components.push({ type: 18, label: "Results screenshot", description: knockout ? "Optional. Every name is read in finishing order; you check before it's sent." : "Optional. Every name and score is read from it; you check before it's sent.", component: { type: 19, custom_id: "shot", min_values: 0, max_values: 1, required: false, file_types: ["image"] } });
  if (!knockout) components.push({ type: 18, label: "Format", component: { type: 21, custom_id: "format", required: true, options: FORMATS.map((f) => ({ value: String(f), label: formatLabel(f), ...(prefill?.format === f ? { default: true } : {}) })) } });
  components.push({ type: 18, label: "Tier", description: "Optional, like 3 or A.", component: { type: 4, custom_id: "tier", style: 1, required: false, max_length: 12, ...(prefill?.tier ? { value: prefill.tier } : {}) } });
  components.push({ type: 18, label: knockout ? "Finishing order" : "Players and scores", description: knockout ? "One name per line, 1st first. Leave it empty to use the screenshot." : FORMAT_HELP, component: { type: 4, custom_id: "body", style: 2, required: prefix === "fix", max_length: 4000, ...(prefill?.body ? { value: prefill.body.slice(0, 4000) } : {}) } });
  // Reduced loss in the form (automation pick 3): who missed races and how many; their teammates lose less.
  if (!knockout) components.push({ type: 18, label: "Missed races", description: "Optional, like Vex 5. Their teammates lose less, by the lounge's rule.", component: { type: 4, custom_id: "missed", style: 1, required: false, max_length: 200, ...(prefill?.missed ? { value: prefill.missed } : {}) } });
  return { custom_id: `${LADDER_MODAL_PREFIX}${prefix}:${ref}`, title: prefix === "new" ? `Submit a table · ${ladder.name}`.slice(0, 45) : "Fix the table", components };
}

// ── Commands ───────────────────────────────────────────────────────────────────────────────────

export async function handleLadderCommand(interaction: Record<string, unknown>): Promise<Response> {
  if (appOfApplicationId(interaction.application_id) !== "comp") return say("GS Ranked comes with GameShuffle Competitive.");
  const guildId = (interaction.guild_id as string | undefined) ?? null;
  if (!guildId) return say("GS Ranked runs in a server.");
  if (!(await laddersReady())) return say("GS Ranked isn't ready yet.");
  if (!(await laddersOpen())) return say("GS Ranked isn't open yet. Ask GameShuffle about running your lounge on it.");
  const by = who(interaction);
  if (!by) return say("Couldn't tell who you are.");
  const sub = ((interaction.data as { options?: Opt[] } | undefined)?.options ?? [])[0];
  const opt = (name: string) => sub?.options?.find((o) => o.name === name)?.value;
  const str = (name: string) => { const v = opt(name); return typeof v === "string" && v.trim() ? v.trim() : null; };

  switch (sub?.name) {
    case "setup": {
      if (!canManageGuild(interaction)) return say("Only people who can manage this server can set up its lounge.");
      const slug = cleanSlug(str("address"));
      if (!slug) return say("The address needs 2 to 32 letters, numbers or dashes, like `200cc`.");
      const name = (str("name") ?? "").slice(0, 60);
      if (name.length < 2) return say("Give the lounge a name.");
      // One Mode choice sets the game, the rooms, the divisions and the MMR rules (lounge system pick 1A); the older
      // game and kind options still work for a lounge set up before modes.
      const mode = str("mode");
      const picked = isMode(mode) ? MODES[mode] : null;
      const game = (picked?.game ?? str("game") ?? "mk8dx") as LadderGame;
      const kind = (picked?.kind ?? str("kind") ?? "race") as LadderKind;
      if (!(game in LADDER_GAMES) || !(kind in LADDER_KINDS)) return say("Pick the lounge's mode.");
      if (kind === "knockout" && game !== "mkworld") return say("Knockout Tour is a Mario Kart World mode. Pick Mario Kart World for a Knockout Tour lounge.");
      const updaters = str("updaters");
      const reporters = str("reporters");
      const results = str("results");
      const res = await saveLadder({
        guildId, slug, name, game, kind, resultsChannelId: results, updaterRoles: updaters ? [updaters] : [], reporterRoles: reporters ? [reporters] : [], by: by.id,
        ...(picked ? { settings: modeSettings(picked.id) } : {}),
      });
      if (!res.ok) return say(res.error === "slug_taken" ? `The address \`${slug}\` is taken. Try another.` : "The lounge couldn't be saved. Try again in a moment.");
      const l = res.ladder;
      const lines = [
        `**${l.name}** is ${res.created ? "set up" : "updated"}: ${picked ? `${picked.label} (${picked.note})` : `${LADDER_GAMES[l.game]}, ${l.kind === "knockout" ? "Knockout Tour rooms of 24" : "rooms of 12"}`}.`,
        `Tables go to ${l.resultsChannelId ? `<#${l.resultsChannelId}>` : "the channel they're submitted in"} for ${l.updaterRoles.length ? `<@&${l.updaterRoles[0]}>` : "people who can manage the server"} to verify.`,
        `${l.reporterRoles.length ? `<@&${l.reporterRoles[0]}> submit` : "Anyone in the server can submit"} with \`/ranked submit\`. Players tie their Discord to their name with \`/ranked join\`.`,
        `Its page: ${SITE_URL}${ladderPath(l.slug)}`,
      ];
      return say(lines.join("\n"));
    }
    case "submit": {
      const pick = await pickLadder(guildId, str("lounge") ?? str("ladder"));
      if (!pick.ok) return say(pick.message);
      if (pick.ladder.status !== "active") return say(`${pick.ladder.name} isn't taking tables right now.`);
      if (!canReport(pick.ladder, interaction)) return say("Only reporters and updaters can submit tables on this lounge.");
      return Response.json({ type: 9, data: submitForm(pick.ladder, "new", pick.ladder.id) });
    }
    case "mmr": {
      const pick = await pickLadder(guildId, str("lounge") ?? str("ladder"));
      if (!pick.ok) return say(pick.message);
      const ladder = pick.ladder;
      const named = str("name");
      const player = named ? await playerByName(ladder.id, named) : await playerForDiscord(ladder.id, by.id);
      if (!player) return say(named ? `Nobody called "${named}" is on ${ladder.name}.` : `Tie your Discord to your name first: \`/ranked join name:<your name>\`.`);
      const s = await playerSeason(ladder, player);
      if (!s.rating) return Response.json({ type: 4, data: { content: `**${player.name}** hasn't played a table on ${ladder.name} this season.`, allowed_mentions: { parse: [] } } });
      const r = s.rating;
      const last = s.history.slice(0, 5).map((h) => signed(h.delta)).join(" · ");
      return Response.json({ type: 4, data: {
        allowed_mentions: { parse: [] },
        embeds: [{
          color: COMP_COLOR, title: `${player.name} · ${ladder.name}`.slice(0, 256), url: `${SITE_URL}${ladderPlayerPath(ladder.slug, player.name)}`,
          fields: [
            { name: "MMR", value: num(r.mmr), inline: true },
            { name: "Division", value: r.division, inline: true },
            { name: "Rank", value: r.rank ? `#${num(r.rank)}` : "Unranked", inline: true },
            { name: "Events", value: num(r.events), inline: true },
            { name: "Win rate", value: r.events ? `${Math.round((r.wins / r.events) * 100)}%` : "None yet", inline: true },
            { name: "Peak", value: num(r.peak), inline: true },
            ...(last ? [{ name: "Last tables", value: last, inline: false }] : []),
          ],
          footer: { text: `Season ${ladder.season} · Ranked on GameShuffle` },
        }],
      } });
    }
    case "join": {
      const pick = await pickLadder(guildId, str("lounge") ?? str("ladder"));
      if (!pick.ok) return say(pick.message);
      const name = str("name");
      if (!name) return say("Which name do you play under?");
      const res = await linkDiscord(pick.ladder.id, by.id, name);
      const linked = res === "ok" ? await playerByName(pick.ladder.id, name) : null;
      const shown = linked?.name ?? name;
      // A player with no number this season starts from their MKCentral record (lounge system pick 15A); the lookup
      // can take a few seconds, so the reply comes first and says what was found when it's back.
      if (linked) {
        const appId = String(interaction.application_id ?? ""), token = String(interaction.token ?? "");
        after(async () => {
          const start = await startFromMkc(pick.ladder, linked).catch(() => null);
          if (start?.line) await editOriginal(appId, token, { content: `Done. \`/ranked mmr\` shows **${shown}** for you now.\n${start.line}` });
        });
      }
      const msg = {
        ok: `Done. \`/ranked mmr\` shows **${shown}** for you now.`,
        unknown: "",
        taken: `"${name}" is already tied to another Discord account. Ask an updater if that's wrong.`,
        has_other: "Your Discord is already tied to another name on this lounge. Ask an updater to move it.",
      }[res];
      if (res !== "unknown") return say(msg);
      // Not on the lounge yet: ask to join under that name (added at once when MKCentral vouches and the lounge allows it).
      const ask = await askToJoin(pick.ladder, by, name);
      if (!ask.ok) return say(ask.text);
      if (ask.joined) return say(`You're on ${pick.ladder.name} as **${ask.player.name}**.${ask.line ? `\n${ask.line}` : ""}`);
      return say(`Asked to join ${pick.ladder.name} as **${name.slice(0, 32)}**. ${ask.why}`);
    }
    case "penalty": {
      const pick = await pickLadder(guildId, str("lounge") ?? str("ladder"));
      if (!pick.ok) return say(pick.message);
      const ladder = pick.ladder;
      if (!isUpdater(ladder, interaction)) return say("Only updaters can give penalties.");
      const named = str("name");
      const player = named ? await playerByName(ladder.id, named) : null;
      if (!player) return say(`Nobody called "${named ?? ""}" is on ${ladder.name}.`);
      const kind = (str("for") ?? "other") as PenaltyKind;
      if (!(kind in ladder.settings.discipline.penalties)) return say("Pick what the penalty is for.");
      const mmr = opt("mmr"), strikes = opt("strikes");
      const res = await givePenalty(ladder, {
        playerId: player.id, kind, mmr: typeof mmr === "number" ? mmr : undefined, strikes: typeof strikes === "number" ? strikes : undefined, reason: str("reason"),
      }, actorOf(by));
      if (!res.ok) return say(res.error === "no_rating" ? `${player.name} has no MMR this season yet. Give a strike only (mmr: 0).` : "The penalty couldn't be given. Try again in a moment.");
      const label = ladder.settings.discipline.penalties[kind].label;
      const parts = [res.after !== res.before ? `${num(res.before)} → ${num(res.after)}` : null, res.strikes ? `${res.strikes} ${res.strikes === 1 ? "strike" : "strikes"}` : null].filter(Boolean).join(", ");
      const reason = str("reason");
      const lines = [`**Penalty for ${player.name}:** ${label}${parts ? ` (${parts})` : ""}.${reason && reason !== label ? ` ${reason}` : ""}`];
      if (res.breakUntil) lines.push(`That's ${ladder.settings.discipline.breakAt} active strikes: a break from the queue until <t:${Math.floor(Date.parse(res.breakUntil) / 1000)}:D>.`);
      return Response.json({ type: 4, data: {
        content: lines.join("\n"), allowed_mentions: { parse: [] },
        components: res.logId ? [{ type: 1, components: [{ type: 2, style: 2, label: "Take it back", custom_id: `${LADDER_PREFIX}pu:${res.logId}` }, { type: 2, style: 5, label: "Staff page", url: `${SITE_URL}${ladderStaffPath(ladder.slug)}?tab=penalties` }] }] : [],
      } });
    }
    case "name": {
      const pick = await pickLadder(guildId, str("lounge") ?? str("ladder"));
      if (!pick.ok) return say(pick.message);
      const player = await playerForDiscord(pick.ladder.id, by.id);
      if (!player) return say(`Tie your Discord to your name first: \`/ranked join name:<your name>\`.`);
      const wanted = str("new_name");
      if (!wanted) return say("Which name do you want?");
      const res = await requestName(pick.ladder, player.id, wanted, by, "discord");
      if (!res.ok) return say(res.text);
      return say(res.approved ? `Done. You're **${wanted.slice(0, 32)}** on ${pick.ladder.name} now.` : `Asked. ${res.why} You'll see it change on the lounge's page once it's approved.`);
    }
    case "queue":
      return handleQueueCommand(interaction, opt, str);
    case "staff": {
      const pick = await pickLadder(guildId, str("lounge") ?? str("ladder"));
      if (!pick.ok) return say(pick.message);
      if (!isUpdater(pick.ladder, interaction)) return say("The staff page is for the lounge's updaters and admins.");
      return say(`${pick.ladder.name}'s staff page: ${SITE_URL}${ladderStaffPath(pick.ladder.slug)}\nSign in with Discord there; your roles in this server let you in.`);
    }
    default:
      return say("Unknown GS Ranked command.");
  }
}

// ── Submitting ─────────────────────────────────────────────────────────────────────────────────

/** Checks a pending table and either sends it to the updaters (nothing to check) or shows the reporter what to look at. */
async function checkOrPost(ladder: Ladder, table: LadderTable, appId: string, token: string, notes: string[]): Promise<void> {
  const room = tableRoom(ladder, table);
  const keys = room.teams.flatMap((t) => t.players.map((p) => p.key));
  const known = new Set((await playersByKeys(ladder.id, keys)).keys());
  const names = keys.some((k) => !known.has(k)) ? await playerNames(ladder.id) : [];
  const issues = issuesFor(ladder, table, known, names);
  if (issues.length || notes.length) { await editOriginal(appId, token, checkMessage(ladder, table, issues, notes)); return; }
  await sendToUpdaters(ladder, table, issues, appId, token);
}

async function sendToUpdaters(ladder: Ladder, table: LadderTable, issues: ReturnType<typeof issuesFor>, appId: string, token: string): Promise<void> {
  // A lounge whose staff work on the web only gets no card here until the table is verified (name/web pick 6A).
  if (ladder.settings.staff.workIn === "web") {
    await editOriginal(appId, token, { content: `Table ${table.number} is with the updaters${table.autoAt ? `, and verifies on its own <t:${Math.floor(Date.parse(table.autoAt) / 1000)}:R> unless someone asks for a change` : ""}.` });
    return;
  }
  const posted = await postCard(ladder, table, { kind: "pending", issues: issues.filter((i) => i.level === "check") });
  if (posted.result !== "ok") {
    await editOriginal(appId, token, { content: posted.result === "no_access" ? "I can't post in the results channel. Give GameShuffle Competitive Send Messages and Attach Files there." : "The table couldn't be posted. Try again in a moment." });
    return;
  }
  await updateTable(table.id, { messageId: posted.messageId, channelId: posted.channelId });
  await editOriginal(appId, token, { content: `Table ${table.number} is with the updaters in <#${posted.channelId}>${table.autoAt ? `. It verifies on its own <t:${Math.floor(Date.parse(table.autoAt) / 1000)}:R> unless someone asks for a change` : ""}.` });
}

export async function handleLadderModal(interaction: Record<string, unknown>, customId: string): Promise<Response> {
  const by = who(interaction);
  if (!by) return say("Couldn't tell who you are.");
  const [kind, ref, roomRef] = customId.slice(LADDER_MODAL_PREFIX.length).split(":");
  const parts = modalParts(interaction);
  const appId = String(interaction.application_id ?? "");
  const token = String(interaction.token ?? "");
  const channelId = (interaction.channel_id as string | undefined) ?? null;

  if (kind === "new") {
    const ladder = await getLadder({ id: ref });
    if (!ladder) return say("That lounge is gone.");
    if (!canReport(ladder, interaction)) return say("Only reporters and updaters can submit tables on this lounge.");
    const shot = attachmentOf(interaction, parts.get("shot")?.values?.[0]);
    const text = String(parts.get("body")?.value ?? "").trim();
    const format = ladder.kind === "knockout" ? 1 : Number(parts.get("format")?.value ?? parts.get("format")?.values?.[0] ?? 1);
    if (!isFormat(format)) return say("Pick a format.");
    const tier = String(parts.get("tier")?.value ?? "").trim().slice(0, 12) || null;
    const missedText = String(parts.get("missed")?.value ?? "").trim();
    if (!shot && !text) return say(ladder.kind === "knockout" ? "Attach the results screenshot, or type the finishing order." : "Attach the results screenshot, or type the players and scores.");
    after(async () => {
      try {
        const notes: string[] = [];
        let body = text;
        // The screenshot is always read when there is one: it's the table when nothing was typed, and the check
        // that lets a clean table verify itself when something was (automation pick 1).
        const bytes = shot ? await fetchAttachment(shot) : null;
        let readBody: string | null = null;
        if (bytes) {
          const account = await accountForDiscord(by.id).catch(() => null);
          const read = await readLadderShot(bytes, { kind: ladder.kind, format, ladderId: ladder.id, userId: account });
          if (read.ok) { readBody = read.body; if (!text) { body = read.body; notes.push(...read.notes); } }
          else if (!text) {
            await editOriginal(appId, token, { content: read.error === "cap" ? "That's all the screenshots this lounge can read today. Type the table instead." : read.error === "not_results" ? "That screenshot doesn't look like a results screen. Try another, or type the table." : "The screenshot couldn't be read. Try again, or type the table." });
            return;
          }
        }
        const created = await createTable(ladder, { format, tier, body, by, channelId: ladder.resultsChannelId ?? channelId });
        if (!created) { await editOriginal(appId, token, { content: "The table couldn't be saved. Try again in a moment." }); return; }
        const { table, notes: more } = await intakeTable(ladder, created, { shot: bytes ? { bytes, contentType: shot!.content_type ?? "image/png" } : null, readBody, missedText });
        if (roomRef) await roomTableIn(ladder, roomRef, table.id);
        await checkOrPost(ladder, table, appId, token, [...notes, ...more]);
      } catch (err) {
        console.error("[ladders] submit failed:", err);
        await editOriginal(appId, token, { content: "The table couldn't be submitted. Try again in a moment." });
      }
    });
    return Response.json({ type: 5, data: { flags: EPHEMERAL } });
  }

  const table = await getTable(ref ?? "");
  if (!table) return say("That table is gone.");
  const ladder = await getLadder({ id: table.ladderId });
  if (!ladder) return say("That lounge is gone.");

  if (kind === "fix") {
    if (table.status !== "pending") return say("This table isn't waiting any more, so it can't be changed.");
    if (table.submittedBy !== by.id && !isUpdater(ladder, interaction)) return say("Only whoever submitted this table, or an updater, can fix it.");
    const body = String(parts.get("body")?.value ?? "").trim();
    if (!body) return say("The table needs some text.");
    const format = ladder.kind === "knockout" ? 1 : Number(parts.get("format")?.value ?? table.format);
    const tier = String(parts.get("tier")?.value ?? "").trim().slice(0, 12) || null;
    const missedText = String(parts.get("missed")?.value ?? "").trim();
    after(async () => {
      await updateTable(table.id, { body, format: isFormat(format) ? format : table.format, tier });
      const { table: fresh } = await intakeTable(ladder, (await getTable(table.id))!, { readBody: table.readBody, missedText });
      await logAction(ladder, actorOf(by), "fix", { tableId: table.id, detail: { number: table.number } });
      if (fresh.messageId) {
        const room = tableRoom(ladder, fresh);
        const keys = room.teams.flatMap((t) => t.players.map((p) => p.key));
        const known = new Set((await playersByKeys(ladder.id, keys)).keys());
        const issues = issuesFor(ladder, fresh, known, keys.some((k) => !known.has(k)) ? await playerNames(ladder.id) : []);
        if (blocking(issues)) { await editOriginal(appId, token, checkMessage(ladder, fresh, issues, [])); return; }
        await postCard(ladder, fresh, { kind: "pending", issues });
        await editOriginal(appId, token, { content: `Table ${fresh.number} is updated.` });
        return;
      }
      await checkOrPost(ladder, fresh, appId, token, []);
    });
    return Response.json({ type: 5, data: { flags: EPHEMERAL } });
  }

  if (kind === "back") {
    if (!isUpdater(ladder, interaction)) return say("Only updaters can send a table back.");
    const note = String(parts.get("note")?.value ?? "").trim().slice(0, 300) || null;
    if (!(await denyTable(table, by, note))) return say("This table isn't waiting any more.");
    after(async () => {
      await logAction(ladder, actorOf(by), "send_back", { tableId: table.id, detail: { number: table.number, note } });
      // Always posted: a send back has to reach the reporter, whichever place the staff work in.
      await postCard(ladder, (await getTable(table.id))!, { kind: "denied", note });
    });
    return say(`Table ${table.number} is sent back.`);
  }
  return say("Unknown form.");
}

// ── Buttons ────────────────────────────────────────────────────────────────────────────────────

export async function handleLadderComponent(interaction: Record<string, unknown>, customId: string): Promise<Response> {
  const by = who(interaction);
  if (!by) return say("Couldn't tell who you are.");
  const [kind, ref] = customId.slice(LADDER_PREFIX.length).split(":");
  if (kind === "pu") return takeBackPenalty(interaction, by, ref ?? "");
  const table = await getTable(ref ?? "");
  if (!table) return say("That table is gone.");
  const ladder = await getLadder({ id: table.ladderId });
  if (!ladder) return say("That lounge is gone.");
  const appId = String(interaction.application_id ?? "");
  const token = String(interaction.token ?? "");

  switch (kind) {
    case "s": { // Send it (the reporter's check)
      if (table.status !== "pending" || table.messageId) return update("This table was already sent.");
      if (table.submittedBy !== by.id && !isUpdater(ladder, interaction)) return say("Only whoever submitted this table can send it.");
      after(async () => {
        const room = tableRoom(ladder, table);
        const keys = room.teams.flatMap((t) => t.players.map((p) => p.key));
        const known = new Set((await playersByKeys(ladder.id, keys)).keys());
        const issues = issuesFor(ladder, table, known, keys.some((k) => !known.has(k)) ? await playerNames(ladder.id) : []);
        if (blocking(issues)) { await editOriginal(appId, token, checkMessage(ladder, table, issues, [])); return; }
        await sendToUpdaters(ladder, table, issues, appId, token);
      });
      return Response.json({ type: 6 });
    }
    case "c": { // Cancel (the reporter's check)
      if (table.status !== "pending" || table.messageId) return update("This table was already sent; an updater can send it back.");
      if (table.submittedBy !== by.id) return say("Only whoever submitted this table can cancel it.");
      await denyTable(table, by, "Canceled by the reporter.");
      return update(`Table ${table.number} is canceled.`);
    }
    case "f": { // Fix the text
      if (table.status !== "pending") return say("This table isn't waiting any more, so it can't be changed.");
      if (table.submittedBy !== by.id && !isUpdater(ladder, interaction)) return say("Only whoever submitted this table, or an updater, can fix it.");
      const names = new Map(tableRoom(ladder, table).teams.flatMap((t) => t.players.map((p) => [p.key, p.name] as const)));
      return Response.json({ type: 9, data: submitForm(ladder, "fix", table.id, { body: table.body, format: table.format, tier: table.tier, missed: table.missed.map((m) => `${names.get(m.key) ?? m.key} ${m.races}`).join(", ") }) });
    }
    case "v": { // Verify
      if (!isUpdater(ladder, interaction)) return say("Only updaters can verify tables.");
      if (table.status !== "pending") return say("This table isn't waiting any more.");
      after(async () => {
        const res = await verifyTable(ladder, table, by);
        if (!res.ok) { await followUp(appId, token, res.error === "not_pending" ? "Someone else already dealt with this table." : "The table couldn't be verified. Try again in a moment."); return; }
        await logAction(ladder, actorOf(by), "verify", { tableId: table.id, detail: { number: table.number } });
        const fresh = (await getTable(table.id))!;
        const state: CardState = { kind: "verified", result: res.result };
        const posted = await postCard(ladder, fresh, state);
        if (posted.result !== "ok") await followUp(appId, token, "Verified, but the card couldn't be changed.");
      });
      return Response.json({ type: 6 });
    }
    case "b": { // Send back: a form for why
      if (!isUpdater(ladder, interaction)) return say("Only updaters can send a table back.");
      if (table.status !== "pending") return say("This table isn't waiting any more.");
      return Response.json({ type: 9, data: {
        custom_id: `${LADDER_MODAL_PREFIX}back:${table.id}`, title: `Send back table ${table.number}`,
        components: [{ type: 18, label: "What needs fixing", description: "Optional. The reporter sees it on the card.", component: { type: 4, custom_id: "note", style: 2, required: false, max_length: 300 } }],
      } });
    }
    case "u": { // Undo: ask first
      if (!isUpdater(ladder, interaction)) return say("Only updaters can undo a table.");
      if (table.status !== "verified") return say("This table isn't verified.");
      return say(`Undo table ${table.number}? Everyone's MMR moves back by what it gave them.`, [row(btn("Undo it", `${LADDER_PREFIX}uu:${table.id}`, 4))]);
    }
    case "uu": {
      if (!isUpdater(ladder, interaction)) return say("Only updaters can undo a table.");
      if (table.status !== "verified") return update("This table isn't verified any more.");
      if (!(await undoTable(table, by))) return update("The table couldn't be undone. Try again in a moment.");
      after(async () => {
        await logAction(ladder, actorOf(by), "undo", { tableId: table.id, detail: { number: table.number } });
        if (ladder.settings.roles.on) { const { rolesAfter } = await import("@/lib/ladders/roles"); await rolesAfter(ladder, (await tableChanges(table)).map((c) => c.playerId)); }
        await postCard(ladder, (await getTable(table.id))!, { kind: "undone" });
      });
      return update(`Table ${table.number} is undone. Everyone's MMR moved back.`);
    }
    default:
      return say("Unknown button.");
  }
}

/** A penalty reply's Take it back button (updaters). */
async function takeBackPenalty(interaction: Record<string, unknown>, by: { id: string; name: string }, logId: string): Promise<Response> {
  const { data } = await createServiceClient().from("ladder_staff_log").select("ladder_id").eq("id", logId).maybeSingle();
  const ladder = data ? await getLadder({ id: (data as { ladder_id: string }).ladder_id }) : null;
  if (!ladder) return say("That penalty is gone.");
  if (!isUpdater(ladder, interaction)) return say("Only updaters can take a penalty back.");
  const res = await undoPenalty(ladder, logId, actorOf(by));
  if (res === "already") return say("That penalty was already taken back.");
  if (res !== "ok") return say("That penalty is gone.");
  const was = String((interaction.message as { content?: string } | undefined)?.content ?? "");
  return Response.json({ type: 7, data: { content: `${was}\n**Taken back by ${by.name}.**`.slice(0, 2000), components: [], allowed_mentions: { parse: [] } } });
}

// ── Autocomplete ───────────────────────────────────────────────────────────────────────────────

export async function ladderAutocomplete(interaction: Record<string, unknown>): Promise<Response> {
  const guildId = (interaction.guild_id as string | undefined) ?? null;
  const sub = ((interaction.data as { options?: Opt[] } | undefined)?.options ?? [])[0];
  const focused = sub?.options?.find((o) => o.focused);
  const q = String(focused?.value ?? "").trim().toLowerCase();
  if (!guildId || !focused) return Response.json({ type: 8, data: { choices: [] } });
  const ladders = await laddersInGuild(guildId).catch(() => []);
  if (focused.name === "lounge" || focused.name === "ladder") {
    const choices = ladders.filter((l) => !q || l.name.toLowerCase().includes(q) || l.slug.includes(q)).slice(0, 25).map((l) => ({ name: l.name.slice(0, 100), value: l.slug }));
    return Response.json({ type: 8, data: { choices } });
  }
  if (focused.name === "name") {
    const slug = sub?.options?.find((o) => o.name === "lounge" || o.name === "ladder")?.value;
    const ladder = (typeof slug === "string" && ladders.find((l) => l.slug === slug)) || ladders[0];
    if (!ladder) return Response.json({ type: 8, data: { choices: [] } });
    const { data } = await createServiceClient().from("ladder_players").select("name").eq("ladder_id", ladder.id).ilike("name_key", `${nameKey(q).replace(/[%_\\]/g, "\\$&")}%`).order("name_key").limit(25);
    return Response.json({ type: 8, data: { choices: ((data ?? []) as { name: string }[]).map((r) => ({ name: r.name, value: r.name })) } });
  }
  return Response.json({ type: 8, data: { choices: [] } });
}
