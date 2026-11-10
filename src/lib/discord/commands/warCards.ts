/**
 * Overrides for wars (GameShuffle Competitive; picks 2026-11-09, all as recommended). Whatever the bot works out on
 * its own can be set by hand and sticks:
 *   /me                        your own war card: the name and flag tables show for you, your in-game names, your teams
 *   /team set tag [name] [also] [color]   a team card: its name, the other tags it plays under, its color
 *   /team players tag          the team's players, one per line: Jalen = peep/Sxyd [us]
 *   /team show tag | /team remove tag
 *   /race line                 a race or fix typed the way the other war bots take it (12378, SSC, back, pen 15 FRVR)
 * Plus "Typed races" on a war card's More menu: how this server's typed lines read and whether a channel reads them.
 * Who can change what (pick 2, like /logo): anyone fills in something blank; changing someone else's takes them or a
 * server manager.
 *   wcard:me | wcard:melounge | wcard:rmteam:<teamId> | wcard:rl (menu) | wcard:typed:<on|off>
 *   wcardm:me | wcardm:players:<teamId>
 */

import { after } from "next/server";
import { getDiscordUser } from "../user";
import { canManageGuild } from "../guildOwner";
import { appOfApplicationId } from "../appIds";
import { COMP_COLOR } from "../ttPanel";
import { loungeBasic } from "@/lib/mmr/mkcentral";
import { READS_LIKE, isReadsLike } from "@/lib/wars/legacy";
import { readRosterLines } from "@/lib/wars/cards";
import {
  cardsReady, linkMkc, linksReady, listTeams, playerCard, readsLikeFor, removeRosterRow, removeTeam, rosterOf, savePlayerCard, saveTeam, setLogoSource, setReadsLike,
  setRoster, setTypedOn, teamById, teamFor, typedOn, unlinkMkc, type TeamCardRow,
} from "@/lib/wars/cardStore";
import { getWar, latestWar, liveWar, warChannel, type War } from "@/lib/wars/store";
import { mkcIdFrom, mkcTeamsWithTag, rosterFor, searchMkcTeams } from "@/lib/wars/mkcTeams";
import { redrawSides } from "@/lib/wars/redraw";
import type { WarGame } from "@/lib/wars/rules";
import { editCard, postCard } from "@/lib/wars/discord";
import { runTyped } from "@/lib/wars/typed";
import { tagKey } from "@/lib/wars/tags";
import { listLogos } from "@/lib/wars/logos";
import { SITE_URL } from "@/lib/seo";

export const CARD_PREFIX = "wcard:";
export const CARD_MODAL_PREFIX = "wcardm:";
const EPHEMERAL = 64;

const say = (content: string, components: unknown[] = [], extra: Record<string, unknown> = {}) => Response.json({ type: 4, data: { content, components, flags: EPHEMERAL, allowed_mentions: { parse: [] }, ...extra } });
const update = (content: string, components: unknown[] = [], extra: Record<string, unknown> = {}) => Response.json({ type: 7, data: { content, components, embeds: [], allowed_mentions: { parse: [] }, ...extra } });
const btn = (label: string, id: string, style: 1 | 2 | 3 | 4 = 2) => ({ type: 2, style, label: label.slice(0, 80), custom_id: id });
const linkBtn = (label: string, url: string) => ({ type: 2, style: 5, label, url });
const row = (...components: unknown[]) => ({ type: 1, components });
const NOT_READY = "Player and team cards arrive with the next GameShuffle update.";

function who(interaction: Record<string, unknown>): { id: string; name: string } | null {
  const user = getDiscordUser(interaction);
  if (!user?.id) return null;
  const nick = (interaction.member as { nick?: string | null } | undefined)?.nick;
  return { id: user.id, name: (nick || user.global_name || user.username || "Someone").slice(0, 32) };
}

type Opt = { name: string; type?: number; value?: unknown; options?: Opt[]; focused?: boolean };
type ModalPart = { custom_id?: string; value?: string | null };
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

const flagShown = (code: string | null) => (code ? `\`[${code}]\`` : "");
const teamsPage = (guildId: string) => `${SITE_URL}/account/discord/logos/${guildId}`;

