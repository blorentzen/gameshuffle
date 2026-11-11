/**
 * Carrying a war over from another bot (team sizes picks 2026-11-10, all as recommended): Apps ▸ Continue in
 * GameShuffle on the other bot's score message, or /war vs: … continue: True with a paste box. A private check comes
 * first (teams, races, tracks, penalties) with Continue here, Fix a race and Cancel; then GameShuffle's card posts with
 * "Continued from Quaxly after race 5", and the other bot is left alone.
 *
 * The check holds the war in GameShuffle's short form (src/lib/wars/carry.ts carryBlock), and Continue here reads it
 * back from the check message itself, so nothing is stored between the check and the card. Ids: warc:go, warc:fix,
 * warc:cancel; forms warcm:paste[:<vs>] and warcm:fix.
 */

import { after } from "next/server";
import { getDiscordUser } from "../user";
import { appOfApplicationId } from "../appIds";
import { embedText } from "@/lib/timeTrials/quaxly";
import { carryBlock, carrySummary, carryTotals, readBlock, readCarry, type CarryRead, type CarryWar } from "@/lib/wars/carry";
import { isDefaultFormat } from "@/lib/wars/format";
import type { WarPenalty, WarRace } from "@/lib/wars/rules";
import { formatsReady, liveWar, rememberChannel, startWar, endWar, warChannel, warsReady } from "@/lib/wars/store";
import { postCard, warTitle, WAR_PREFIX } from "@/lib/wars/discord";
import { teamRef } from "./war";

export const CARRY_COMMAND = "Continue in GameShuffle";
export const CARRY_PREFIX = "warc:";
export const CARRY_MODAL_PREFIX = "warcm:";

const EPHEMERAL = 64;
const say = (content: string, components: unknown[] = []) => Response.json({ type: 4, data: { content, components, flags: EPHEMERAL, allowed_mentions: { parse: [] } } });
const update = (content: string, components: unknown[] = []) => Response.json({ type: 7, data: { content, components, allowed_mentions: { parse: [] } } });
const btn = (label: string, id: string, style: 1 | 2 | 3 | 4 = 2) => ({ type: 2, style, label, custom_id: id });
const row = (...components: unknown[]) => ({ type: 1, components });

function whoIs(interaction: Record<string, unknown>): { id: string; name: string } | null {
  const user = getDiscordUser(interaction);
  if (!user?.id) return null;
  const nick = (interaction.member as { nick?: string | null } | undefined)?.nick;
  return { id: user.id, name: (nick || user.global_name || user.username || "Someone").slice(0, 32) };
}

const where = (interaction: Record<string, unknown>) => ({
  guildId: (interaction.guild_id as string | undefined) ?? null,
  channelId: (interaction.channel_id as string | undefined) ?? ((interaction.channel as { id?: string } | undefined)?.id ?? null),
});

async function editOriginal(appId: string, token: string, data: Record<string, unknown>): Promise<void> {
  await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allowed_mentions: { parse: [] }, ...data }),
  }).catch(() => null);
}

/** The private check: the teams and totals, a sentence, the war in GameShuffle's short form, and what to look at. */
function check(read: CarryRead): { content: string; components: unknown[] } {
  if (!read.ok) return { content: read.error, components: [] };
  const war = read.war;
  const totals = carryTotals(war);
  const score = war.tags.map((t, i) => `${t} ${totals[i]}`).join(" · ");
  const content = [
    `**Continue this war from ${war.from}?**`,
    score,
    carrySummary(war),
    "```\n" + carryBlock(war) + "\n```",
    ...read.notes.map((n) => `-# ${n}`),
  ].join("\n");
  if (content.length > 2000) return { content: "That war is too long to show here. End it in the other bot and start a new one with /war.", components: [] };
  return { content, components: [row(btn("Continue here", `${CARRY_PREFIX}go`, 3), btn("Fix a race", `${CARRY_PREFIX}fix`), btn("Cancel", `${CARRY_PREFIX}cancel`))] };
}

/** The block in a check message (between its code fences). */
const blockOf = (content: string) => /```\n([\s\S]*?)\n```/.exec(content)?.[1] ?? "";

/** The tag to put first: the team other than vs: (what the person just typed), else the channel's own team. */
function usTag(channelTag: string | null, vs: string | null, read: CarryRead): string | null {
  if (!read.ok) return null;
  const has = (tag: string) => read.war.tags.some((t) => t.toLowerCase() === tag.toLowerCase());
  if (vs && read.war.format.teams === 2 && has(vs)) return read.war.tags.find((t) => t.toLowerCase() !== vs.toLowerCase()) ?? null;
  if (channelTag && has(channelTag)) return channelTag;
  return null;
}

