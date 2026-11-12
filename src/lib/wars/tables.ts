import "server-only";

/**
 * War tables (war_tables, wars-m3.sql; war tools pick 4A): a draft while it's checked, then a posted message in the
 * channel that can be edited. The text starts filled in from the war: both teams, your team's players and scores when
 * they tapped their places, their flags from MKCentral (by Discord account), and penalties.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { compRestFile } from "@/lib/discord/compRest";
import { COMP_COLOR } from "@/lib/discord/ttPanel";
import { loungeBasic } from "@/lib/mmr/mkcentral";
import { penaltyTeam, type WarGame } from "./rules";
import { placePoints, pointsTable, roomOf } from "./format";
import { formatTable, parseTable, teamTotal, type TableModel } from "./table";
import { renderTable, type TablePicture } from "./tableCard";
import { lookForTable, tableLooksReady } from "./tableLooks";
import { isTableLayout, type TableLayout, type TableLook } from "./tableLook";
import { listLogos, uploadTableLogo } from "./logos";
import { cardsReady, listTeams, playerCardsById } from "./cardStore";
import { mkcTeam } from "./mkcTeams";
import { teamAliases, teamCardFor, type TeamCard } from "./cards";
import { tagKey } from "./tags";
import { flagsFor } from "./flags";
import { registryTeam } from "./teams";
import { getWar, warChannel, warStanding, warTeams, type War, type WarTeamRef } from "./store";
import { SITE_URL } from "@/lib/seo";
import { linkBtn } from "./discord";
import { warPagePath } from "./page";

export interface WarTableRow { id: string; warId: string | null; guildId: string; channelId: string; body: string; backgroundUrl: string | null; status: "draft" | "posted" | "canceled"; messageId: string | null; createdBy: string; createdByName: string | null; readBody: string | null;
  /** The layout this table is drawn in when it isn't the channel's (wars-m7). */
  layout: TableLayout | null;
  /** When it was last posted or changed (lists only). */
  postedAt?: string }
type Row = { id: string; war_id: string | null; guild_id: string; channel_id: string; body: string; background_url: string | null; status: WarTableRow["status"]; message_id: string | null; created_by: string; created_by_name: string | null; read_body?: string | null; layout?: string | null };
const COLS = "id, war_id, guild_id, channel_id, body, background_url, status, message_id, created_by, created_by_name";
const toRow = (r: Row): WarTableRow => ({ id: r.id, warId: r.war_id, guildId: r.guild_id, channelId: r.channel_id, body: r.body, backgroundUrl: r.background_url, status: r.status, messageId: r.message_id, createdBy: r.created_by, createdByName: r.created_by_name, readBody: r.read_body ?? null, layout: isTableLayout(r.layout) ? r.layout : null });

export const TABLE_PREFIX = "wtab:";
const V2 = 1 << 15;
/** The MKCentral lounge a war's players are looked up in for their name and flag (none for Mario Kart Wii). */
const lounge = (g: WarGame): "mk8dx" | "mkworld12p" | null => (g === "mk8dx" ? "mk8dx" : g === "mkworld" ? "mkworld12p" : null);

async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

/** The text a war's table starts from. */
export async function prefillFor(war: War): Promise<string> {
  const date = new Date(war.createdAt).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const teams = warTeams(war);
  const title = teams.length > 3 ? teams.map((t) => t.tag).join(" vs ") : teams.map((t) => t.name || t.tag).join(" vs ");
  const model: TableModel = { title, date, settings: [], skipped: [], teams: teams.map((t, i) => (
    { tag: t.tag, name: t.name, color: null, players: [], penalty: war.penalties.filter((p) => penaltyTeam(p) === i).reduce((a, p) => a + p.points, 0) }
  )) };
  // Every race tapped in by the players themselves: their scores are known exactly.
  if (war.races.length && war.races.every((r) => r.players?.length)) {
    const table = pointsTable(war.game, roomOf(war.format)) ?? [];
    const pts = new Map<string, { name: string; score: number }>();
    for (const r of war.races) for (const p of r.players ?? []) {
      const now = pts.get(p.id) ?? { name: p.name, score: 0 };
      now.score += placePoints(table, p.place);
      pts.set(p.id, now);
    }
    const ids = [...pts.keys()];
    const [flags, cards] = await Promise.all([
      withTimeout(Promise.all(ids.map((id) => { const g = lounge(war.game); return g ? loungeBasic({ discordId: id }, g).catch(() => null) : Promise.resolve(null); })), 3000, ids.map(() => null)),
      playerCardsById(ids).catch(() => new Map()),
    ]);
    // A player's own card (/me) wins over MKCentral.
    model.teams[0].players = ids.map((id, i) => ({ name: cards.get(id)?.shown ?? flags[i]?.name ?? pts.get(id)!.name, flag: cards.get(id)?.flag ?? flags[i]?.country?.toLowerCase() ?? null, score: pts.get(id)!.score }))
      .sort((a, b) => b.score - a.score);
  }
  return formatTable(model);
}