// ── /me ───────────────────────────────────────────────────────────────────────────────────────

async function loungeFor(discordId: string): Promise<{ name: string; flag: string | null } | null> {
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 2500));
  for (const game of ["mk8dx", "mkworld12p"] as const) {
    const p = await Promise.race([loungeBasic({ discordId }, game).catch(() => null), timeout]);
    if (p?.name) return { name: p.name, flag: p.country ? p.country.toLowerCase() : null };
  }
  return null;
}

async function meMessage(discordId: string): Promise<{ content: string; embeds: unknown[]; components: unknown[] }> {
  const card = await playerCard(discordId);
  const lounge = card?.shown && card.flag ? null : await loungeFor(discordId);
  const shown = card?.shown ?? lounge?.name ?? null;
  const flag = card?.flag ?? lounge?.flag ?? null;
  const from = !card && lounge ? "Name and flag from your MKCentral profile. " : "";
  return {
    content: "",
    embeds: [{
      color: COMP_COLOR,
      title: "Your war card",
      fields: [
        { name: "Shown on tables as", value: shown ? `**${shown}** ${flagShown(flag)}`.trim() : "Your in-game name (nothing set)", inline: false },
        { name: "In-game names", value: card?.ingame.length ? card.ingame.join(", ") : "None yet. Add the names you race under so tables know it's you.", inline: false },
        { name: "Teams", value: card?.teams.length ? card.teams.join(", ") : "None yet", inline: false },
      ],
      footer: { text: `${from}Used in every server. A server's own player list wins in that server.`.trim() },
    }],
    components: [row(
      btn(card ? "Edit my card" : "Set up my card", `${CARD_PREFIX}me`, 1),
      ...(lounge && (lounge.name !== card?.shown || lounge.flag !== card?.flag) ? [btn(`Use ${lounge.name}${lounge.flag ? ` [${lounge.flag}]` : ""}`, `${CARD_PREFIX}melounge`)] : []),
    )],
  };
}

export async function handleMeCommand(interaction: Record<string, unknown>): Promise<Response> {
  if (appOfApplicationId(interaction.application_id) !== "comp") return say("War cards come with GameShuffle Competitive.");
  const by = who(interaction);
  if (!by) return say("Couldn't tell who you are.");
  if (!(await cardsReady())) return say(NOT_READY);
  const msg = await meMessage(by.id);
  return say(msg.content, msg.components, { embeds: msg.embeds });
}

function meForm(card: Awaited<ReturnType<typeof playerCard>>, lounge: { name: string; flag: string | null } | null): Record<string, unknown> {
  return {
    custom_id: `${CARD_MODAL_PREFIX}me`,
    title: "Your war card",
    components: [
      { type: 18, label: "Name on tables", description: "What tables show for you. Your lounge name, usually.", component: { type: 4, custom_id: "shown", style: 1, required: false, max_length: 32, ...(card?.shown ?? lounge?.name ? { value: card?.shown ?? lounge?.name } : {}) } },
      { type: 18, label: "Flag code", description: "Two letters, like us or mx (gb_eng for England)", component: { type: 4, custom_id: "flag", style: 1, required: false, max_length: 14, ...(card?.flag ?? lounge?.flag ? { value: card?.flag ?? lounge?.flag } : {}) } },
      { type: 18, label: "In-game names", description: "One per line: every name you race under, without your team's tag", component: { type: 4, custom_id: "ingame", style: 2, required: false, max_length: 300, ...(card?.ingame.length ? { value: card.ingame.join("\n") } : {}) } },
      { type: 18, label: "Teams you race for", description: "Their tags or names, one per line (so your name only matches on your team's tables)", component: { type: 4, custom_id: "teams", style: 2, required: false, max_length: 120, ...(card?.teams.length ? { value: card.teams.join("\n") } : {}) } },
    ],
  };
}

// ── /team ─────────────────────────────────────────────────────────────────────────────────────

