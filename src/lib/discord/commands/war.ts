/**
 * /war and the war card's buttons, menus and forms (GameShuffle Competitive; war tools picks 2026-10-31,
 * https://claude.ai/artifact/TGuceXNmWkKrh5BVpgJNBT, all as recommended). Anyone in the channel can score, like
 * the bots people use today. Private answers go only to whoever pressed; the card itself is redrawn after the
 * change (src/lib/wars/discord.ts), so a race shows up the same way whoever added it.
 */

import { after } from "next/server";
import { getDiscordUser } from "../user";
import { appOfApplicationId } from "../appIds";
import { SITE_URL } from "@/lib/seo";
import { trackTitle } from "@/lib/timeTrials/codes";
import { placesText, readTrack, suggestTracks, spotsCode, spotsFromCode, warTrack, type WarEntry, type WarGame, type WarSide } from "@/lib/wars/rules";
import {
  formatLabel, formatProblem, isDefaultFormat, placesCode, placesExample, placesFromCode, readPlaces, roomOf, teamScores, type WarFormat,
} from "@/lib/wars/format";
import {
  addPenalty, addRace, endWar, formatsReady, getWar, liveWar, pendingTrack, rememberChannel, replaceRace, setEntry, setPendingTrack, setTrack,
  startWar, tapPlace, undoRace, warChannel, warsReady, warTeams, type War, type WarTeamRef,
} from "@/lib/wars/store";
import { playedTeams, registryTeam, searchRegistry } from "@/lib/wars/teams";
import { serverLogo } from "@/lib/wars/logos";
import { editCard, overlayLinks, postCard, warTitle, WAR_MODAL_PREFIX, WAR_PREFIX, type CardPost } from "@/lib/wars/discord";
import { mkcQuestion, typedSettings } from "./warCards";
import { listTeams, teamFor } from "@/lib/wars/cardStore";
import { teamFromTag } from "@/lib/wars/typed";
import { tableForm } from "./warTables";
import { carryPasteForm } from "./warCarry";

export { WAR_MODAL_PREFIX, WAR_PREFIX };

const EPHEMERAL = 64;
const say = (content: string, components: unknown[] = []) => Response.json({ type: 4, data: { content, components, flags: EPHEMERAL, allowed_mentions: { parse: [] } } });
const update = (content: string, components: unknown[] = []) => Response.json({ type: 7, data: { content, components, allowed_mentions: { parse: [] } } });
const ack = () => Response.json({ type: 6 });
const btn = (label: string, id: string, style: 1 | 2 | 3 | 4 = 2) => ({ type: 2, style, label: label.slice(0, 80), custom_id: id });
const link = (label: string, url: string) => ({ type: 2, style: 5, label, url });
const row = (...components: unknown[]) => ({ type: 1, components });
const fromPrivate = (interaction: Record<string, unknown>) => ((((interaction.message as { flags?: number } | undefined)?.flags ?? 0) & EPHEMERAL) !== 0);

const GAMES: Record<WarGame, string> = { mkworld: "Mario Kart World", mk8dx: "Mario Kart 8 Deluxe" };
const isGame = (v: unknown): v is WarGame => v === "mk8dx" || v === "mkworld";
const isEntry = (v: unknown): v is WarEntry => v === "scorer" || v === "taps";
const cleanTag = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, 12);
/** others: more teams' tags, with spaces or commas between. */
const readTags = (v: unknown) => [...new Set(String(v ?? "").split(/[\s,]+/).map(cleanTag).filter(Boolean))];
/** Taps fit two-team wars of up to 12 players (store.ts tapsFit). */
const tapsFitFormat = (f: WarFormat) => f.teams === 2 && roomOf(f) <= 12;

/** The name people see: the server nickname, else their display name. */
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

type Option = { name: string; value?: unknown; focused?: boolean };
const options = (interaction: Record<string, unknown>) => (((interaction.data as { options?: Option[] } | undefined)?.options) ?? []);

const POST_TROUBLE: Record<Exclude<CardPost, "ok">, string> = {
  no_access: "I can't post in this channel. Give GameShuffle Competitive Send Messages and Attach Files here, then run /war again.",
  no_channel: "I can't find this channel. Is GameShuffle Competitive added to this server?",
  failed: "The war card couldn't be posted. Try again in a moment.",
};