/**
 * A war's totals as the table check wants them (penalties included): by each team's tag and name, every tag on its
 * team card, and in order (your team first) for a table team that matches none of those.
 */
export function warTotals(war: War, cards: TeamCard[] = []): { totals: Record<string, number>; team: number; order: number[] } {
  const s = warStanding(war);
  const teams = warTeams(war);
  const totals: Record<string, number> = {};
  // Later teams first, so a name your team shares with another can't be overwritten by theirs.
  for (let i = teams.length - 1; i >= 0; i--) {
    const side = teams[i];
    const card = teamCardFor(cards, side.tag, side.name);
    for (const k of [side.name, side.tag, card?.name, ...(card?.tags ?? [])]) if (k) totals[k.toLowerCase()] = s.totals[i] ?? 0;
  }
  return { totals, team: war.format.size, order: s.totals };
}

export async function createDraft(input: { warId: string | null; guildId: string; channelId: string; body: string; backgroundUrl: string | null; by: { id: string; name: string }; readBody?: string | null; layout?: TableLayout | null }): Promise<string | null> {
  const withRead = input.readBody && (await cardsReady()) ? { read_body: input.readBody.slice(0, 4000) } : {};
  const withLayout = input.layout && (await tableLooksReady()) ? { layout: input.layout } : {};
  const { data, error } = await createServiceClient().from("war_tables").insert({
    war_id: input.warId, guild_id: input.guildId, channel_id: input.channelId, body: input.body.slice(0, 4000), background_url: input.backgroundUrl,
    created_by: input.by.id, created_by_name: input.by.name, ...withRead, ...withLayout,
  }).select("id").single();
  if (error) { console.error("[wars] table draft failed:", error.message); return null; }
  return (data as { id: string }).id;
}

export async function getTable(id: string): Promise<WarTableRow | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [read, looks] = await Promise.all([cardsReady(), tableLooksReady()]);
  const cols: string = `${COLS}${read ? ", read_body" : ""}${looks ? ", layout" : ""}`;
  const { data } = await createServiceClient().from("war_tables").select(cols).eq("id", id).maybeSingle();
  return data ? toRow(data as unknown as Row) : null;
}

export async function updateTable(id: string, patch: Partial<{ body: string; status: WarTableRow["status"]; messageId: string | null; backgroundUrl: string | null; readBody: string | null; layout: TableLayout | null }>): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.body !== undefined) row.body = patch.body.slice(0, 4000);
  if (patch.status) row.status = patch.status;
  if (patch.messageId !== undefined) row.message_id = patch.messageId;
  if (patch.backgroundUrl !== undefined) row.background_url = patch.backgroundUrl;
  if (patch.readBody !== undefined && (await cardsReady())) row.read_body = patch.readBody;
  if (patch.layout !== undefined && (await tableLooksReady())) row.layout = patch.layout;
  await createServiceClient().from("war_tables").update(row).eq("id", id);
}

const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && !!tagKey(a) && tagKey(a) === tagKey(b);

/**
 * A table team's logo from this server's logos (by its tag, its name or any tag on its team card) or the war's team
 * it is (by tag or name).
 */
export function logoFrom(t: { tag: string; name: string | null }, own: { tag: string; name: string | null; url: string }[], sides: WarTeamRef[], cards: TeamCard[] = []): { url: string | null; side: WarTeamRef | undefined } {
  const card = teamCardFor(cards, t.tag, t.name);
  const keys = [t.tag, t.name, ...(card?.tags ?? []), card?.name];
  const side = sides.find((s) => keys.some((v) => same(s.tag, v) || same(s.name, v)));
  const ownFor = (v: string | null | undefined) => own.find((l) => same(l.tag, v) || same(l.name, v))?.url ?? null;
  const url = keys.map(ownFor).find(Boolean) ?? ownFor(side?.tag) ?? ownFor(side?.name) ?? side?.logo ?? null;
  return { url, side };
}