function teamEmbed(team: TeamCardRow, players: Awaited<ReturnType<typeof rosterOf>>): Record<string, unknown> {
  const lines = players.slice(0, 20).map((p) => `${p.ingame}${p.shown ? ` → **${p.shown}**` : ""}${p.flag ? ` \`${p.flag}\`` : ""}`);
  return {
    color: team.color ? parseInt(team.color.slice(1), 16) : COMP_COLOR,
    title: team.name ?? team.tags[0],
    fields: [
      { name: "Tags", value: team.tags.map((t, i) => (i === 0 ? `**${t}** (shown)` : t)).join(", "), inline: false },
      { name: "Logo", value: team.logoSource === "upload" ? "Your upload only" : team.logoSource === "mkcentral" ? "From MKCentral" : "Automatic: your upload, then MKCentral", inline: true },
      { name: "MKCentral", value: team.mkcTeamId ? `[${team.mkcName ?? "Linked"}](https://mkcentral.com/en-us/registry/teams/profile?id=${team.mkcTeamId})` : "Not linked (/team link)", inline: true },
      { name: `Players${players.length ? ` (${players.length})` : ""}`, value: lines.length ? `${lines.join("\n")}${players.length > 20 ? `\n…and ${players.length - 20} more` : ""}` : "None yet. Add them with /team players.", inline: false },
    ],
  };
}

function playersForm(team: TeamCardRow, players: Awaited<ReturnType<typeof rosterOf>>): Record<string, unknown> {
  const text = players.map((p) => `${p.ingame}${p.shown ? ` = ${p.shown}` : ""}${p.flag ? ` [${p.flag}]` : ""}`).join("\n");
  return {
    custom_id: `${CARD_MODAL_PREFIX}players:${team.id}`,
    title: `${team.name ?? team.tags[0]}'s players`.slice(0, 45),
    components: [{
      type: 18, label: "One per line", description: "In-game name, then the name for tables, then a flag: Jalen = peep/Sxyd [us]",
      component: { type: 4, custom_id: "lines", style: 2, required: false, max_length: 2000, placeholder: "Jalen = peep/Sxyd [us]\nnsn = neiseun [us]", ...(text ? { value: text.slice(0, 2000) } : {}) },
    }],
  };
}