async function editOriginal(appId: string, token: string, data: Record<string, unknown>): Promise<void> {
  await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allowed_mentions: { parse: [] }, ...data }),
  }).catch(() => null);
}

/** A team for a war: this server's team card, else the channel's remembered team, else MKCentral's registry; this server's own logo wins either way. */
export async function teamRef(guildId: string, tag: string, game: WarGame, remembered: WarTeamRef | null): Promise<WarTeamRef> {
  // A team card in this server wins: its shown tag, name and any of its tags' logos (vs:TZ finds Twilight Zone, Ω).
  if (await teamFor(guildId, tag).catch(() => null)) return teamFromTag(guildId, tag, game);
  const [own, reg] = await Promise.all([
    serverLogo(guildId, tag),
    remembered && remembered.tag.toLowerCase() === tag.toLowerCase() ? Promise.resolve(null) : registryTeam(tag, game).catch(() => null),
  ]);
  const base: WarTeamRef = remembered && remembered.tag.toLowerCase() === tag.toLowerCase() ? remembered : reg ? { tag: reg.tag, name: reg.name, logo: reg.logo } : { tag, name: null, logo: null };
  return own ? { ...base, logo: own } : base;
}

// ── /war ──────────────────────────────────────────────────────────────────────────────────────

export async function handleWarCommand(interaction: Record<string, unknown>): Promise<Response> {
  if (appOfApplicationId(interaction.application_id) !== "comp") return say("Wars come with GameShuffle Competitive.");
  const { guildId, channelId } = where(interaction);
  if (!guildId || !channelId) return say("Start a war in a server's channel.");
  const who = whoIs(interaction);
  if (!who) return say("Couldn't tell who you are.");
  if (!(await warsReady())) return say("Wars aren't open yet. Try again soon.");

  const opts = options(interaction);
  const get = (n: string) => opts.find((o) => o.name === n)?.value;
  const them = cleanTag(get("vs"));
  if (!them) return say("Who are you playing? Run /war with vs: and their tag.");
  const [channel, live] = await Promise.all([warChannel(guildId, channelId), liveWar(guildId, channelId)]);
  if (live) {
    return say(`A war is on here already: ${warTitle(live)}, after race ${live.races.length}. End it first to start another.`, [
      row(btn("Show the card", `${WAR_PREFIX}card:${live.id}`), btn("End that war", `${WAR_PREFIX}end:${live.id}`, 4)),
    ]);
  }
  // continue: carries a war over from another bot: paste its score, check it, then GameShuffle's card takes over.
  if (get("continue") === true) return carryPasteForm(them);
  const usTag = cleanTag(get("us")) || channel?.team?.tag || "";
  if (!usTag) return say("This channel doesn't know your team yet. Run /war again with us: and your tag. It remembers it after that.");
  if (usTag.toLowerCase() === them.toLowerCase()) return say("Your team and theirs have the same tag. Check vs: and us:.");
  const otherTags = readTags(get("others"));
  const allTags = [usTag, them, ...otherTags];
  if (new Set(allTags.map((t) => t.toLowerCase())).size !== allTags.length) return say("Two teams have the same tag. Check vs:, us: and others:.");
  if (allTags.length > 12) return say("A war can have up to 12 teams.");
  const game: WarGame = isGame(get("game")) ? (get("game") as WarGame) : channel?.game ?? "mk8dx";
  const asked: WarEntry = isEntry(get("entry")) ? (get("entry") as WarEntry) : channel?.entry ?? "scorer";

  // The format: format: when given; with several teams, the size that fills a 12-player room; else the channel's.
  const teamsN = allTags.length;
  const sizeAsked = Number(get("format"));
  const remembered = channel?.size && !formatProblem(game, { size: channel.size, teams: 2 }) ? channel.size : 6;
  const size = sizeAsked >= 1 ? sizeAsked : teamsN > 2 ? (12 % teamsN === 0 ? 12 / teamsN : 6) : remembered;
  const format: WarFormat = { size, teams: teamsN };
  const problem = formatProblem(game, format);
  if (problem) return say(problem);
  const racesAsked = Number(get("races"));
  const racesTotal = racesAsked >= 4 && racesAsked <= 32 ? racesAsked : channel?.races && channel.races >= 4 && channel.races <= 32 ? channel.races : 12;
  if ((!isDefaultFormat(format) || racesTotal > 24) && !(await formatsReady())) {
    return say("Other team sizes, more teams and more than 24 races aren't switched on yet. Run /war without format:, others: or races: for a 6v6.");
  }
  const entry: WarEntry = tapsFitFormat(format) ? asked : "scorer";

  const appId = String(interaction.application_id ?? "");
  const token = String(interaction.token ?? "");
  after(async () => {
    try {
      const [us, opp, ...others] = await Promise.all([
        teamRef(guildId, usTag, game, channel?.team ?? null), teamRef(guildId, them, game, null), ...otherTags.map((t) => teamRef(guildId, t, game, null)),
      ]);
      const started = await startWar({ guildId, channelId, game, entry, us, them: opp, by: who, format, others, racesTotal });
      if (!started.ok) {
        await editOriginal(appId, token, { content: started.error === "live" ? "Someone started a war here a moment ago. It's on the card below." : POST_TROUBLE.failed });
        return;
      }
      // The channel remembers a two-team size (a club that always plays 4v4 types it once) and the race count.
      await rememberChannel(guildId, channelId, { team: us, game, ...(entry === asked ? { entry } : {}), races: racesTotal, ...(teamsN === 2 ? { size } : {}) });
      const posted = await postCard(started.war.id);
      if (posted !== "ok") {
        await endWar(started.war.id);
        await editOriginal(appId, token, { content: POST_TROUBLE[posted], components: posted === "no_channel" ? [row(link("Add GameShuffle Competitive", `${SITE_URL}/discord/add?app=comp`))] : [] });
        return;
      }
      const how = teamsN > 2
        ? `Press Add race after each race and type every team's places, in this order: ${allTags.join(", ")}.`
        : entry === "taps" ? "Everyone taps the place they finished on the card." : "Press Add race on the card after each race.";
      const tapsNote = asked === "taps" && entry !== "taps" ? " Taps work for two-team wars of up to 12 players, so one person adds each race." : "";
      const shape = `${isDefaultFormat(format) ? "" : `, ${formatLabel(format)}`}${racesTotal !== 12 ? `, ${racesTotal} races` : ""}`;
      // The first war against a tag MKCentral knows: which of its teams it is (asked once, kept on the team card).
      const ask = await mkcQuestion(started.war).catch(() => ({ lines: [] as string[], rows: [] as unknown[] }));
      await editOriginal(appId, token, { content: [`${warTitle(started.war)} is on, ${GAMES[game]}${shape}. ${how}${tapsNote}`, ...ask.lines].join("\n"), components: [...ask.rows, row(btn("Overlay link", `${WAR_PREFIX}link:${started.war.id}`))] });
    } catch (err) {
      console.error("[wars] start failed:", err);
      await editOriginal(appId, token, { content: POST_TROUBLE.failed });
    }
  });
  return Response.json({ type: 5, data: { flags: EPHEMERAL } });
}

