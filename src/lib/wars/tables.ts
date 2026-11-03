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
import { POINTS, standing, type WarGame } from "./rules";
import { formatTable, parseTable, type TableModel } from "./table";
import { renderTable } from "./tableCard";
import { serverLogo } from "./logos";
import { flagsFor } from "./flags";
import { registryTeam } from "./teams";
import type { War } from "./store";
import { SITE_URL } from "@/lib/seo";
import { linkBtn } from "./discord";
import { warPagePath } from "./page";

export interface WarTableRow { id: string; warId: string | null; guildId: string; channelId: string; body: string; backgroundUrl: string | null; status: "draft" | "posted" | "canceled"; messageId: string | null; createdBy: string; createdByName: string | null }
type Row = { id: string; war_id: string | null; guild_id: string; channel_id: string; body: string; background_url: string | null; status: WarTableRow["status"]; message_id: string | null; created_by: string; created_by_name: string | null };
const COLS = "id, war_id, guild_id, channel_id, body, background_url, status, message_id, created_by, created_by_name";
const toRow = (r: Row): WarTableRow => ({ id: r.id, warId: r.war_id, guildId: r.guild_id, channelId: r.channel_id, body: r.body, backgroundUrl: r.background_url, status: r.status, messageId: r.message_id, createdBy: r.created_by, createdByName: r.created_by_name });

export const TABLE_PREFIX = "wtab:";
const V2 = 1 << 15;
const lounge = (g: WarGame): "mk8dx" | "mkworld12p" => (g === "mk8dx" ? "mk8dx" : "mkworld12p");

async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

/** The text a war's table starts from. */
export async function prefillFor(war: War): Promise<string> {
  const date = new Date(war.createdAt).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const model: TableModel = { title: `${war.us.name || war.us.tag} vs ${war.them.name || war.them.tag}`, date, settings: [], skipped: [], teams: [
    { tag: war.us.tag, name: war.us.name, color: null, players: [], penalty: war.penalties.filter((p) => p.side === "us").reduce((a, p) => a + p.points, 0) },
    { tag: war.them.tag, name: war.them.name, color: null, players: [], penalty: war.penalties.filter((p) => p.side === "them").reduce((a, p) => a + p.points, 0) },
  ] };
  // Every race tapped in by the players themselves: their scores are known exactly.
  if (war.races.length && war.races.every((r) => r.players?.length)) {
    const pts = new Map<string, { name: string; score: number }>();
    for (const r of war.races) for (const p of r.players ?? []) {
      const now = pts.get(p.id) ?? { name: p.name, score: 0 };
      now.score += POINTS[p.place - 1] ?? 0;
      pts.set(p.id, now);
    }
    const ids = [...pts.keys()];
    const flags = await withTimeout(Promise.all(ids.map((id) => loungeBasic({ discordId: id }, lounge(war.game)).catch(() => null))), 3000, ids.map(() => null));
    model.teams[0].players = ids.map((id, i) => ({ name: flags[i]?.name ?? pts.get(id)!.name, flag: flags[i]?.country?.toLowerCase() ?? null, score: pts.get(id)!.score }))
      .sort((a, b) => b.score - a.score);
  }
  return formatTable(model);
}

/** A war's totals as the table check wants them (penalties included). */
export function warTotals(war: War): { totals: Record<string, number>; team: number } {
  const s = standing(war.races, war.penalties, war.racesTotal);
  return { totals: { [war.us.tag.toLowerCase()]: s.us, [war.them.tag.toLowerCase()]: s.them }, team: 6 };
}

export async function createDraft(input: { warId: string | null; guildId: string; channelId: string; body: string; backgroundUrl: string | null; by: { id: string; name: string } }): Promise<string | null> {
  const { data, error } = await createServiceClient().from("war_tables").insert({
    war_id: input.warId, guild_id: input.guildId, channel_id: input.channelId, body: input.body.slice(0, 4000), background_url: input.backgroundUrl,
    created_by: input.by.id, created_by_name: input.by.name,
  }).select("id").single();
  if (error) { console.error("[wars] table draft failed:", error.message); return null; }
  return (data as { id: string }).id;
}

export async function getTable(id: string): Promise<WarTableRow | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await createServiceClient().from("war_tables").select(COLS).eq("id", id).maybeSingle();
  return data ? toRow(data as Row) : null;
}

export async function updateTable(id: string, patch: Partial<{ body: string; status: WarTableRow["status"]; messageId: string | null; backgroundUrl: string | null }>): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.body !== undefined) row.body = patch.body.slice(0, 4000);
  if (patch.status) row.status = patch.status;
  if (patch.messageId !== undefined) row.message_id = patch.messageId;
  if (patch.backgroundUrl !== undefined) row.background_url = patch.backgroundUrl;
  await createServiceClient().from("war_tables").update(row).eq("id", id);
}

/** Each team's logo for a table: this server's, else MKCentral's, else the war's own. */
async function logosFor(model: TableModel, guildId: string, war: War | null): Promise<Record<string, string | null>> {
  const game: WarGame = war?.game ?? "mkworld";
  const entries = await Promise.all(model.teams.map(async (t) => {
    const k = t.tag.toLowerCase();
    const own = await serverLogo(guildId, t.tag);
    if (own) return [k, own] as const;
    const fromWar = war ? (war.us.tag.toLowerCase() === k ? war.us.logo : war.them.tag.toLowerCase() === k ? war.them.logo : null) : null;
    if (fromWar) return [k, fromWar] as const;
    return [k, (await registryTeam(t.tag, game).catch(() => null))?.logo ?? null] as const;
  }));
  return Object.fromEntries(entries);
}

function tableMessage(table: WarTableRow, alt: string, war: War | null): Record<string, unknown> {
  return {
    flags: V2,
    allowed_mentions: { parse: [] },
    components: [{ type: 17, accent_color: COMP_COLOR, components: [
      { type: 12, items: [{ media: { url: "attachment://table.png" }, description: alt }] },
      { type: 1, components: [
        { type: 2, style: 2, label: "Edit", custom_id: `${TABLE_PREFIX}edit:${table.id}` },
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
  const [logos, flags] = await Promise.all([logosFor(model, table.guildId, war), flagsFor(table.guildId, codes)]);
  const pic = await renderTable(model, { logos, flags, background: table.backgroundUrl, races: war ? war.races.length : null });
  const body = tableMessage(table, pic.alt, war);
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

