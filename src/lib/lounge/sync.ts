import "server-only";

/**
 * The lounge's 15-minute check (competitive dashboard picks, 2026-10-20): refresh every
 * confirmed player's numbers, then in Discord post rank-ups (free, a server's opt-in
 * "Lounge rank-ups" switch), keep division roles in step (GS Pro, per server) and post the
 * weekly board of a server's confirmed players on Monday (GS Pro, per server).
 *
 * A rank-up posts once per division per season: `posted_division` keeps the highest
 * division already posted ("3:Platinum"), so dipping under a line and climbing back
 * doesn't post again.
 *
 * Which bot (two-app picks): a server with GameShuffle Competitive gets these from Competitive, with its settings
 * (src/lib/lounge/compLounge.ts, carried over from GameShuffle's the first time); a server with only GameShuffle keeps
 * getting them from GameShuffle until the 30-day move ends (compMoveState "moved"), then not at all.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { isProUser } from "@/lib/subscription-server";
import { gsDay, gsWeekStart, gsWeekday } from "@/lib/time/gsClock";
import { addGuildMemberRole, createGuildRole, listGuildMembers, postComponentsMessage, removeGuildMemberRole } from "@/lib/adapters/discord/adapter";
import { LoungeUnavailable, divisionSteps, loungePlayer, type LoungePlayer } from "@/lib/mmr/mkcentral";
import { divisionLook } from "@/lib/mmr/look";
import { medalUrl } from "@/lib/mmr/medals";
import { MMR_GAMES, fmtMmr, isMmrGame, placeWord, signed, splitDivision, standing, winStreak, type DivisionStep, type MmrGame } from "@/lib/mmr/rules";
import { linkUpdate, postedKey } from "./store";
import { withDiscordApp } from "@/lib/discord/apps";
import { compMoveState } from "@/lib/discord/compMove";
import { appGuildsReady, patchAppGuildSettings } from "@/lib/discord/appGuilds";
import { EMPTY_COMP_LOUNGE, readCompLounge, type CompLounge } from "./compLounge";
import { loungePagePath } from "./lines";

const SITE = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") || "https://www.gameshuffle.co";
/** Links older than this are read again. */
const STALE_MS = 14 * 60_000;

/** Is `division` higher than the highest one already posted this season? */
export function isNewHigh(division: string | null, posted: string | null, season: number | null, steps: DivisionStep[]): boolean {
  if (!division || division === "Placement") return false;
  const [pSeason, ...rest] = (posted ?? "").split(":");
  const pDivision = rest.join(":");
  if (!posted || Number(pSeason) !== (season ?? 0)) return true;
  const idx = (name: string) => steps.findIndex((s) => s.name === name);
  return idx(division) > idx(pDivision);
}

type LinkRow = { user_id: string; game: MmrGame; player_id: number; name: string; week_mmr: number | null; week_of: string | null; posted_division: string | null };
interface RankUp { userId: string; game: MmrGame; player: LoungePlayer; steps: DivisionStep[] }

async function inBatches<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