/**
 * Each team's logo for a table: this server's logo for its tag or its name, then the war's own team (matched by tag or
 * name: a team the screenshot showed under another tag keeps the war's as its name), then MKCentral's for either tag.
 */
export async function logosFor(model: TableModel, guildId: string, war: War | null): Promise<Record<string, string | null>> {
  const game: WarGame = war?.game ?? "mk8dx";
  const [own, cards] = await Promise.all([listLogos(guildId).catch(() => []), listTeams(guildId).catch(() => [])]);
  const entries = await Promise.all(model.teams.map(async (t) => {
    const card = teamCardFor(cards, t.tag, t.name);
    const { url, side } = logoFrom(t, own, war ? warTeams(war) : [], cards);
    // logoFrom's url is an upload or the war's own team logo; which counts depends on the card's logo setting.
    const upload = logoFrom(t, own, [], cards).url;
    return [t.tag.toLowerCase(), await cardLogo(card, { upload, warLogo: url !== upload ? url : null, tags: [t.tag, side?.tag], game })] as const;
  }));
  return Object.fromEntries(entries);
}

/**
 * A team's logo by its card's setting (logos + MKCentral picks 2026-11-09): auto = this server's upload, then the
 * linked MKCentral team's (read live, the last one seen when MKCentral can't be reached), then the war's own, then
 * MKCentral by tag; upload = the upload only; mkcentral = the linked team's (or MKCentral by tag when not linked).
 */
export async function cardLogo(card: TeamCard | null, opts: { upload: string | null; warLogo?: string | null; tags: (string | null | undefined)[]; game: WarGame }): Promise<string | null> {
  const source = card?.logoSource ?? "auto";
  if (source === "upload") return opts.upload;
  const linked = card?.mkcTeamId ? ((await mkcTeam(card.mkcTeamId).catch(() => null))?.logo ?? card.mkcLogo ?? null) : null;
  const byTag = async () => {
    for (const tag of [...new Set([...(card?.tags ?? []), ...opts.tags].filter((v): v is string => !!v && v !== "?"))]) {
      const logo = (await registryTeam(tag, opts.game).catch(() => null))?.logo;
      if (logo) return logo;
    }
    return null;
  };
  if (source === "mkcentral") return linked ?? (card?.mkcTeamId ? null : await byTag());
  return opts.upload ?? linked ?? opts.warLogo ?? (await byTag());
}

/**
 * Other names for the tags on a results screen, so its teams can be matched to the war's: MKCentral's team for the
 * tag (Ω is Twilight Zone) and this server's logos ("Ω - Twilight Zone.png"). By tagKey.
 */
export async function tagAliases(tags: string[], game: WarGame, guildId: string): Promise<Record<string, string[]>> {
  const list = tags.slice(0, 6);
  const [own, cards, reg] = await Promise.all([
    listLogos(guildId).catch(() => []),
    listTeams(guildId).catch(() => []),
    withTimeout(Promise.all(list.map((t) => registryTeam(t, game).catch(() => null))), 2500, list.map(() => null)),
  ]);
  const out: Record<string, string[]> = {};
  list.forEach((t, i) => {
    const k = tagKey(t);
    const names = [...(teamAliases(cards)[k] ?? []), reg[i]?.name, ...own.filter((l) => tagKey(l.tag) === k).map((l) => l.name)].filter((v): v is string => !!v);
    if (names.length) out[k] = [...new Set(names)];
  });
  return out;
}

/** The teams on a table with no logo from anywhere (its text, this server, the team card or MKCentral), by index. */
export async function missingLogos(model: TableModel, guildId: string, war: War | null): Promise<number[]> {
  const logos = await logosFor(model, guildId, war).catch(() => ({} as Record<string, string | null>));
  return model.teams.map((t, i) => (t.players.length && !t.logo && !logos[t.tag.toLowerCase()] ? i : -1)).filter((i) => i >= 0);
}

const KEPT_HOSTS = ["gs-ugc.empac.co", "cdn.empac.co", "mkcentral.com"];
const DISCORD_HOSTS = ["cdn.discordapp.com", "media.discordapp.net"];