// ── Apps ▸ Continue in GameShuffle ────────────────────────────────────────────────────────────

export async function handleCarryCommand(interaction: Record<string, unknown>): Promise<Response> {
  if (appOfApplicationId(interaction.application_id) !== "comp") return say("Carrying a war over comes with GameShuffle Competitive.");
  const { guildId, channelId } = where(interaction);
  if (!guildId || !channelId) return say("Use this on a war score in a server's channel.");
  if (!(await warsReady())) return say("Wars aren't open yet. Try again soon.");
  const data = interaction.data as { target_id?: string; resolved?: { messages?: Record<string, { content?: string; embeds?: Parameters<typeof embedText>[0][] }> } };
  const msg = data.target_id ? data.resolved?.messages?.[data.target_id] : undefined;
  if (!msg) return say("Couldn't read that message. Try again on the other bot's score.");
  const text = [msg.content ?? "", ...(msg.embeds ?? []).map(embedText)].filter(Boolean).join("\n");
  const channel = await warChannel(guildId, channelId).catch(() => null);
  const first = readCarry(text, channel?.game ?? "mk8dx");
  const read = readCarry(text, channel?.game ?? "mk8dx", usTag(channel?.team?.tag ?? null, null, first));
  const c = check(read);
  return say(c.content, c.components);
}

// ── /war vs: … continue: True ─────────────────────────────────────────────────────────────────

/** The paste box (/war with continue:). `vs` is the other team's tag, to put the right team first. */
export function carryPasteForm(vs: string | null): Response {
  return Response.json({ type: 9, data: {
    custom_id: `${CARRY_MODAL_PREFIX}paste${vs ? `:${encodeURIComponent(vs).slice(0, 60)}` : ""}`,
    title: "Carry a war over",
    components: [{
      type: 18, label: "The other bot's score", description: "Select its score message's text in Discord, copy it and paste it here.",
      component: { type: 4, custom_id: "text", style: 2, required: true, max_length: 4000, placeholder: "Total Score after Race 5\nKC\n222\nNOR\n188…" },
    }],
  } });
}

type ModalPart = { custom_id?: string; value?: string | null };
function modalValue(interaction: Record<string, unknown>, id: string): string {
  let found = "";
  const walk = (list: unknown[]) => {
    for (const c of list as { component?: ModalPart; components?: unknown[]; custom_id?: string; value?: string }[]) {
      if (c.component?.custom_id === id) found = String(c.component.value ?? "");
      else if (c.custom_id === id) found = String(c.value ?? "");
      if (c.components) walk(c.components);
    }
  };
  walk(((interaction.data as { components?: unknown[] } | undefined)?.components) ?? []);
  return found;
}

export async function handleCarryModal(interaction: Record<string, unknown>, customId: string): Promise<Response> {
  const [kind, vsRaw] = customId.slice(CARRY_MODAL_PREFIX.length).split(":");
  const { guildId, channelId } = where(interaction);
  if (!guildId || !channelId) return say("Carry a war over in a server's channel.");
  const channel = await warChannel(guildId, channelId).catch(() => null);
  if (kind === "paste") {
    const text = modalValue(interaction, "text");
    const vs = vsRaw ? decodeURIComponent(vsRaw) : null;
    const first = readCarry(text, channel?.game ?? "mk8dx");
    const c = check(readCarry(text, channel?.game ?? "mk8dx", usTag(channel?.team?.tag ?? null, vs, first)));
    return say(c.content, c.components);
  }
  if (kind === "fix") {
    // Opened from the check, so the answer replaces the check where it is.
    const c = check(readBlock(modalValue(interaction, "block")));
    return update(c.content, c.components.length ? c.components : [row(btn("Fix a race", `${CARRY_PREFIX}fix`), btn("Cancel", `${CARRY_PREFIX}cancel`))]);
  }
  return say("Unknown form.");
}

// ── The check's buttons ───────────────────────────────────────────────────────────────────────

