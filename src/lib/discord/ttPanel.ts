import "server-only";

/**
 * The time trial panel (GameShuffle Competitive; picks 2026-10-30, https://claude.ai/artifact/Nn8Qv4EVRDL6zojwHVCcdN):
 * one message per server and game, posted by a server manager with /tt panel or from the site, with this month's
 * numbers, the newest server records and the buttons (Add a time, Top ten, My times, Server board). It refreshes
 * when a time comes in, at most once a minute (REFRESH_MS); the every-minute sweep catches up on the rest and
 * starts the month's numbers over on the 1st (Pacific).
 *
 * Where each panel is lives in the competitive app's server row: discord_app_guilds.settings.ttPanels
 * = { [game]: { channel, message, refreshedAt, month, dirty } }, game being mk8dx, mkworld or both.
 * Every call here uses the competitive bot's token, whichever app the request came in on.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/seo";
import { describePlayers } from "@/lib/daily/boards";
import { gsMonthStart } from "@/lib/time/gsClock";
import { panelFacts, serverName, type ServerTime } from "@/lib/timeTrials/server";
import { categoryText } from "@/lib/timeTrials/categories";
import { formatTime } from "@/lib/timeTrials/rules";
import { serverPath, ttTrack, TT_GAMES, TT_GAME_ORDER, type TtGame } from "@/lib/timeTrials/tracks";
import { trackCode } from "@/lib/timeTrials/codes";
import { botTokenFor } from "./apps";
import { getAppGuild, patchAppGuildSettings } from "./appGuilds";

export type PanelGame = TtGame | "both";
export const PANEL_GAMES: PanelGame[] = ["mk8dx", "mkworld", "both"];
export const isPanelGame = (v: unknown): v is PanelGame => v === "mk8dx" || v === "mkworld" || v === "both";
export const panelGameLabel = (g: PanelGame) => (g === "both" ? "Both games" : TT_GAMES[g].label);

export interface PanelRef { channel: string; message: string; refreshedAt?: string; month?: string; dirty?: boolean }
type Panels = Partial<Record<PanelGame, PanelRef>>;

/** Buttons on the panel: ttp:add:<game>, ttp:top:<game>, ttp:me:<game>. */
export const TT_PANEL_PREFIX = "ttp:";
/** The competitive app's gold. */
export const COMP_COLOR = 0xf0b232;
const COMPONENTS_V2 = 1 << 15;
const REFRESH_MS = 60_000;
/** The sweep also refreshes a panel this old, for times added on the site by the server's players. */
const STALE_MS = 15 * 60_000;
const SWEEP_MAX = 25;

type RestResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

async function rest<T = unknown>(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", path: string, body?: unknown): Promise<RestResult<T>> {
  const token = botTokenFor("comp");
  if (!token) return { ok: false, status: 0, error: "no_token" };
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  if (!res) return { ok: false, status: 0, error: "network" };
  if (!res.ok) return { ok: false, status: res.status, error: (await res.text().catch(() => "")).slice(0, 200) };
  return { ok: true, data: (res.status === 204 ? {} : await res.json().catch(() => ({}))) as T };
}