export async function handleTeamCommand(interaction: Record<string, unknown>): Promise<Response> {
  if (appOfApplicationId(interaction.application_id) !== "comp") return say("Team cards come with GameShuffle Competitive.");
  const guildId = (interaction.guild_id as string | undefined) ?? null;
  if (!guildId) return say("Teams belong to a server: use /team in one.");
  const by = who(interaction);
  if (!by) return say("Couldn't tell who you are.");
  if (!(await cardsReady())) return say(NOT_READY);
  const sub = ((interaction.data as { options?: Opt[] } | undefined)?.options ?? [])[0];
  const opt = (n: string) => sub?.options?.find((o) => o.name === n)?.value;
  const tag = String(opt("tag") ?? "").trim().replace(/\s+/g, " ").slice(0, 12);
  if (!tag) return say("Which team? Give its tag, like KC.");
  const manage = canManageGuild(interaction);

  if (sub?.name === "set") {
    const old = await teamFor(guildId, tag);
    const also = String(opt("also") ?? "").split(/[\s,]+/).filter(Boolean);
    const name = opt("name") === undefined ? undefined : String(opt("name"));
    const color = opt("color") === undefined ? undefined : String(opt("color"));
    const res = await saveTeam(guildId, { id: old?.id, ...(old ? {} : { tags: [tag] }), addTags: also, name, color }, by, manage);
    if (!res.ok) {
      if (res.error === "tag_taken") return say(`${res.other?.name ?? res.other?.tags[0]} already plays under one of those tags. Remove it there first.`);
      if (res.error === "not_yours") return say(`${res.other?.createdByName ?? "Someone else"} set this team up. Only they, or someone who can manage the server, can change what's there; blank parts anyone can fill.`);
      return say(res.error === "not_ready" ? NOT_READY : "Give the team a tag, like KC.");
    }
    after(async () => { await redrawLive(guildId, res.team.tags); });
    return say(res.created ? "Team card made. Tables and new wars in this server use it." : "Team card updated.", [row(btn("Add players", `${CARD_PREFIX}players:${res.team.id}`, 1), linkBtn("Teams page", teamsPage(guildId)))], { embeds: [teamEmbed(res.team, await rosterOf(res.team.id))] });
  }

  if (sub?.name === "players") {
    let team = await teamFor(guildId, tag);
    if (!team) {
      const made = await saveTeam(guildId, { tags: [tag] }, by, manage);
      if (!made.ok) return say(made.error === "not_ready" ? NOT_READY : "That team couldn't be set up.");
      team = made.team;
    }
    return Response.json({ type: 9, data: playersForm(team, await rosterOf(team.id)) });
  }

  if (sub?.name === "link" || sub?.name === "unlink" || sub?.name === "logo") {
    if (!(await linksReady())) return say("Logo settings and MKCentral links arrive with the next GameShuffle update.");
    let team = await teamFor(guildId, tag);
    if (!team && sub.name !== "unlink") {
      const made = await saveTeam(guildId, { tags: [tag] }, by, manage);
      if (!made.ok) return say(made.error === "not_ready" ? NOT_READY : "That team couldn't be set up.");
      team = made.team;
    }
    if (!team) return say(`There's no team card for **${tag}** in this server.`);
    const notYours = `${team.createdByName ?? "Someone else"} set this team up. Only they, or someone who can manage the server, can change its logo or link.`;
    const game = await gameHere(guildId, (interaction.channel_id as string | undefined) ?? null);
    if (sub.name === "logo") {
      const source = String(opt("source") ?? "auto");
      if (source !== "auto" && source !== "upload" && source !== "mkcentral") return say("Pick Automatic, Upload or From MKCentral.");
      const res = await setLogoSource(team.id, source, by, manage);
      if (!res.ok) return say(res.error === "not_yours" ? notYours : "That team card is gone.");
      after(async () => { await redrawSides(guildId, res.team.tags, game); });
      const line = source === "auto" ? "Automatic: your upload, then the linked MKCentral team's, then MKCentral by tag."
        : source === "upload" ? `Only your upload. Add one with /logo add tag:${res.team.tags[0]}.`
        : res.team.mkcTeamId ? `The logo of ${res.team.mkcName ?? "the linked MKCentral team"}.` : `The MKCentral team with the tag ${res.team.tags[0]}. Link the right one with /team link to be sure.`;
      return say(`${res.team.name ?? res.team.tags[0]}'s logo: ${line}`);
    }
    if (sub.name === "unlink") {
      const res = await unlinkMkc(team.id, by, manage);
      if (!res.ok) return say(res.error === "not_yours" ? notYours : "That team card is gone.");
      after(async () => { await redrawSides(guildId, res.team.tags, game); });
      return say(`${res.team.name ?? res.team.tags[0]} isn't linked to MKCentral any more. Its players' names stay as your server set them.`);
    }
    const id = mkcIdFrom(String(opt("mkcentral") ?? ""));
    if (!id) return say("Pick a team from the list as you type, or paste its MKCentral link.");
    const res = await linkMkc(team.id, id, game, by, manage);
    if (!res.ok) return say(res.error === "not_yours" ? notYours : res.error === "no_team" ? "MKCentral didn't answer for that team. Check the link, or try again in a moment." : "That team card is gone.");
    after(async () => { await redrawSides(guildId, res.team.tags, game); });
    const roster = res.mkc ? rosterFor(res.mkc, game) : null;
    return say("", [row(linkBtn("Teams page", teamsPage(guildId)), linkBtn("On MKCentral", `https://mkcentral.com/en-us/registry/teams/profile?id=${id}`))], { embeds: [{
      color: COMP_COLOR,
      title: `${res.team.name ?? res.team.tags[0]} is linked to MKCentral`,
      fields: [
        { name: "MKCentral team", value: `${res.team.mkcName ?? res.mkc?.name ?? "?"} · ${roster?.tag || res.mkc?.tag || "?"}`, inline: false },
        { name: "Players", value: roster?.players.length ? `${roster.players.length}, with their countries. Names on tables fill in from them; your server's own lines still win.` : "None for this game on MKCentral yet.", inline: false },
        { name: "Logo", value: res.mkc?.logo ? ((res.team.logoSource ?? "auto") === "upload" ? "MKCentral has one; this card is set to your upload." : "From MKCentral, unless you've uploaded one (Automatic uses your upload first).") : "None on MKCentral, so your upload stays.", inline: false },
      ],
    }] });
  }

  if (sub?.name === "show") {
    const team = await teamFor(guildId, tag);
    if (!team) return say(`There's no team card for **${tag}** in this server. Make one with /team set.`);
    return say("", [row(linkBtn("Teams page", teamsPage(guildId)))], { embeds: [teamEmbed(team, await rosterOf(team.id))] });
  }

  if (sub?.name === "remove") {
    const team = await teamFor(guildId, tag);
    if (!team) return say(`There's no team card for **${tag}** in this server.`);
    return say(`Remove ${team.name ?? team.tags[0]}'s card and its player list? Logos stay.`, [row(btn("Remove it", `${CARD_PREFIX}rmteam:${team.id}`, 4))]);
  }
  return say("Pick set, players, link, logo, show or remove.");
}