/**
 * Logo links in a table's text (doc asks pick 2, Ice Mario's way): links to our storage or MKCentral stay; a picture
 * on Discord is checked and copied into our storage (Discord's links expire); anything else is dropped with a note.
 */
export async function settleLogoLinks(model: TableModel, guildId: string, by: { id: string }, userId: string | null): Promise<string[]> {
  const notes: string[] = [];
  for (const t of model.teams) {
    if (!t.logo) continue;
    let host = "";
    try { host = new URL(t.logo).hostname; } catch { /* not a link */ }
    if (KEPT_HOSTS.includes(host)) continue;
    const name = t.name || t.tag;
    if (!DISCORD_HOSTS.includes(host)) {
      t.logo = null;
      notes.push(`${name}'s logo link isn't from Discord or MKCentral, so it wasn't used. Add logos puts one on.`);
      continue;
    }
    const res = await fetch(t.logo, { signal: AbortSignal.timeout(8000) }).catch(() => null);
    const type = res?.headers.get("content-type") ?? "";
    const bytes = res?.ok && /^image\/(png|jpe?g|webp|gif)/.test(type) ? new Uint8Array(await res.arrayBuffer()) : null;
    const stored = bytes && bytes.byteLength <= 8 * 1024 * 1024 ? await uploadTableLogo({ guildId, image: bytes, by, userId }) : null;
    if (stored?.ok) t.logo = stored.url;
    else {
      t.logo = null;
      notes.push(stored && !stored.ok && stored.error === "refused" ? `${name}'s logo can't be used.` : `${name}'s logo link couldn't be opened (Discord's links expire), so it wasn't used. Add logos puts one on.`);
    }
  }
  return notes;
}

/** A channel's posted tables, newest first (/table show). */
export async function recentTables(guildId: string, channelId: string, limit = 25): Promise<WarTableRow[]> {
  const [read, looks] = await Promise.all([cardsReady(), tableLooksReady()]);
  const cols: string = `${COLS}${read ? ", read_body" : ""}${looks ? ", layout" : ""}, updated_at`;
  const { data } = await createServiceClient().from("war_tables").select(cols).eq("guild_id", guildId).eq("channel_id", channelId).eq("status", "posted").order("updated_at", { ascending: false }).limit(limit);
  return ((data ?? []) as unknown as (Row & { updated_at: string })[]).map((r) => ({ ...toRow(r), postedAt: r.updated_at }));
}

/** "Alpakarts vs Another Kart" and "512 to 490 · Nov 10, 10:04 PM" for a table in a list. */
export function tableLabel(table: WarTableRow): { title: string; line: string } {
  const model = parseTable(table.body);
  const teams = model.teams.filter((t) => t.players.length);
  const title = model.title ?? (teams.map((t) => t.name || t.tag).join(" vs ") || "A table");
  const when = table.postedAt ? new Date(table.postedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }) : "";
  return { title, line: [teams.map(teamTotal).join(" to "), when].filter(Boolean).join(" · ") };
}

/** Posts a copy of a table at the bottom of its channel (the old message stays), with its own Edit button. */
export async function repostTable(table: WarTableRow, by: { id: string; name: string }): Promise<PostResult> {
  const id = await createDraft({ warId: table.warId, guildId: table.guildId, channelId: table.channelId, body: table.body, backgroundUrl: table.backgroundUrl, by, layout: table.layout });
  if (!id) return "failed";
  return postTable(id, table.warId ? await getWar(table.warId) : null);
}

function tableMessage(table: WarTableRow, alt: string, war: War | null, missing = false): Record<string, unknown> {
  return {
    flags: V2,
    allowed_mentions: { parse: [] },
    components: [{ type: 17, accent_color: COMP_COLOR, components: [
      { type: 12, items: [{ media: { url: "attachment://table.png" }, description: alt }] },
      { type: 1, components: [
        { type: 2, style: 2, label: "Edit", custom_id: `${TABLE_PREFIX}edit:${table.id}` },
        ...(missing ? [{ type: 2, style: 2, label: "Add logos", custom_id: `${TABLE_PREFIX}logos:${table.id}` }] : []),
        { type: 2, style: 2, label: "Copy the text", custom_id: `${TABLE_PREFIX}copy:${table.id}` },
        ...(war?.races.length ? [linkBtn("War page", `${SITE_URL}${warPagePath(war)}`)] : []),
      ] },
    ] }],
  };
}