export async function handleCarryComponent(interaction: Record<string, unknown>, customId: string): Promise<Response> {
  const who = whoIs(interaction);
  if (!who) return say("Couldn't tell who you are.");
  const kind = customId.slice(CARRY_PREFIX.length);
  const content = String((interaction.message as { content?: string } | undefined)?.content ?? "");
  const block = blockOf(content);

  if (kind === "cancel") return update("Nothing was carried over.");
  if (kind === "fix") {
    return Response.json({ type: 9, data: {
      custom_id: `${CARRY_MODAL_PREFIX}fix`,
      title: "Fix the war before it comes over",
      components: [{
        type: 18, label: "Races and penalties", description: "Race 3: 1,5,6,9,10,11 (TH) · Race 4: 46-36 points · Penalty: NOR 15",
        component: { type: 4, custom_id: "block", style: 2, required: true, max_length: 4000, value: block.slice(0, 4000) },
      }],
    } });
  }
  if (kind !== "go") return say("Unknown button.");

  const read = readBlock(block);
  if (!read.ok) return update(read.error, [row(btn("Fix a race", `${CARRY_PREFIX}fix`), btn("Cancel", `${CARRY_PREFIX}cancel`))]);
  const { guildId, channelId } = where(interaction);
  if (!guildId || !channelId) return say("Carry a war over in a server's channel.");
  const live = await liveWar(guildId, channelId);
  if (live) return say(`A war is on here already: ${warTitle(live)}, after race ${live.races.length}. End it first to carry this one over.`, [row(btn("End that war", `${WAR_PREFIX}end:${live.id}`, 4))]);
  const war = read.war;
  if ((!isDefaultFormat(war.format) || war.racesTotal > 24) && !(await formatsReady())) {
    return say("Carrying over wars of other sizes or more than 24 races isn't switched on yet.");
  }

  const appId = String(interaction.application_id ?? "");
  const token = String(interaction.token ?? "");
  after(async () => {
    try {
      const posted = await carryInto(war, guildId, channelId, who);
      await editOriginal(appId, token, { content: posted, components: [] });
    } catch (err) {
      console.error("[wars] carry failed:", err);
      await editOriginal(appId, token, { content: "The war couldn't be carried over. Try again in a moment.", components: [] });
    }
  });
  return Response.json({ type: 6 });
}

/** Starts the war here with the carried races and penalties, and posts GameShuffle's card. What to tell the person. */
export async function carryInto(war: CarryWar, guildId: string, channelId: string, who: { id: string; name: string }): Promise<string> {
  const channel = await warChannel(guildId, channelId).catch(() => null);
  const refs = await Promise.all(war.tags.map((t, i) => teamRef(guildId, t, war.game, i === 0 ? channel?.team ?? null : null)));
  const start = Date.now();
  const at = (i: number) => new Date(start - (war.races.length - i) * 1000).toISOString();
  const by = { id: "carried", name: war.from };
  const races: WarRace[] = war.races.map((r, i) => ({
    n: r.n, spots: r.spots, track: r.track, by, at: at(i),
    ...(r.places?.length ? { places: r.places } : {}), ...(r.scores?.length ? { scores: r.scores } : {}),
  }));
  const penalties: WarPenalty[] = war.penalties.map((p) => ({
    side: p.team === 0 ? "us" : "them", points: p.points, reason: `From ${war.from}`, by: who.name, at: at(war.races.length),
    ...(war.format.teams > 2 ? { team: p.team } : {}),
  }));
  const note = `Continued from ${war.from} after race ${war.races.length}, by ${who.name}.`;
  const started = await startWar({
    guildId, channelId, game: war.game, entry: "scorer", us: refs[0], them: refs[1], others: refs.slice(2), format: war.format,
    racesTotal: war.racesTotal, races, penalties, notes: [note], by: who,
  });
  if (!started.ok) return started.error === "live" ? "Someone started a war here a moment ago, so this one wasn't carried over." : "The war couldn't be carried over. Try again in a moment.";
  await rememberChannel(guildId, channelId, { team: refs[0], game: war.game, races: war.racesTotal, ...(war.format.teams === 2 ? { size: war.format.size } : {}) });
  const posted = await postCard(started.war.id);
  if (posted !== "ok") {
    await endWar(started.war.id);
    return posted === "no_access" ? "I can't post in this channel. Give GameShuffle Competitive Send Messages and Attach Files here, then try again." : "The war card couldn't be posted. Try again in a moment.";
  }
  const next = war.races.length < war.racesTotal ? ` Race ${war.races.length + 1} is next: press Add race on the card.` : "";
  return `Carried over: ${warTitle(started.war)}, after race ${war.races.length}. GameShuffle's card is in the channel.${next} The other bot's war is still there; end it there if you like.`;
}