/** vs: and us: suggestions: teams this server has played, then MKCentral's. */
export async function warAutocomplete(interaction: Record<string, unknown>): Promise<Response> {
  const opts = options(interaction);
  const focused = opts.find((o) => o.focused);
  // others: holds several tags; suggestions complete the last one and keep the ones before it.
  const typedAll = String(focused?.value ?? "");
  const many = focused?.name === "others";
  const before = many ? typedAll.replace(/[^\s,]*$/, "").trim() : "";
  const q = (many ? typedAll.slice(typedAll.search(/[^\s,]*$/)) : typedAll).trim();
  const { guildId, channelId } = where(interaction);
  const channel = guildId && channelId && (await warsReady()) ? await warChannel(guildId, channelId).catch(() => null) : null;
  const gameRaw = opts.find((o) => o.name === "game")?.value;
  const game: WarGame = isGame(gameRaw) ? gameRaw : channel?.game ?? "mk8dx";
  const played = guildId && (await warsReady()) ? await playedTeams(guildId).catch(() => []) : [];
  const lower = q.toLowerCase();
  // This server's team cards first: any of a team's tags finds it.
  const cards = guildId ? await listTeams(guildId).catch(() => []) : [];
  const fromCards = cards
    .filter((t) => !q || t.tags.some((g) => g.toLowerCase().startsWith(lower)) || (t.name ?? "").toLowerCase().includes(lower))
    .filter((t) => focused?.name !== "vs" || !t.tags.some((g) => g.toLowerCase() === channel?.team?.tag.toLowerCase()))
    .slice(0, 10)
    .map((t) => ({ name: `${t.tags[0]}${t.name ? ` · ${t.name}` : ""} · team card`, value: t.tags[0] }));
  const fromPlayed = played
    .filter((t) => !q || t.tag.toLowerCase().startsWith(lower) || (t.name ?? "").toLowerCase().includes(lower))
    .filter((t) => focused?.name !== "vs" || t.tag.toLowerCase() !== channel?.team?.tag.toLowerCase())
    .filter((t) => !cards.some((c) => c.tags.some((g) => g.toLowerCase() === t.tag.toLowerCase())))
    .slice(0, 10)
    .map((t) => ({ name: `${t.tag}${t.name && t.name !== t.tag ? ` · ${t.name}` : ""} · played ${new Date(t.lastAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" })}`, value: t.tag }));
  const seen = new Set([...fromCards, ...fromPlayed].map((c) => c.value.toLowerCase()));
  for (const t of cards) for (const g of t.tags) seen.add(g.toLowerCase());
  const fromRegistry = q ? (await searchRegistry(q, game).catch(() => []))
    .filter((t) => !seen.has(t.tag.toLowerCase()) && (seen.add(t.tag.toLowerCase()), true))
    .slice(0, Math.max(0, 25 - fromCards.length - fromPlayed.length))
    .map((t) => ({ name: `${t.tag}${t.name && t.name !== t.tag ? ` · ${t.name}` : ""} · on MKCentral`, value: t.tag })) : [];
  const choices = [...fromCards, ...fromPlayed, ...fromRegistry];
  if (q && !choices.some((c) => c.value.toLowerCase() === lower)) choices.unshift({ name: `${cleanTag(q)} (as typed)`, value: cleanTag(q) });
  const withBefore = (c: { name: string; value: string }) => (before ? { name: `${before} ${c.name}`, value: `${before} ${c.value}` } : c);
  return Response.json({ type: 8, data: { choices: choices.slice(0, 25).map(withBefore).filter((c) => c.value.length <= 60).map((c) => ({ name: c.name.slice(0, 100), value: c.value })) } });
}

