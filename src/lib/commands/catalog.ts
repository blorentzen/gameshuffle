/**
 * Every chat command for one channel, in one list: the built-ins (registry +
 * guide), the ready-made replies (gs_default_commands + this channel's
 * overrides), the streamer's own commands (gs_custom_commands) and the
 * events people type (`!hug @name`). Each says what it does, how to type
 * it, who can use it, whether it's switched on, and whether it can work on
 * this stream (just in time: Mario Kart race commands need a Mario Kart
 * game, party commands a party night). Used by Streaming ▸ Chat ▸ Commands
 * (owner view) and the public /c/<slug>/commands page (viewer view).
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { listCommandReference } from "@/lib/twitch/commands/reference";
import { guideFor, NEED_LABELS, REPLY_SUMMARIES, type CommandGroup, type CommandNeed } from "@/lib/twitch/commands/guide";
import { offCommands } from "@/lib/twitch/commands/toggles";
import { isModuleEnabled, listCatalog, type ModuleKey } from "@/lib/economy/modules/registry";
import { getChatGame } from "@/lib/twitch/chatGames";
import { PARTY_GAMES } from "@/data/party";
import { getGameName } from "@/data/game-registry";

export type CommandKind = "builtin" | "reply" | "custom" | "event";
export type CommandWho = "everyone" | "mods" | "you";

export interface CatalogCommand {
  /** Unique across kinds: "builtin:gs.shuffle", "reply:<id>", "custom:<id>", "event:<id>". */
  key: string;
  kind: CommandKind;
  /** Registry name for built-ins, the row id otherwise. */
  id: string;
  /** The first way to type it ("!gs shuffle [role]"). */
  typed: string;
  /** Every form, as the help writes it. */
  usage: string;
  summary: string;
  detail: string | null;
  who: CommandWho;
  group: CommandGroup;
  /** What it needs that this stream doesn't have (plain words); empty = works. */
  missing: string[];
  works: boolean;
  on: boolean;
  /** Why the switch can't change it here (its module group is off). */
  lockedBy: string | null;
  /** Why it never answers even when on (another command takes its trigger first). */
  shadowedBy: string | null;
  example: [string, string] | null;
  /** Replies: the text the bot sends now, ours, and (pool replies like
   *  !quote) how many answers it picks from. */
  reply?: { text: string; ours: string | null; custom: boolean; pool: { platform: number; community: number } | null };
  /** Your commands: the editable fields. */
  custom?: { trigger: string; response: string; actor: "everyone" | "crew" | "host"; cooldown: number };
}

export interface StreamSetup {
  /** Game names from the streamer's recent and upcoming streams. */
  games: string[];
  has: Record<CommandNeed, boolean>;
}

const WHO_FROM_AUTHORITY: Record<string, CommandWho> = { viewer: "everyone", vip: "everyone", mod: "mods", host: "you" };

/** What this streamer's streams can do: games played in the last 60 days or
 *  coming up, a live tournament, a wheel, party nights. */
export async function streamSetup(ownerUserId: string): Promise<StreamSetup> {
  const admin = createServiceClient();
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const [sessions, wheels, nights, tourney] = await Promise.all([
    admin.from("gs_sessions").select("configured_games, active_game, status, ended_at")
      .eq("owner_user_id", ownerUserId)
      .or(`status.in.(draft,scheduled,ready,active,ending),ended_at.gte.${since}`)
      .limit(100),
    admin.from("gs_wheels").select("id", { count: "exact", head: true }).eq("owner_user_id", ownerUserId),
    admin.from("party_nights").select("id", { count: "exact", head: true }).eq("host_user_id", ownerUserId),
    admin.from("tournaments").select("id", { count: "exact", head: true }).eq("organizer_id", ownerUserId).in("status", ["open", "in_progress"]),
  ]);
  const slugs = new Set<string>();
  for (const s of sessions.data ?? []) {
    for (const g of (s.configured_games as string[] | null) ?? []) slugs.add(g);
    if (s.active_game) slugs.add(s.active_game as string);
  }
  const list = [...slugs];
  const partyGame = list.some((g) => Object.values(PARTY_GAMES).some((p) => p.slug === g));
  return {
    games: list.map((g) => getGameName(g)),
    has: {
      "mario-kart": list.some((g) => g === "mario-kart-8-deluxe" || g === "mario-kart-world"),
      "mario-kart-world": list.includes("mario-kart-world"),
      "rollable-game": list.some((g) => !!getChatGame(g)),
      "party-night": partyGame || (nights.count ?? 0) > 0,
      tournament: (tourney.count ?? 0) > 0,
      wheel: (wheels.count ?? 0) > 0,
    },
  };
}