export async function teamAutocomplete(interaction: Record<string, unknown>): Promise<Response> {
  const guildId = (interaction.guild_id as string | undefined) ?? null;
  const sub = ((interaction.data as { options?: Opt[] } | undefined)?.options ?? [])[0];
  const focused = sub?.options?.find((o) => o.focused);
  const q = String(focused?.value ?? "").trim().toLowerCase();
  if (focused?.name === "mkcentral") {
    const raw = String(focused.value ?? "").trim();
    const pasted = mkcIdFrom(raw);
    if (pasted && !/^\d+$/.test(raw)) return Response.json({ type: 8, data: { choices: [{ name: `The team at that link (${pasted})`, value: String(pasted) }] } });
    const game = guildId ? await gameHere(guildId, (interaction.channel_id as string | undefined) ?? null) : "mk8dx";
    const typed = raw || String(sub?.options?.find((o) => o.name === "tag")?.value ?? "");
    const hits = typed ? await searchMkcTeams(typed, game).catch(() => []) : [];
    return Response.json({ type: 8, data: { choices: hits.slice(0, 25).map((h) => ({ name: `${h.name} · ${h.tag}${h.players ? ` · ${h.players} players` : ""}${h.logo ? " · logo" : ""}`.slice(0, 100), value: String(h.id) })) } });
  }
  if (!guildId) return Response.json({ type: 8, data: { choices: [] } });
  const [teams, logos] = await Promise.all([listTeams(guildId).catch(() => []), listLogos(guildId).catch(() => [])]);
  const seen = new Set<string>();
  const choices: { name: string; value: string }[] = [];
  for (const t of teams) {
    const tag = t.tags[0];
    if (q && !t.tags.some((g) => g.toLowerCase().startsWith(q)) && !(t.name ?? "").toLowerCase().includes(q)) continue;
    seen.add(tagKey(tag));
    choices.push({ name: `${tag}${t.name ? ` · ${t.name}` : ""}${t.tags.length > 1 ? ` (also ${t.tags.slice(1).join(", ")})` : ""}`.slice(0, 100), value: tag });
  }
  for (const l of logos) {
    if (seen.has(tagKey(l.tag)) || (q && !l.tag.toLowerCase().startsWith(q))) continue;
    choices.push({ name: `${l.tag}${l.name ? ` · ${l.name}` : ""} · logo only`.slice(0, 100), value: l.tag });
  }
  if (q && !choices.some((c) => c.value.toLowerCase() === q)) choices.unshift({ name: `${q} (new team)`, value: q.slice(0, 12) });
  return Response.json({ type: 8, data: { choices: choices.slice(0, 25) } });
}

/** The game this server's wars are in: the channel's, else Mario Kart 8 Deluxe. */
async function gameHere(guildId: string, channelId: string | null): Promise<WarGame> {
  const ch = channelId ? await warChannel(guildId, channelId).catch(() => null) : null;
  return ch?.game ?? "mk8dx";
}

/** Live wars in the server showing any of these tags get their card redrawn (and the team as its card now says). */
const redrawLive = (guildId: string, tags: string[]) => redrawSides(guildId, tags);