// ── Forms ─────────────────────────────────────────────────────────────────────────────────────

/** The places box: your team's, or every team's in order (several teams); past 12th with spaces between. */
function placesField(war: War, places: string): Record<string, unknown> {
  const f = war.format;
  const room = roomOf(f);
  const order = warTeams(war).map((t) => t.tag).join(", ");
  const label = f.teams > 2 ? "Every team's places, in order" : `${war.us.tag}'s places`;
  const description = f.teams > 2
    ? room > 12 ? `A / between teams: ${order}. The last can be left out.` : `One group a team: ${order}. The last fills itself.`
    : room > 12 ? "A space or comma between places: 1 2 4 5 or 1-5 8 14-16"
    : f.size === 6 ? "The way you'd type them: 12378, 1-378, 357-" : `The way you'd type them, like ${placesExample(f)}`;
  return {
    type: 18, label: label.slice(0, 45), description: description.slice(0, 100),
    component: { type: 4, custom_id: "places", style: 1, required: true, max_length: f.teams > 2 || room > 12 ? 100 : 40, placeholder: placesExample(f).slice(0, 100), ...(places ? { value: places } : {}) },
  };
}

/** A race's places as the form shows them to fix: your team's, or every team's split by / (empty for a race with only points). */
function placesPrefill(war: War, race: War["races"][number]): string {
  if (!race.spots.length) return "";
  return war.format.teams > 2 ? [race.spots, ...(race.places ?? [])].map((l) => l.join(" ")).join(" / ") : race.spots.join(" ");
}