const panelsOf = (settings: Record<string, unknown>): Panels => ((settings.ttPanels ?? {}) as Panels);
const withPanels = (settings: Record<string, unknown>, panels: Panels) => ({ ...settings, ttPanels: panels });

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** The panel message's components (Components V2: one container). */
export async function panelComponents(guildId: string, game: PanelGame, name?: string | null): Promise<unknown[]> {
  const games: TtGame[] = game === "both" ? TT_GAME_ORDER : [game];
  const [facts, serverTitle] = await Promise.all([
    Promise.all(games.map((g) => panelFacts(guildId, g, true).then((f) => ({ g, f })))),
    name === undefined ? serverName(guildId) : Promise.resolve(name),
  ]);
  const monthTimes = facts.reduce((n, { f }) => n + f.monthTimes, 0);
  const monthPlayers = new Set(facts.flatMap(({ f }) => f.monthPlayerKeys)).size;
  const records: (ServerTime & { game: TtGame })[] = facts.flatMap(({ g, f }) => f.records.map((r) => ({ ...r, game: g })))
    .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3);
  const names = await describePlayers([...new Set(records.map((r) => r.player))]);

  const gameLine = games.map((g) => TT_GAMES[g].label).join(" and ");
  const head = [
    `### Time trials in ${serverTitle || "this server"}`,
    `${gameLine} · ${monthTimes ? `${plural(monthTimes, "time", "times")} from ${plural(monthPlayers, "player", "players")} this month` : "no times yet this month"}`,
  ].join("\n");
  const recordLines = records.map((r) => {
    const t = ttTrack(r.game, r.track)!;
    const cat = categoryText(r.game, r.cc, r.items, "any", TT_GAMES[r.game].classes.length > 1);
    return `\`${trackCode(t) ?? t.name}\` **${formatTime(r.timeMs)}** · ${names.get(r.player)?.name ?? "A player"} · ${cat}${game === "both" ? ` · ${TT_GAMES[r.game].short}` : ""}`;
  });
  const recordsText = records.length ? `**Newest server records**\n${recordLines.join("\n")}` : "**Newest server records**\nNone yet. Add the first time.";
  const boardGame = game === "both" ? (facts.find(({ f }) => f.records.length)?.g ?? TT_GAME_ORDER[0]) : game;
  return [{
    type: 17,
    accent_color: COMP_COLOR,
    components: [
      { type: 10, content: head },
      { type: 14, divider: true, spacing: 1 },
      { type: 10, content: recordsText },
      { type: 14, divider: true, spacing: 1 },
      { type: 1, components: [
        { type: 2, style: 3, label: "Add a time", custom_id: `${TT_PANEL_PREFIX}add:${game}` },
        { type: 2, style: 2, label: "Top ten", custom_id: `${TT_PANEL_PREFIX}top:${game}` },
        { type: 2, style: 2, label: "My times", custom_id: `${TT_PANEL_PREFIX}me:${game}` },
        { type: 2, style: 5, label: "Server board", url: `${SITE_URL}${serverPath(guildId, boardGame)}` },
      ] },
    ],
  }];
}

async function pin(channelId: string, messageId: string): Promise<boolean> {
  const now = await rest("PUT", `/channels/${channelId}/messages/pins/${messageId}`);
  if (now.ok) return true;
  if (now.status === 404 || now.status === 405) return (await rest("PUT", `/channels/${channelId}/pins/${messageId}`)).ok;
  return false;
}

export type PostPanelResult = { ok: true; pinned: boolean } | { ok: false; error: "not_connected" | "no_access" | "no_channel" | "failed" };

/** Posts (or moves) a server's panel for a game into a channel; the old one, if any, is deleted. */
export async function postPanel(guildId: string, channelId: string, game: PanelGame): Promise<PostPanelResult> {
  const row = await getAppGuild("comp", guildId);
  if (!row) return { ok: false, error: "not_connected" };
  const components = await panelComponents(guildId, game, row.name);
  const sent = await rest<{ id: string }>("POST", `/channels/${channelId}/messages`, { flags: COMPONENTS_V2, components, allowed_mentions: { parse: [] } });
  if (!sent.ok) {
    console.error("[tt panel] post failed:", sent.status, sent.error);
    return { ok: false, error: sent.status === 403 ? "no_access" : sent.status === 404 ? "no_channel" : "failed" };
  }
  const old = panelsOf(row.settings)[game];
  if (old && old.message !== sent.data.id) await rest("DELETE", `/channels/${old.channel}/messages/${old.message}`);
  const pinned = await pin(channelId, sent.data.id);
  await patchAppGuildSettings("comp", guildId, (s) => withPanels(s, { ...panelsOf(s), [game]: { channel: channelId, message: sent.data.id, refreshedAt: new Date().toISOString(), month: gsMonthStart(), dirty: false } }));
  return { ok: true, pinned };
}

/** Takes a server's panel for a game down (deletes the message). */
export async function removePanel(guildId: string, game: PanelGame): Promise<boolean> {
  const row = await getAppGuild("comp", guildId);
  const ref = row ? panelsOf(row.settings)[game] : undefined;
  if (!row || !ref) return false;
  await rest("DELETE", `/channels/${ref.channel}/messages/${ref.message}`);
  return patchAppGuildSettings("comp", guildId, (s) => {
    const panels = { ...panelsOf(s) };
    delete panels[game];
    return withPanels(s, panels);
  });
}