// ── /race ─────────────────────────────────────────────────────────────────────────────────────

const HOW = "Type it the way you would in chat: 12378, 1-378, 1 3 5 7 9 11, SSC, SSC 12378, back, race 3 1-378, pen 15 FRVR, unpen 15, %tag FRVR.";

/** The channel's war a typed line is for: the live one, else the last one if it hasn't been ended (fixes after the last race). */
async function warHere(guildId: string, channelId: string): Promise<War | null> {
  const live = await liveWar(guildId, channelId);
  if (live) return live;
  const last = await latestWar(guildId, channelId);
  return last && last.status !== "ended" && Date.now() - Date.parse(last.updatedAt) < 6 * 3600_000 ? last : null;
}

export async function handleRaceCommand(interaction: Record<string, unknown>): Promise<Response> {
  if (appOfApplicationId(interaction.application_id) !== "comp") return say("Wars come with GameShuffle Competitive.");
  const guildId = (interaction.guild_id as string | undefined) ?? null;
  const channelId = (interaction.channel_id as string | undefined) ?? null;
  if (!guildId || !channelId) return say("Use /race in the war's channel.");
  const by = who(interaction);
  if (!by) return say("Couldn't tell who you are.");
  const line = String(((interaction.data as { options?: Opt[] } | undefined)?.options ?? []).find((o) => o.name === "line")?.value ?? "");
  const war = await warHere(guildId, channelId);
  if (!war) return say("There's no war in this channel. Start one with /war.");
  const res = await runTyped(war, line, by);
  if (res.kind === "none") return say(`Couldn't read "${line.slice(0, 40)}". ${HOW}`);
  if (res.card) after(async () => { await (res.card === "post" ? postCard(war.id) : editCard(war.id)); });
  if (!res.ok) return say(res.text ?? "That didn't go in.");
  const done = res.text ?? (res.kind === "race" ? `Race ${war.races.length + 1} is in.` : res.kind === "track" ? "Track set for the next race." : "Done.");
  return say(done);
}

// ── /war asking which MKCentral team a tag is (pick 9) ───────────────────────────────────────

/**
 * Menus for the teams in a new war that MKCentral has teams for under that exact tag, when this server hasn't linked
 * or answered for that tag yet. The first time only: an answer (a team, or None of these) is kept on the team card.
 */
export async function mkcQuestion(war: War): Promise<{ lines: string[]; rows: unknown[] }> {
  const out: { lines: string[]; rows: unknown[] } = { lines: [], rows: [] };
  if (!(await linksReady())) return out;
  // Both teams at once: MKCentral can take a few seconds to answer.
  const asks = await Promise.all((["them", "us"] as const).map(async (side) => {
    const tag = war[side].tag;
    const card = await teamFor(war.guildId, tag).catch(() => null);
    if (card?.mkcTeamId || card?.mkcCheckedAt) return { side, tag, hits: [] };
    return { side, tag, hits: await mkcTeamsWithTag(tag, war.game).catch(() => []) };
  }));
  for (const { side, tag, hits } of asks) {
    if (!hits.length) continue;
    out.lines.push(`Which MKCentral team is **${tag}**? Linking fills in its players' names and countries on tables.`);
    out.rows.push(row({
      type: 3, custom_id: `${CARD_PREFIX}mkc:${war.id}:${side}`, placeholder: `Which MKCentral team is ${tag}?`,
      options: [
        ...hits.slice(0, 24).map((h) => ({ label: `${h.name} · ${h.tag}`.slice(0, 100), value: String(h.id), description: `${h.players ? `${h.players} players` : "No players listed"}${h.logo ? " · has a logo" : ""}`.slice(0, 100) })),
        { label: "None of these", value: "none", description: "Don't ask again. /team link any time." },
      ],
    }));
  }
  return out;
}

// ── Typed races on a war card's More menu ────────────────────────────────────────────────────

/**
 * Whether Competitive reads plain chat messages yet: that needs the always-on worker (discord-worker on Railway)
 * connected as Competitive with Message Content on. Until then only /race takes typed lines, and the channel switch
 * stays out of sight.
 */
const CHAT_READING = process.env.WARS_CHAT_READING === "1";

