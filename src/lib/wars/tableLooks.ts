import "server-only";

/**
 * War channels' table looks (war_channels.table_look, war_tables.layout; wars-m7.sql). The paid choices show while the
 * account that added GameShuffle Competitive to the server has GS Pro or Supporter looks; the saved choice is kept
 * either way, so it comes back with the plan.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { getAppGuild } from "@/lib/discord/appGuilds";
import { hasLooks } from "@/lib/support/looks";
import { rememberChannel } from "./store";
import { cleanTableLook, freeTableLook, isTableLayout, tablePaidUsed, type TableLayout, type TableLook } from "./tableLook";

let ready: boolean | null = null;
/** Whether wars-m7.sql has run (a plain read: a head request to a missing column answers without an error). */
export async function tableLooksReady(): Promise<boolean> {
  if (ready) return true;
  const { error } = await createServiceClient().from("war_channels").select("table_look").limit(1);
  ready = !error;
  return ready;
}

/** A channel's saved look, as saved (null when it has none: the default). */
export async function savedTableLook(guildId: string, channelId: string): Promise<TableLook | null> {
  if (!(await tableLooksReady())) return null;
  const { data } = await createServiceClient().from("war_channels").select("table_look").eq("guild_id", guildId).eq("channel_id", channelId).maybeSingle();
  const raw = (data as { table_look: unknown } | null)?.table_look;
  return raw ? cleanTableLook(raw) : null;
}

/** Saves a channel's look (makes the channel's row the first time). */
export async function saveTableLook(guildId: string, channelId: string, look: TableLook): Promise<boolean> {
  if (!(await tableLooksReady())) return false;
  const db = createServiceClient();
  const { data } = await db.from("war_channels").select("channel_id").eq("guild_id", guildId).eq("channel_id", channelId).maybeSingle();
  if (!data && !(await rememberChannel(guildId, channelId, {}))) return false;
  const { error } = await db.from("war_channels").update({ table_look: cleanTableLook(look), updated_at: new Date().toISOString() }).eq("guild_id", guildId).eq("channel_id", channelId);
  if (error) { console.error("[wars] save table look failed:", error.message); return false; }
  return true;
}

/** Changes only a channel's layout (the table form's "Save them for this channel's tables"). */
export async function saveTableLayout(guildId: string, channelId: string, layout: TableLayout): Promise<boolean> {
  return saveTableLook(guildId, channelId, { ...((await savedTableLook(guildId, channelId)) ?? cleanTableLook({})), layout });
}

/** Whether the server's tables may show paid looks: the account that added Competitive to it has looks. */
export async function serverHasLooks(guildId: string): Promise<boolean> {
  const g = await getAppGuild("comp", guildId).catch(() => null);
  return g?.ownerUserId ? hasLooks(g.ownerUserId).catch(() => false) : false;
}

export interface DrawnLook {
  /** What the table is drawn with (paid choices swapped for free ones when the server has no looks). */
  look: TableLook;
  /** The paid choices saved but not shown, in words (empty when every choice shows). */
  held: string[];
}

/** The look a table in a channel is drawn with: the channel's, in the table's own layout when it has one. */
export async function lookForTable(guildId: string, channelId: string, layout: string | null = null): Promise<DrawnLook> {
  const saved = (await savedTableLook(guildId, channelId)) ?? cleanTableLook({});
  const look = isTableLayout(layout) ? { ...saved, layout } : saved;
  const paid = tablePaidUsed(look);
  if (!paid.length) return { look, held: [] };
  return (await serverHasLooks(guildId)) ? { look, held: [] } : { look: freeTableLook(look), held: paid };
}

/** A server's war channels with their looks and saved backgrounds, for the Teams page. */
export async function channelTableLooks(guildId: string): Promise<{ channelId: string; look: TableLook | null; game: string | null; team: string | null; background: string | null }[]> {
  const ok = await tableLooksReady();
  const { data } = await createServiceClient().from("war_channels").select(`channel_id, game, team_tag, team_name, background_url${ok ? ", table_look" : ""}`).eq("guild_id", guildId).order("updated_at", { ascending: false }).limit(25);
  return ((data ?? []) as unknown as { channel_id: string; game: string | null; team_tag: string | null; team_name: string | null; background_url: string | null; table_look?: unknown }[])
    .map((r) => ({ channelId: r.channel_id, look: r.table_look ? cleanTableLook(r.table_look) : null, game: r.game, team: r.team_name || r.team_tag, background: r.background_url }));
}

/** Stops using a channel's saved background (its tables go back to the look's own background). */
export async function clearChannelBackground(guildId: string, channelId: string): Promise<boolean> {
  return !!(await rememberChannel(guildId, channelId, { background: null }));
}