/** A race in the Fix a race menu. */
function raceSummary(war: War, race: War["races"][number]): string {
  const tags = warTeams(war).map((t) => t.tag);
  if (!race.spots.length) return `Points: ${teamScores(race, war.game, war.format).map((v, i) => `${tags[i]} ${v}`).join(", ")}`;
  if (war.format.teams > 2) return [race.spots, ...(race.places ?? [])].map((l, i) => `${tags[i]} ${l.join(",")}`).join(" · ");
  return placesText(race.spots);
}

function raceForm(war: War, n: number, kind: "add" | "fix", places = "", track = ""): Record<string, unknown> {
  return {
    custom_id: `${WAR_MODAL_PREFIX}${kind}:${war.id}:${n}`,
    title: kind === "add" ? `Race ${n}` : `Fix race ${n}`,
    components: [
      placesField(war, places),
      { type: 18, label: "Track", description: "Its code: SSC, rMMM, bNYM. You can add it later.", component: { type: 4, custom_id: "track", style: 1, required: false, max_length: 10, placeholder: war.game === "mk8dx" ? "SSC" : "PS", ...(track ? { value: track } : {}) } },
    ],
  };
}

function trackForm(war: War, n: number, track = ""): Record<string, unknown> {
  return {
    custom_id: `${WAR_MODAL_PREFIX}trk:${war.id}:${n}`,
    title: `Race ${n}'s track`,
    components: [{ type: 18, label: "Track", description: "Its code: SSC, rMMM, bNYM", component: { type: 4, custom_id: "track", style: 1, required: true, max_length: 10, placeholder: war.game === "mk8dx" ? "SSC" : "PS", ...(track ? { value: track } : {}) } }],
  };
}

function penaltyForm(war: War): Record<string, unknown> {
  // Several teams: a menu of every team (a radio group holds too few), each by its number.
  const which = war.format.teams > 2
    ? { type: 3, custom_id: "side", required: true, options: warTeams(war).map((t, i) => ({ value: String(i), label: (t.name || t.tag).slice(0, 100), ...(i === 1 ? { default: true } : {}) })) }
    : { type: 21, custom_id: "side", required: true, options: [
      { value: "them", label: war.them.name || war.them.tag, default: true },
      { value: "us", label: war.us.name || war.us.tag },
    ] };
  return {
    custom_id: `${WAR_MODAL_PREFIX}pen:${war.id}`,
    title: "Penalty",
    components: [
      { type: 18, label: "Which team", component: which },
      { type: 18, label: "Points off", component: { type: 4, custom_id: "points", style: 1, required: true, max_length: 3, placeholder: "15" } },
      { type: 18, label: "Why", description: "Shown on the card", component: { type: 4, custom_id: "reason", style: 1, required: false, max_length: 40, placeholder: "Repick" } },
    ],
  };
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

const codeOf = (war: War, id: string | null) => {
  if (!id) return "";
  const t = warTrack(war.game, id);
  return t ? (trackTitle(t).match(/\(([^)]+)\)$/)?.[1] ?? "") : "";
};

/** Buttons for the closest tracks to a code nobody has. */
function trackChoices(war: War, n: number, typed: string): Record<string, unknown> {
  const list = suggestTracks(war.game, typed);
  return {
    content: `Race ${n} is in. There's no track coded **${typed.slice(0, 10)}**, though. Which one was it?`,
    components: list.length ? [row(...list.map((t) => btn(trackTitle(t).replace(/^(.*) \((.+)\)$/, "$2 · $1"), `${WAR_PREFIX}settrk:${war.id}:${n}:${t.id}`)))] : [],
  };
}

// ── Buttons and menus ─────────────────────────────────────────────────────────────────────────