/** "Typed races": how this server's typed lines read, and (once chat is read) whether this channel reads plain messages. */
export async function typedSettings(guildId: string, channelId: string): Promise<{ content: string; components: unknown[] }> {
  const [rl, on] = await Promise.all([readsLikeFor(guildId), typedOn(guildId, channelId)]);
  const now = READS_LIKE.find((r) => r.id === rl) ?? READS_LIKE[0];
  const chat = CHAT_READING
    ? `Plain messages in this channel: **${on ? "read while a war is live" : "not read"}**. /race takes the same lines.`
    : "Type them with /race for now, like /race 1-378 or /race pen 15 FRVR. Reading them straight from chat comes later.";
  return {
    content: `**How typed races read here: like ${now.label}.** ${now.line}.\n${chat}`,
    components: [
      row({ type: 3, custom_id: `${CARD_PREFIX}rl`, placeholder: "Reads like…", options: READS_LIKE.map((r) => ({ label: r.label, value: r.id, description: r.line.slice(0, 100), default: r.id === rl })) }),
      ...(CHAT_READING ? [row(btn(on ? "Stop reading plain messages here" : "Read plain messages here", `${CARD_PREFIX}typed:${on ? "off" : "on"}`))] : []),
    ],
  };
}

// ── Buttons, menus and forms ──────────────────────────────────────────────────────────────────

export async function handleCardComponent(interaction: Record<string, unknown>, customId: string): Promise<Response> {
  const by = who(interaction);
  if (!by) return say("Couldn't tell who you are.");
  if (!(await cardsReady())) return say(NOT_READY);
  const [kind, arg, extra] = customId.slice(CARD_PREFIX.length).split(":");
  const guildId = (interaction.guild_id as string | undefined) ?? null;
  const channelId = (interaction.channel_id as string | undefined) ?? null;
  const manage = canManageGuild(interaction);

  if (kind === "mkc") {
    const war = await getWar(arg ?? "");
    const side = extra === "us" ? "us" : "them";
    if (!war || war.guildId !== guildId) return update("That war is gone.");
    const tag = war[side].tag;
    const v = ((interaction.data as { values?: string[] } | undefined)?.values ?? [])[0];
    let team = await teamFor(war.guildId, tag);
    if (!team) {
      const made = await saveTeam(war.guildId, { tags: [tag], name: war[side].name }, by, manage);
      if (!made.ok) return update("That team couldn't be set up. Try /team link.");
      team = made.team;
    }
    if (v === "none") {
      await unlinkMkc(team.id, by, manage);
      return update(`Got it: ${tag} isn't linked. /team link tag:${tag} links it any time.`);
    }
    const res = await linkMkc(team.id, Number(v), war.game, by, manage);
    if (!res.ok) return update(res.error === "no_team" ? "MKCentral didn't answer. Try /team link in a moment." : res.error === "not_yours" ? `${res.other?.createdByName ?? "Someone else"} already linked ${tag}. /team show tag:${tag} shows it.` : "That team card is gone.");
    after(async () => { await redrawSides(war.guildId, res.team.tags, war.game); });
    const players = res.mkc ? rosterFor(res.mkc, war.game)?.players.length ?? 0 : 0;
    return update(`${tag} is MKCentral's ${res.team.mkcName ?? "team"} now${players ? `, ${players} players` : ""}. Change it with /team link or /team unlink.`);
  }

  if (kind === "me") {
    const card = await playerCard(by.id);
    return Response.json({ type: 9, data: meForm(card, card?.shown && card.flag ? null : await loungeFor(by.id)) });
  }
  if (kind === "melounge") {
    const lounge = await loungeFor(by.id);
    if (!lounge) return update("MKCentral didn't answer. Try Edit my card instead.");
    await savePlayerCard(by.id, { shown: lounge.name, flag: lounge.flag });
    const msg = await meMessage(by.id);
    return update(msg.content, msg.components, { embeds: msg.embeds });
  }
  if (kind === "players") {
    const team = await teamById(arg ?? "");
    if (!team || team.guildId !== guildId) return say("That team card is gone.");
    return Response.json({ type: 9, data: playersForm(team, await rosterOf(team.id)) });
  }
  if (kind === "rmteam") {
    const team = await teamById(arg ?? "");
    if (!team || team.guildId !== guildId) return update("That team card is already gone.");
    const res = await removeTeam(team.id, by, manage);
    return update(res === "ok" ? "Team card removed." : res === "not_yours" ? "Only whoever set this team up, or someone who can manage the server, can remove it." : "That team card is already gone.");
  }
  if (kind === "rl") {
    if (!guildId || !channelId) return say("Use this in a server.");
    if (!manage) return say("Only someone who can manage the server can change how typed races read.");
    const v = ((interaction.data as { values?: string[] } | undefined)?.values ?? [])[0];
    if (!isReadsLike(v)) return say("Pick one from the menu.");
    await setReadsLike(guildId, v, by.id);
    const msg = await typedSettings(guildId, channelId);
    return update(msg.content, msg.components);
  }
  if (kind === "typed") {
    if (!guildId || !channelId) return say("Use this in a server.");
    if (!manage) return say("Only someone who can manage the server can change this.");
    const ok = await setTypedOn(guildId, channelId, arg === "on");
    if (!ok) return say("This channel hasn't had a war yet. Start one with /war first.");
    const msg = await typedSettings(guildId, channelId);
    return update(msg.content, msg.components);
  }
  return say("Unknown button.");
}