/** Read the stalest links again (up to `limit`). Returns the players who reached a new division. */
export async function refreshLinks(limit = 120): Promise<{ checked: number; rankUps: RankUp[]; failed: number }> {
  const db = createServiceClient();
  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  const { data, error } = await db.from("lounge_links")
    .select("user_id, game, player_id, name, week_mmr, week_of, posted_division")
    .or(`checked_at.is.null,checked_at.lt.${cutoff}`)
    .order("checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) { console.error("[lounge] refresh read:", error.message); return { checked: 0, rankUps: [], failed: 0 }; }
  const rows = (data ?? []) as LinkRow[];
  const rankUps: RankUp[] = [];
  const steps = new Map<MmrGame, DivisionStep[]>();
  let checked = 0, failed = 0;
  await inBatches(rows, 4, async (row) => {
    if (!isMmrGame(row.game)) return;
    let player: LoungePlayer | null;
    try { player = await loungePlayer({ id: row.player_id }, row.game, { fresh: true }); } catch (e) { if (!(e instanceof LoungeUnavailable)) console.error("[lounge] refresh:", e); failed++; return; }
    if (!player) {
      // Gone from the lounge (or hidden): stamp it so it isn't read every run.
      await db.from("lounge_links").update({ checked_at: new Date().toISOString() }).eq("user_id", row.user_id).eq("game", row.game);
      return;
    }
    if (!steps.has(row.game)) steps.set(row.game, await divisionSteps(row.game));
    const st = steps.get(row.game)!;
    const division = standing(player.mmr, st, player.division).division;
    const update: Record<string, unknown> = linkUpdate(player, { weekOf: row.week_of, weekMmr: row.week_mmr });
    if (isNewHigh(division, row.posted_division, player.season, st)) {
      // A first sighting this season only records the division (no post for where they already were).
      if (row.posted_division && Number(row.posted_division.split(":")[0]) === (player.season ?? 0)) rankUps.push({ userId: row.user_id, game: row.game, player, steps: st });
      update.posted_division = postedKey(player.season, division);
    }
    await db.from("lounge_links").update(update).eq("user_id", row.user_id).eq("game", row.game);
    checked++;
  });
  return { checked, rankUps, failed };
}

// ── Discord ──────────────────────────────────────────────────────────────

type GuildRow = {
  guild_id: string; owner_user_id: string; guild_name: string | null; is_main: boolean; default_channel_id: string | null;
  event_subscriptions: Record<string, boolean> | null; lounge_roles_game: MmrGame | null; lounge_role_ids: Record<string, string> | null;
  lounge_board_game: MmrGame | null; lounge_board_week: string | null;
};

/** A server's lounge work, whichever bot does it. */
interface LoungeServer {
  app: "main" | "comp";
  guildId: string;
  ownerUserId: string;
  name: string | null;
  channel: string | null;
  rankUps: boolean;
  rolesGame: MmrGame | null;
  roleIds: Record<string, string>;
  boardGame: MmrGame | null;
  boardWeek: string | null;
}

const colorInt = (hex: string) => parseInt(hex.replace("#", "").slice(0, 6), 16) || 0x2b52d6;
const linkButton = (label: string, url: string) => [{ type: 1, components: [{ type: 2, style: 5, label, url }] }];

function rankUpMessage(r: RankUp) {
  const p = r.player;
  const st = standing(p.mmr, r.steps, p.division);
  const last = p.changes.find((c) => c.reason === "Table");
  const streak = winStreak(p.changes);
  const how = last ? ` after a ${last.place ? `${placeWord(last.place)} place ` : "win "}(${signed(last.delta)})` : "";
  const fields = [
    { name: "MMR", value: fmtMmr(p.mmr ?? 0), inline: true },
    ...(p.worldRank ? [{ name: "World", value: `#${p.worldRank.toLocaleString("en-US")}`, inline: true }] : []),
    ...(st.next ? [{ name: "Next", value: `${st.next.name} in ${fmtMmr(st.toNext ?? 0)}`, inline: true }] : []),
  ];
  const medal = medalUrl(divisionLook(st.division).base);
  return {
    embeds: [{
      title: `${p.name} reached ${st.division}`,
      description: `${fmtMmr(p.mmr ?? 0)}${how}.${streak >= 3 ? ` ${streak} wins in a row.` : ""}`,
      // The light tone: the deep one is near black for Master and Grandmaster, lost on Discord's dark theme.
      color: colorInt(divisionLook(st.division).c),
      ...(medal ? { thumbnail: { url: medal } } : {}),
      fields,
      footer: { text: `${MMR_GAMES[r.game].short} lounge · GameShuffle` },
    }],
    components: linkButton("Lounge page", `${SITE}${loungePagePath(p.name, r.game)}`),
  };
}

/** Where a server's lounge posts go: its lounge route when the owner has GS Pro, else its default channel. */
async function loungeChannels(guilds: GuildRow[], ownerPro: Map<string, boolean>): Promise<Map<string, string>> {
  const ids = guilds.map((g) => g.guild_id);
  const routes = ids.length ? (await createServiceClient().from("discord_channel_routes").select("guild_id, channel_id").eq("category", "lounge").in("guild_id", ids)).data ?? [] : [];
  const routed = new Map((routes as { guild_id: string; channel_id: string }[]).map((r) => [r.guild_id, r.channel_id]));
  const out = new Map<string, string>();
  for (const g of guilds) {
    const ch = (ownerPro.get(g.owner_user_id) ? routed.get(g.guild_id) : null) ?? g.default_channel_id;
    if (ch) out.set(g.guild_id, ch);
  }
  return out;
}

/** Division roles for a server's game: the base divisions (MK8DX's Platinum 1 and 2 share Platinum). */
const roleNames = (steps: DivisionStep[]) => [...new Set(steps.map((s) => splitDivision(s.name).base))];

async function saveLounge(g: LoungeServer, patch: { roleIds?: Record<string, string>; boardWeek?: string }): Promise<void> {
  if (g.app === "main") {
    await createServiceClient().from("discord_guilds").update({
      ...(patch.roleIds ? { lounge_role_ids: patch.roleIds } : {}),
      ...(patch.boardWeek ? { lounge_board_week: patch.boardWeek } : {}),
    }).eq("guild_id", g.guildId);
    return;
  }
  await patchAppGuildSettings("comp", g.guildId, (st) => ({ ...st, lounge: { ...(readCompLounge(st) ?? EMPTY_COMP_LOUNGE), ...patch } }));
}

async function ensureRoles(g: LoungeServer, game: MmrGame): Promise<Record<string, string> | null> {
  const names = roleNames(await divisionSteps(game));
  const have = { ...g.roleIds };
  let changed = false;
  for (const name of names) {
    if (have[name]) continue;
    const made = await createGuildRole(g.guildId, { name, color: colorInt(divisionLook(name).c2) });
    if (!made.ok) { console.warn(`[lounge] role ${name} in ${g.guildId}:`, made.error); return Object.keys(have).length ? have : null; }
    have[name] = made.role.id;
    changed = true;
  }
  if (changed) await saveLounge(g, { roleIds: have });
  return have;
}

/**
 * Every server that gets lounge posts, with the bot that does them. GameShuffle Competitive's servers first (their own
 * settings, or GameShuffle's carried over once); then GameShuffle's servers without Competitive, until the move ends.
 */
export async function loungeServers(): Promise<{ servers: LoungeServer[]; ownerPro: Map<string, boolean> }> {
  const db = createServiceClient();
  const { data, error } = await db.from("discord_guilds")
    .select("guild_id, owner_user_id, guild_name, is_main, default_channel_id, event_subscriptions, lounge_roles_game, lounge_role_ids, lounge_board_game, lounge_board_week")
    .is("removed_at", null);
  if (error && !/lounge_/.test(error.message)) console.error("[lounge] guilds:", error.message);
  const mains = (error ? [] : (data ?? [])) as GuildRow[];
  const comps = (await appGuildsReady())
    ? ((await db.from("discord_app_guilds").select("guild_id, owner_user_id, guild_name, settings").eq("app", "comp").is("removed_at", null)).data ?? []) as Array<{ guild_id: string; owner_user_id: string; guild_name: string | null; settings: Record<string, unknown> | null }>
    : [];
  const ownerPro = new Map<string, boolean>();
  for (const o of new Set([...mains.map((g) => g.owner_user_id), ...comps.map((g) => g.owner_user_id)])) ownerPro.set(o, await isProUser(o));

  const servers: LoungeServer[] = [];
  const mainOf = new Map(mains.map((g) => [g.guild_id, g]));
  for (const c of comps) {
    let lounge = readCompLounge(c.settings);
    if (!lounge) {
      // First time: GameShuffle's lounge settings for this server come along (its roles too, so none are made twice).
      const m = mainOf.get(c.guild_id);
      lounge = m
        ? { rankUps: m.event_subscriptions?.lounge === true, rolesGame: m.lounge_roles_game, boardGame: m.lounge_board_game, roleIds: m.lounge_role_ids ?? {}, boardWeek: m.lounge_board_week }
        : EMPTY_COMP_LOUNGE;
      const carried: CompLounge = lounge;
      await patchAppGuildSettings("comp", c.guild_id, (st) => ({ ...st, lounge: carried }));
    }
    const ch = c.settings?.channel;
    servers.push({ app: "comp", guildId: c.guild_id, ownerUserId: c.owner_user_id, name: c.guild_name, channel: typeof ch === "string" ? ch : null, ...lounge });
  }
  if (compMoveState() !== "moved") {
    const compHere = new Set(comps.map((c) => c.guild_id));
    // A server works without GS Pro only if it's the owner's main one.
    const active = mains.filter((g) => !compHere.has(g.guild_id) && (g.is_main || ownerPro.get(g.owner_user_id)));
    const channels = await loungeChannels(active, ownerPro);
    for (const g of active) {
      servers.push({
        app: "main", guildId: g.guild_id, ownerUserId: g.owner_user_id, name: g.guild_name, channel: channels.get(g.guild_id) ?? null,
        rankUps: g.event_subscriptions?.lounge === true, rolesGame: g.lounge_roles_game, roleIds: g.lounge_role_ids ?? {},
        boardGame: g.lounge_board_game, boardWeek: g.lounge_board_week,
      });
    }
  }
  return { servers, ownerPro };
}

export async function syncDiscord(rankUps: RankUp[]): Promise<{ posts: number; roleChanges: number; boards: number }> {
  const db = createServiceClient();
  const { servers, ownerPro } = await loungeServers();
  const week = gsWeekStart();
  const boardDay = gsWeekday(gsDay()) === 1; // Monday, Pacific
  const wantsRankUps = (g: LoungeServer) => g.rankUps && rankUps.length > 0;
  const wantsRoles = (g: LoungeServer) => !!g.rolesGame && !!ownerPro.get(g.ownerUserId);
  const wantsBoard = (g: LoungeServer) => !!g.boardGame && !!ownerPro.get(g.ownerUserId) && boardDay && g.boardWeek !== week;
  const work = servers.filter((g) => wantsRankUps(g) || wantsRoles(g) || wantsBoard(g));
  if (!work.length) return { posts: 0, roleChanges: 0, boards: 0 };

  // Every confirmed player with a Discord account, by Discord id.
  const { data: linkRows } = await db.from("lounge_links").select("user_id, game, name, mmr, division, world_rank");
  const links = (linkRows ?? []) as Array<{ user_id: string; game: MmrGame; name: string; mmr: number | null; division: string | null; world_rank: number | null }>;
  const userIds = [...new Set(links.map((l) => l.user_id))];
  const { data: users } = userIds.length ? await db.from("users").select("id, discord_id").in("id", userIds) : { data: [] };
  const discordOf = new Map(((users ?? []) as { id: string; discord_id: string | null }[]).filter((u) => u.discord_id).map((u) => [u.id, u.discord_id!]));

  let posts = 0, roleChanges = 0, boards = 0;
  for (const g of work) {
    // Each server through its own bot's token.
    await withDiscordApp(g.app, async () => {
      const members = await listGuildMembers(g.guildId);
      if (!members.ok) return;
      const roster = new Map(members.members.filter((m) => !m.bot).map((m) => [m.userId, m.roles ?? []]));
      const channel = g.channel;

      if (wantsRankUps(g) && channel) {
        for (const r of rankUps) {
          const d = discordOf.get(r.userId);
          if (!d || !roster.has(d)) continue;
          const res = await postComponentsMessage({ channelId: channel, ...rankUpMessage(r) });
          if (res.ok) posts++;
        }
      }

      if (wantsRoles(g)) {
        const game = g.rolesGame!;
        const roles = await ensureRoles(g, game);
        if (roles) {
          const ours = new Set(Object.values(roles));
          const divisionOf = new Map(links.filter((l) => l.game === game).map((l) => [discordOf.get(l.user_id), l.division]));
          for (const [memberId, has] of roster) {
            const division = divisionOf.get(memberId);
            const want = division && division !== "Placement" ? roles[splitDivision(division).base] ?? null : null;
            for (const roleId of has) {
              if (ours.has(roleId) && roleId !== want) { if ((await removeGuildMemberRole(g.guildId, memberId, roleId)).ok) roleChanges++; }
            }
            if (want && !has.includes(want)) { if ((await addGuildMemberRole(g.guildId, memberId, want)).ok) roleChanges++; }
          }
        }
      }

      if (wantsBoard(g) && channel) {
        const game = g.boardGame!;
        const rows = links
          .filter((l) => l.game === game && l.mmr != null && roster.has(discordOf.get(l.user_id) ?? ""))
          .sort((a, b) => (b.mmr ?? 0) - (a.mmr ?? 0))
          .slice(0, 15);
        if (rows.length) {
          const res = await postComponentsMessage({
            channelId: channel,
            embeds: [{
              title: `${g.name ?? "This server"}'s lounge board`,
              description: rows.map((l, i) => `**${i + 1}.** ${l.name} · ${l.division ?? "Placement"} · ${fmtMmr(l.mmr ?? 0)}`).join("\n"),
              color: 0x2b52d6,
              footer: { text: `${MMR_GAMES[game].short} · members who confirmed their lounge name on GameShuffle` },
            }],
            components: linkButton("Lounge stats", `${SITE}/lounge`),
          });
          if (res.ok) boards++;
        }
        // Claimed for the week even when nobody's on it, so it doesn't retry every 15 minutes.
        await saveLounge(g, { boardWeek: week });
      }
    });
  }
  return { posts, roleChanges, boards };
}

export async function runLoungeSync(): Promise<Record<string, number>> {
  const { checked, rankUps, failed } = await refreshLinks();
  const discord = await syncDiscord(rankUps);
  return { checked, failed, rankUps: rankUps.length, ...discord };
}