export type PostResult = "ok" | "no_access" | "failed";

/** Draws the table and posts it in its channel (or changes the posted message). */
export async function postTable(id: string, war: War | null): Promise<PostResult> {
  const table = await getTable(id);
  if (!table) return "failed";
  const model = parseTable(table.body);
  const codes = model.teams.flatMap((t) => t.players.map((p) => p.flag).filter((f): f is string => !!f));
  const [logos, flags, drawn] = await Promise.all([logosFor(model, table.guildId, war), flagsFor(table.guildId, codes), lookForTable(table.guildId, table.channelId, table.layout)]);
  const pic = await renderTable(model, { logos, flags, background: table.backgroundUrl, races: war ? war.races.length : null, look: drawn.look });
  const missing = model.teams.some((t) => t.players.length && !t.logo && !logos[t.tag.toLowerCase()]);
  const body = tableMessage(table, pic.alt, war, missing);
  const file = { name: "table.png", data: pic.png };
  if (table.status === "posted" && table.messageId) {
    const { flags: _flags, ...edit } = body;
    void _flags;
    const res = await compRestFile("PATCH", `/channels/${table.channelId}/messages/${table.messageId}`, edit, file);
    if (res.ok) return "ok";
    if (res.status !== 404) return res.status === 403 ? "no_access" : "failed";
  }
  const sent = await compRestFile<{ id: string }>("POST", `/channels/${table.channelId}/messages`, body, file);
  if (!sent.ok) { console.error("[wars] table post failed:", sent.status, sent.error); return sent.status === 403 ? "no_access" : "failed"; }
  await updateTable(id, { status: "posted", messageId: sent.data.id });
  return "ok";
}

/** The text of a war's newest posted table, for the war page. */
export async function postedTableFor(warId: string): Promise<string | null> {
  const { data } = await createServiceClient().from("war_tables").select("body").eq("war_id", warId).eq("status", "posted").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return (data as { body: string } | null)?.body ?? null;
}

/** The newest war in a channel from the last 6 hours (what /table makes a table for). */
export async function recentWarId(guildId: string, channelId: string): Promise<string | null> {
  const { data } = await createServiceClient().from("wars").select("id, created_at").eq("guild_id", guildId).eq("channel_id", channelId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const r = data as { id: string; created_at: string } | null;
  return r && Date.now() - Date.parse(r.created_at) < 6 * 3600_000 ? r.id : null;
}

/** A table to show when a channel has none yet: the server's first two team cards (or two made-up teams). */
async function sampleTable(guildId: string): Promise<TableModel> {
  const cards = (await cardsReady()) ? await listTeams(guildId).catch(() => []) : [];
  const teams = [cards[0] ?? { tags: ["YOU"], name: "Your team", color: null }, cards[1] ?? { tags: ["THEM"], name: "Their team", color: null }];
  const scores = [[118, 101, 92, 84, 77, 66], [104, 90, 81, 73, 62, 52]];
  return {
    title: null, date: null, settings: [], skipped: [],
    teams: teams.map((t, i) => ({ tag: t.tags[0] ?? "?", name: t.name, color: t.color, penalty: 0, players: scores[i].map((score, j) => ({ name: `Player ${i * 6 + j + 1}`, flag: null, score })) })),
  };
}

/**
 * The Teams page's preview: the channel's newest posted table (else a sample with the server's teams) drawn in
 * `look`, on the channel's saved background, the way new tables there will be.
 */
export async function previewTable(guildId: string, channelId: string, look: TableLook): Promise<TablePicture> {
  const { data } = await createServiceClient().from("war_tables").select("body, war_id").eq("guild_id", guildId).eq("channel_id", channelId).eq("status", "posted").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const row = data as { body: string; war_id: string | null } | null;
  const [war, channel] = await Promise.all([row?.war_id ? getWar(row.war_id) : null, warChannel(guildId, channelId)]);
  const model = row ? parseTable(row.body) : await sampleTable(guildId);
  const codes = model.teams.flatMap((t) => t.players.map((p) => p.flag).filter((f): f is string => !!f));
  const [logos, flags] = await Promise.all([logosFor(model, guildId, war), flagsFor(guildId, codes)]);
  return renderTable(model, { logos, flags, background: channel?.background ?? null, races: war ? war.races.length : row ? null : 12, look });
}