export async function handleCardModal(interaction: Record<string, unknown>, customId: string): Promise<Response> {
  const by = who(interaction);
  if (!by) return say("Couldn't tell who you are.");
  if (!(await cardsReady())) return say(NOT_READY);
  const [kind, arg] = customId.slice(CARD_MODAL_PREFIX.length).split(":");
  const parts = modalParts(interaction);
  const val = (id: string) => String(parts.get(id)?.value ?? "");

  if (kind === "me") {
    const lines = (s: string) => s.split(/\r?\n|,/).map((x) => x.trim()).filter(Boolean);
    const flag = val("flag").trim();
    const card = await savePlayerCard(by.id, { shown: val("shown"), flag, ingame: lines(val("ingame")), teams: lines(val("teams")) });
    if (!card) return say("Your card couldn't be saved. Try again in a moment.");
    const bad = flag && !card.flag ? ` "${flag.slice(0, 14)}" isn't a flag code, so it was left out (codes look like us, mx or gb_eng).` : "";
    const msg = await meMessage(by.id);
    return say(`Saved. Tables in every server show you as **${card.shown ?? "your in-game name"}**.${bad}`, msg.components, { embeds: msg.embeds });
  }

  if (kind === "players") {
    const team = await teamById(arg ?? "");
    const guildId = (interaction.guild_id as string | undefined) ?? null;
    if (!team || team.guildId !== guildId) return say("That team card is gone.");
    const manage = canManageGuild(interaction);
    const lines = readRosterLines(val("lines"));
    const res = await setRoster(team.guildId, team.id, lines, by, manage);
    // Lines taken out of the list come off it (yours, or anyone's for a server manager).
    const keep = new Set(lines.map((l) => tagKey(l.ingame)));
    let removed = 0;
    const kept: string[] = [];
    for (const r of await rosterOf(team.id)) {
      if (keep.has(tagKey(r.ingame))) continue;
      const out = await removeRosterRow(r.id, by, manage);
      if (out === "ok") removed++;
      else if (out === "not_yours") kept.push(r.ingame);
    }
    const said = [
      res.added ? `${res.added} added` : null, res.changed ? `${res.changed} changed` : null, removed ? `${removed} taken off` : null,
    ].filter(Boolean).join(", ") || "Nothing changed";
    const skipped = [...res.skipped.map((s) => `${s.ingame} (set by ${s.by ?? "someone else"})`), ...kept.map((k) => `${k} (someone else's line, kept)`)];
    return say(`${said}.${skipped.length ? ` Left as they were: ${skipped.slice(0, 6).join(", ")}. Only whoever added a line, or someone who can manage the server, can change it.` : ""}`, [], { embeds: [teamEmbed(team, await rosterOf(team.id))] });
  }
  return say("Unknown form.");
}