/** The panel a server has for a game (its own, else a both-games panel), or null. */
export async function panelFor(guildId: string, game: TtGame): Promise<PanelRef | null> {
  const row = await getAppGuild("comp", guildId).catch(() => null);
  if (!row || row.removedAt) return null;
  const panels = panelsOf(row.settings);
  return panels[game] ?? panels.both ?? null;
}

/** Whether a server has any panel up (its server board page only exists then). */
export async function hasPanel(guildId: string): Promise<boolean> {
  const row = await getAppGuild("comp", guildId).catch(() => null);
  return !!row && !row.removedAt && Object.keys(panelsOf(row.settings)).length > 0;
}

/** Edits one panel message in place; false when the message is gone (it's then forgotten). */
async function editPanel(guildId: string, game: PanelGame, ref: PanelRef, name: string | null): Promise<"ok" | "gone" | "failed"> {
  const components = await panelComponents(guildId, game, name);
  const res = await rest("PATCH", `/channels/${ref.channel}/messages/${ref.message}`, { components, allowed_mentions: { parse: [] } });
  if (res.ok) return "ok";
  if (res.status === 404 || res.status === 403) return "gone";
  console.error("[tt panel] edit failed:", res.status, res.error);
  return "failed";
}

/** Brings the server's panels for a game up to date: now, unless one was refreshed in the last minute (then the sweep does it). */
export async function refreshPanels(guildId: string, game: TtGame, force = false): Promise<void> {
  await refreshSome(guildId, [game, "both"], force);
}

async function refreshSome(guildId: string, want: PanelGame[], force: boolean): Promise<void> {
  const row = await getAppGuild("comp", guildId).catch(() => null);
  if (!row || row.removedAt) return;
  const panels = panelsOf(row.settings);
  const targets = want.filter((g) => panels[g]);
  if (!targets.length) return;
  const now = Date.now();
  const changes: Panels = {};
  const gone: PanelGame[] = [];
  for (const g of targets) {
    const ref = panels[g]!;
    if (!force && ref.refreshedAt && now - Date.parse(ref.refreshedAt) < REFRESH_MS) { changes[g] = { ...ref, dirty: true }; continue; }
    const res = await editPanel(guildId, g, ref, row.name);
    if (res === "gone") gone.push(g);
    else if (res === "ok") changes[g] = { ...ref, refreshedAt: new Date().toISOString(), month: gsMonthStart(), dirty: false };
    else changes[g] = { ...ref, dirty: true };
  }
  await patchAppGuildSettings("comp", guildId, (s) => {
    const next = { ...panelsOf(s), ...changes };
    for (const g of gone) delete next[g];
    return withPanels(s, next);
  });
}

/** Every-minute catch-up: panels marked dirty, from an earlier month, or older than STALE_MS. */
export async function sweepTtPanels(): Promise<number> {
  if (!botTokenFor("comp")) return 0;
  const { data, error } = await createServiceClient().from("discord_app_guilds").select("guild_id, settings").eq("app", "comp").is("removed_at", null);
  if (error) return 0;
  const month = gsMonthStart();
  const now = Date.now();
  let done = 0;
  for (const r of (data ?? []) as { guild_id: string; settings: Record<string, unknown> | null }[]) {
    if (done >= SWEEP_MAX) break;
    const due = (Object.entries(panelsOf(r.settings ?? {})) as [PanelGame, PanelRef][])
      .filter(([, p]) => p.dirty || p.month !== month || !p.refreshedAt || now - Date.parse(p.refreshedAt) > STALE_MS)
      .map(([g]) => g);
    if (!due.length) continue;
    await refreshSome(r.guild_id, due, true);
    done += due.length;
  }
  return done;
}

/** Posts a message into the channel of a server's panel for a game, as the competitive bot. */
export async function postToPanelChannel(guildId: string, game: TtGame, body: Record<string, unknown>): Promise<boolean> {
  const ref = await panelFor(guildId, game);
  if (!ref) return false;
  const res = await rest("POST", `/channels/${ref.channel}/messages`, { allowed_mentions: { parse: [] }, ...body });
  if (!res.ok) console.error("[tt panel] record post failed:", res.status, res.error);
  return res.ok;
}