/** Help text without the role notes the Who column already says
 *  ("(host)", "(mods + host)"), the trailing "GS Pro." and "MKWorld". */
function plainHelp(text: string): string {
  return text
    .replace(/\s*\((?:host|mods \+ host|mods and host)\)/gi, "")
    .replace(/\((?:host|mods \+ host), ([^)]+)\)/gi, "($1)")
    .replace(/\bMKWorld\b/g, "Mario Kart World")
    .replace(/\s+GS Pro\.?\s*$/, "")
    .replace(/\s+([.,])/g, "$1")
    .trim();
}

function firstForm(usage: string): string {
  return usage.split(/\s+·\s+/)[0].replace(/^mods:\s*/, "").trim();
}

export async function commandCatalog(ownerUserId: string, communityId: string | null): Promise<{ setup: StreamSetup; commands: CatalogCommand[] }> {
  const admin = createServiceClient();
  const setup = await streamSetup(ownerUserId);
  const [off, modules] = await Promise.all([
    communityId ? offCommands(communityId) : Promise.resolve(new Set<string>()),
    listCatalog().catch(() => []),
  ]);
  const moduleName = new Map(modules.map((m) => [m.module_key as string, m.display_name]));
  const moduleOn = new Map<string, boolean>();
  if (communityId) {
    await Promise.all(modules.map(async (m) => moduleOn.set(m.module_key, await isModuleEnabled(communityId, m.module_key as ModuleKey).catch(() => true))));
  }

  const commands: CatalogCommand[] = [];
  const builtinTriggers = new Set<string>();

  for (const r of listCommandReference()) {
    const guide = guideFor(r.name, r.family);
    const missing = (guide.needs ?? []).filter((n) => !setup.has[n]).map((n) => NEED_LABELS[n]);
    const moduleOff = r.moduleKey && moduleOn.get(r.moduleKey) === false;
    builtinTriggers.add(r.trigger.replace(/^!/, "").split(" ")[0]);
    for (const a of r.aliases) builtinTriggers.add(a.replace(/^!/, "").split(" ")[0]);
    commands.push({
      key: `builtin:${r.name}`,
      kind: "builtin",
      id: r.name,
      typed: firstForm(r.usage),
      usage: r.usage,
      summary: plainHelp(r.summary),
      detail: r.detail ? plainHelp(r.detail) || null : null,
      who: WHO_FROM_AUTHORITY[r.authority] ?? "everyone",
      group: guide.group,
      missing,
      works: missing.length === 0,
      on: !off.has(r.name) && !moduleOff,
      lockedBy: moduleOff ? `${moduleName.get(r.moduleKey!) ?? "Its group"} is off in Modules` : null,
      shadowedBy: null,
      example: guide.example ?? null,
    });
  }

  if (communityId) {
    const [defaults, overrides, custom, events, eventOverrides, pools] = await Promise.all([
      admin.from("gs_default_commands").select("id, trigger, response_template, handler, description, default_enabled, min_authority").eq("enabled", true).order("trigger"),
      admin.from("gs_default_command_overrides").select("command_id, enabled, custom_response").eq("community_id", communityId),
      admin.from("gs_custom_commands").select("id, trigger, response_tmpl, actor, cooldown_s, enabled").eq("community_id", communityId).order("trigger"),
      admin.from("gs_events").select("id, event_key, partner_mode, enabled, trigger_directly, min_authority, flavor_tmpl, surface").eq("enabled", true).order("event_key"),
      admin.from("gs_event_overrides").select("event_id, enabled, trigger_directly_override").eq("community_id", communityId),
      admin.from("gs_default_command_responses").select("command_id, community_id").or(`community_id.is.null,community_id.eq.${communityId}`),
    ]);
    const poolCount = new Map<string, { platform: number; community: number }>();
    for (const r of pools.data ?? []) {
      const c = poolCount.get(r.command_id as string) ?? { platform: 0, community: 0 };
      if (r.community_id) c.community++; else c.platform++;
      poolCount.set(r.command_id as string, c);
    }

    // The dispatcher's order: built-ins, then your own commands (one per
    // trigger, the last row loaded wins), then replies. Anything a command
    // earlier in that order takes never answers.
    const customRows = custom.data ?? [];
    const customWinner = new Map<string, string>();
    for (const c of customRows) customWinner.set(String(c.trigger).replace(/^!/, "").toLowerCase(), c.id as string);

    const ov = new Map((overrides.data ?? []).map((o) => [o.command_id as string, o]));
    for (const d of defaults.data ?? []) {
      const trigger = String(d.trigger);
      if (builtinTriggers.has(trigger)) continue; // a built-in answers this first
      const o = ov.get(d.id as string);
      const on = o ? !!o.enabled : !!d.default_enabled;
      const ours = (d.response_template as string | null) ?? null;
      commands.push({
        key: `reply:${d.id}`,
        kind: "reply",
        id: d.id as string,
        typed: `!${trigger}`,
        usage: `!${trigger}`,
        summary: REPLY_SUMMARIES[trigger] ?? ((d.description as string) || "A ready-made reply."),
        detail: null,
        who: WHO_FROM_AUTHORITY[(d.min_authority as string) ?? "viewer"] ?? "everyone",
        group: "replies",
        missing: [],
        works: true,
        on,
        lockedBy: null,
        shadowedBy: customWinner.has(trigger.toLowerCase()) ? `Your own !${trigger} answers instead` : null,
        example: null,
        reply: {
          text: (o?.custom_response as string | null) || ours || (d.handler ? "(worked out each time)" : ""),
          ours,
          custom: !!o?.custom_response,
          pool: (poolCount.get(d.id as string)?.platform ?? 0) > 0 ? poolCount.get(d.id as string)! : null,
        },
      });
    }

    for (const c of customRows) {
      const trigger = String(c.trigger).replace(/^!/, "");
      const lower = trigger.toLowerCase();
      commands.push({
        key: `custom:${c.id}`,
        kind: "custom",
        id: c.id as string,
        typed: `!${trigger}`,
        usage: `!${trigger}`,
        // Variables read as "…" here; the row's details show the real text.
        summary: String(c.response_tmpl).replace(/\$\w+|\{\w+\}/g, "…").slice(0, 120),
        detail: null,
        who: c.actor === "host" ? "you" : c.actor === "crew" ? "mods" : "everyone",
        group: "custom",
        missing: [],
        works: true,
        on: !!c.enabled,
        lockedBy: null,
        shadowedBy: builtinTriggers.has(lower)
          ? `GameShuffle's own !${trigger} answers first`
          : customWinner.get(lower) !== c.id ? `Your other !${trigger} answers instead` : null,
        example: null,
        custom: { trigger: `!${trigger}`, response: String(c.response_tmpl), actor: (c.actor as "everyone" | "crew" | "host") ?? "everyone", cooldown: Number(c.cooldown_s ?? 5) },
      });
    }

    // Events people type: the mention ones (`!hug @name`) and any set to fire directly.
    const eo = new Map((eventOverrides.data ?? []).map((o) => [o.event_id as string, o]));
    for (const e of events.data ?? []) {
      const o = eo.get(e.id as string);
      const direct = (o?.trigger_directly_override as boolean | null) ?? !!e.trigger_directly;
      if (e.partner_mode !== "mention" && !direct) continue;
      const key = String(e.event_key);
      const mention = e.partner_mode === "mention";
      commands.push({
        key: `event:${e.id}`,
        kind: "event",
        id: e.id as string,
        typed: `!${key}${mention ? " @name" : ""}`,
        usage: `!${key}${mention ? " @name" : ""}`,
        summary: String(e.flavor_tmpl).replace(/\{from\}|\{user\}/g, "you").replace(/\{to\}/g, "them").replace(/\{[a-z_]+\}/g, "…").replace(/^\W+\s*/, ""),
        detail: null,
        who: WHO_FROM_AUTHORITY[(e.min_authority as string) ?? "viewer"] ?? "everyone",
        group: "fun",
        missing: [],
        works: true,
        on: o ? !!o.enabled : true,
        lockedBy: null,
        shadowedBy: null,
        example: null,
      });
    }
  }

  return { setup, commands };
}