export async function handleWarComponent(interaction: Record<string, unknown>, customId: string): Promise<Response> {
  const who = whoIs(interaction);
  if (!who) return say("Couldn't tell who you are.");
  const [kind, warId, a, b, c] = customId.slice(WAR_PREFIX.length).split(":");
  const war = warId ? await getWar(warId) : null;
  if (!war) return say("That war is gone.");
  const values = ((interaction.data as { values?: string[] } | undefined)?.values) ?? [];
  const next = war.races.length + 1;
  const redraw = (move: boolean) => after(async () => { await (move ? postCard(war.id) : editCard(war.id)); });

  switch (kind) {
    case "add": {
      if (war.status !== "live") return say("This war is over. Press Rematch for another.");
      return Response.json({ type: 9, data: raceForm(war, next, "add") });
    }
    case "fill": {
      const n = Number(a);
      if (war.status !== "live" || n !== next) return say(`Race ${n} is already in.`);
      const tapped = war.taps.filter((t) => t.race === n).map((t) => t.place).sort((x, y) => x - y);
      return Response.json({ type: 9, data: raceForm(war, n, "add", tapped.join(" "), codeOf(war, pendingTrack(war, n))) });
    }
    case "trk": {
      const n = Number(a);
      const existing = war.races.find((r) => r.n === n)?.track ?? pendingTrack(war, n);
      return Response.json({ type: 9, data: trackForm(war, n, codeOf(war, existing)) });
    }
    case "undo": {
      const n = Number(a);
      const res = await undoRace(war.id, n, who.name);
      if (!res.ok) {
        if (res.error === "live_elsewhere") return say("Another war is on in this channel now, so this one can't reopen.");
        return say(res.error === "not_last" ? `Race ${n} isn't the last race any more, so it can't be taken back. Use Fix a race instead.` : "There's no race to take back.");
      }
      redraw(true);
      return ack();
    }
    case "tap": {
      const n = Number(a);
      const place = Number(b);
      if (!(place >= 1 && place <= roomOf(war.format))) return say("That place isn't on the card.");
      const res = await tapPlace(war.id, { n, place, user: who });
      if (!res.ok) {
        if (res.error === "stale") return say(`Race ${n} is already in. Tap on the newest card.`);
        if (res.error === "full") return say(`${war.format.size} places are tapped already. Tap one of them to change it, or use Fill in the rest.`);
        if (res.error === "no_taps") return say("This war takes typed places: press Add race.");
        return say("This war is over.");
      }
      redraw(!!res.result.race);
      return ack();
    }
    case "more": {
      const v = values[0];
      if (v === "fix") {
        if (!war.races.length) return say("There are no races to fix yet.");
        return say("Which race?", [row({
          type: 3, custom_id: `${WAR_PREFIX}fixp:${war.id}`, placeholder: "Pick the race to fix",
          options: war.races.slice(-25).reverse().map((r) => ({ label: `Race ${r.n}${r.track ? ` · ${codeOf(war, r.track) || "track"}` : ""}`, value: String(r.n), description: raceSummary(war, r).slice(0, 100) })),
        })]);
      }
      if (v === "pen") return Response.json({ type: 9, data: penaltyForm(war) });
      if (v === "table") return tableForm(war.id);
      if (v === "link") return linkReply(war);
      if (v === "typed") { const msg = await typedSettings(war.guildId, war.channelId); return say(msg.content, msg.components); }
      if (v === "entry") {
        const to: WarEntry = war.entry === "taps" ? "scorer" : "taps";
        const res = await setEntry(war.id, to);
        if (!res.ok) return say(res.error === "no_taps" ? "Everyone taps works for two-team wars of up to 12 players. Use Add race for this one." : "This war is over.");
        await rememberChannel(war.guildId, war.channelId, { entry: to });
        redraw(true);
        return ack();
      }
      if (v === "end") return endPrompt(war);
      return say("Pick something from the menu.");
    }
    case "end": return endPrompt(war);
    case "fixp": {
      const n = Number(values[0]);
      const race = war.races.find((r) => r.n === n);
      if (!race) return say("That race isn't there any more.");
      return Response.json({ type: 9, data: raceForm(war, n, "fix", placesPrefill(war, race), codeOf(war, race.track)) });
    }
    case "settrk": {
      const n = Number(a);
      const t = warTrack(war.game, b ?? "");
      if (!t) return update("That track isn't in this game.");
      const res = war.races.some((r) => r.n === n) ? await setTrack(war.id, n, t.id) : await setPendingTrack(war.id, n, t.id);
      if (!res.ok) return update("That race has moved on.");
      redraw(false);
      return update(`Race ${n}'s track is ${trackTitle(t)}.`);
    }
    case "swap": {
      const n = Number(a);
      const all = (b ?? "").startsWith("p") ? placesFromCode((b ?? "").slice(1), war.format) : null;
      const spots = all ? all[0] : spotsFromCode(b ?? "", roomOf(war.format));
      const t = c ? warTrack(war.game, c) : null;
      if (spots.length !== war.format.size) return update("Those places couldn't be read back. Use Fix a race.");
      const res = await replaceRace(war.id, { n, spots, ...(all && war.format.teams > 2 ? { places: all.slice(1) } : {}), ...(t ? { track: t.id } : {}), by: who });
      if (!res.ok) return update("That race isn't there any more.");
      redraw(false);
      return update(`Your places count for race ${n}: ${placesText(spots)}.`);
    }
    case "keep": return update("Nothing changed.");
    case "endok": {
      const res = await endWar(war.id);
      if (!res.ok) return update("This war is already over.");
      redraw(true);
      return update(`${warTitle(war)} is over, after race ${war.races.length}.`);
    }
    case "card": {
      redraw(true);
      return fromPrivate(interaction) ? update("The card is at the bottom of the channel now.") : ack();
    }
    case "rematch": {
      const live = await liveWar(war.guildId, war.channelId);
      if (live) return say(`A war is on here already: ${warTitle(live)}.`, [row(btn("Show the card", `${WAR_PREFIX}card:${live.id}`))]);
      const started = await startWar({ guildId: war.guildId, channelId: war.channelId, game: war.game, entry: war.entry, us: war.us, them: war.them, by: who, format: war.format, others: war.others, racesTotal: war.racesTotal });
      if (!started.ok) return say(started.error === "live" ? "Someone started a war here a moment ago." : POST_TROUBLE.failed);
      after(async () => { await postCard(started.war.id); });
      return ack();
    }
    case "link": return linkReply(war);
    // War room: opens GameShuffle Competitive's Activity in this channel (the room finds this channel's war).
    case "room": return Response.json({ type: 12 });
    default: return say("Unknown button.");
  }
}

function endPrompt(war: War): Response {
  if (war.status !== "live") return say("This war is already over.");
  return say(`End ${warTitle(war)} now, after race ${war.races.length} of ${war.racesTotal}?`, [row(btn("End it now", `${WAR_PREFIX}endok:${war.id}`, 4), btn("Keep going", `${WAR_PREFIX}keep:${war.id}`))]);
}

async function linkReply(war: War): Promise<Response> {
  const links = await overlayLinks(war);
  if (!links) return say("This channel's overlay link isn't ready yet. Start a war here first.");
  return say(
    `**War overlay for OBS or Streamlabs.** It follows every war in this channel. Set it up to pick a layout and look, then copy its link. Or paste this one as it is:\n${links.ours}`,
    [row(link("Set up the overlay", links.setup))],
  );
}

// ── Form answers ──────────────────────────────────────────────────────────────────────────────

export async function handleWarModal(interaction: Record<string, unknown>, customId: string): Promise<Response> {
  const who = whoIs(interaction);
  if (!who) return say("Couldn't tell who you are.");
  const [kind, warId, a] = customId.slice(WAR_MODAL_PREFIX.length).split(":");
  const war = warId ? await getWar(warId) : null;
  if (!war) return say("That war is gone.");
  const parts = modalParts(interaction);
  const n = Number(a);
  const priv = fromPrivate(interaction);
  const done = (msg: string) => (priv ? update(msg) : say(msg));

  if (kind === "add" || kind === "fix") {
    const read = readPlaces(String(parts.get("places")?.value ?? ""), war.game, war.format, warTeams(war).map((t) => t.tag));
    if (!read.ok) return say(read.error, kind === "add" ? [row(btn(`Add race ${n} again`, `${WAR_PREFIX}add:${war.id}`))] : []);
    const spots = read.places[0];
    const several = war.format.teams > 2;
    const extra = several ? { places: read.places.slice(1) } : {};
    const mine = { spots, ...extra };
    const typedTrack = String(parts.get("track")?.value ?? "").trim();
    const track = typedTrack ? readTrack(war.game, typedTrack) : null;
    if (kind === "fix") {
      const res = await replaceRace(war.id, { n, spots, ...extra, track: track?.id ?? (typedTrack ? undefined : null), by: who });
      if (!res.ok) return say("That race isn't there any more.");
      after(async () => { await editCard(war.id); });
      if (typedTrack && !track) return say(trackChoices(war, n, typedTrack).content as string, trackChoices(war, n, typedTrack).components as unknown[]);
      return done(`Race ${n} fixed: ${several ? raceSummary(war, { ...mine, n, track: null, by: who, at: "" }) : placesText(spots)}.`);
    }
    const res = await addRace(war.id, { n, spots, ...extra, track: track?.id ?? null, by: who, note: read.note });
    if (!res.ok) {
      if (res.error === "taken") {
        const theirs = res.war?.races.find((r) => r.n === n);
        if (theirs && placesCode(theirs, war.format) === placesCode(mine, war.format)) return say(`Race ${n} is already in with the same places, from ${theirs.by.name}.`);
        const code = several ? `p${placesCode(mine, war.format)}` : spotsCode(spots);
        const show = (r: Pick<War["races"][number], "spots" | "places" | "scores">) => raceSummary(war, { ...r, n, track: null, by: who, at: "" });
        return say(
          `Race ${n} is already in from ${theirs?.by.name ?? "someone"}: ${theirs ? show(theirs) : ""}. Yours read ${show(mine)}.`,
          [row(btn("Use mine instead", `${WAR_PREFIX}swap:${war.id}:${n}:${code}${track ? `:${track.id}` : ""}`), btn(`Keep ${theirs?.by.name ?? "theirs"}`.slice(0, 80), `${WAR_PREFIX}keep:${war.id}`))],
        );
      }
      if (res.error === "out_of_order") return say(`The war has moved on: race ${(res.war?.races.length ?? 0) + 1} is next. Press Add race again.`);
      return say("This war is over. Press Rematch for another.");
    }
    after(async () => { await postCard(war.id); });
    if (typedTrack && !track) {
      const msg = trackChoices(war, n, typedTrack);
      return say(msg.content as string, msg.components as unknown[]);
    }
    return ack();
  }

  if (kind === "trk") {
    const typed = String(parts.get("track")?.value ?? "").trim();
    const track = readTrack(war.game, typed);
    if (!track) {
      const list = suggestTracks(war.game, typed);
      return say(`There's no track coded **${typed.slice(0, 10)}**. Which one was it?`, list.length ? [row(...list.map((t) => btn(trackTitle(t).replace(/^(.*) \((.+)\)$/, "$2 · $1"), `${WAR_PREFIX}settrk:${war.id}:${n}:${t.id}`)))] : []);
    }
    const res = war.races.some((r) => r.n === n) ? await setTrack(war.id, n, track.id) : await setPendingTrack(war.id, n, track.id);
    if (!res.ok) return say("That race has moved on. Try again on the newest card.");
    after(async () => { await editCard(war.id); });
    return priv ? update(`Race ${n}'s track is ${trackTitle(track)}.`) : ack();
  }

  if (kind === "pen") {
    const picked = parts.get("side");
    const raw = String(picked?.values?.[0] ?? picked?.value ?? "them");
    const team = /^\d{1,2}$/.test(raw) ? Number(raw) : null;
    const side: WarSide = team === 0 || raw === "us" ? "us" : "them";
    const points = Number(String(parts.get("points")?.value ?? "").trim());
    if (!Number.isInteger(points) || points < 1 || points > 200) return say("Points off should be a whole number from 1 to 200.");
    const reason = String(parts.get("reason")?.value ?? "").trim().slice(0, 40);
    const res = await addPenalty(war.id, { side, points, reason, by: who.name, ...(team != null ? { team } : {}) });
    if (!res.ok) return say("This war is over.");
    after(async () => { await editCard(war.id); });
    return ack();
  }

  return say("Unknown form.");
}
