/**
 * Bans module — chat handlers + state management.
 *
 * Per gs-feature-modules-picks-bans.md §5. Mechanically a mirror of Picks
 * but inverted: participants ban items from the available pool. When the
 * Bans module is enabled and locked, the Picks module reads the ban list
 * and filters its pool accordingly (§6 — hardcoded coordination for v1).
 *
 * v1 scope:
 *   - !gs-ban <category?> <item> — record/update a ban
 *   - !gs-bans                   — show your current bans
 *   - !gs-banreset               — clear your own bans (broadcaster /
 *                                  moderator can clear all bans by
 *                                  tagging anyone)
 *
 * Deferred (separate spec):
 *   - Timer + auto-confirm
 *   - Streamer "lock bans" UI control (today: bans lock when broadcaster
 *     manually transitions state via DB or future UI)
 *   - Overlay rendering
 */

import "server-only";
import { sendChatMessage } from "@/lib/twitch/client";
import { getTwitchGame } from "@/lib/twitch/games";
import type { GameData } from "@/data/types";
import {
  ensureSessionModule,
  getSessionModule,
  updateModuleState,
} from "./store";
import type {
  BannableCategory,
  BansConfig,
  BansState,
} from "./types";

const ALL_CATEGORIES: BannableCategory[] = [
  "characters",
  "karts",
  "wheels",
  "gliders",
  "tracks",
];

const CATEGORY_ALIASES: Record<string, BannableCategory> = {
  character: "characters",
  characters: "characters",
  c: "characters",
  kart: "karts",
  karts: "karts",
  vehicle: "karts",
  vehicles: "karts",
  k: "karts",
  wheel: "wheels",
  wheels: "wheels",
  w: "wheels",
  glider: "gliders",
  gliders: "gliders",
  g: "gliders",
  track: "tracks",
  tracks: "tracks",
  course: "tracks",
  courses: "tracks",
  t: "tracks",
};

export interface BansContext {
  sessionId: string;
  broadcasterTwitchId: string;
  botTwitchId: string;
  senderTwitchId: string;
  senderLogin: string;
  isBroadcaster: boolean;
  isModerator: boolean;
  randomizerSlug: string | null;
}

interface ResolvedPool {
  category: BannableCategory;
  byName: Map<string, string>;
}

function buildPool(slug: string, category: BannableCategory): ResolvedPool | null {
  const game = getTwitchGame(slug);
  if (!game) return null;
  const data = game.data as GameData;
  const byName = new Map<string, string>();
  switch (category) {
    case "characters":
      for (const c of data.characters ?? []) byName.set(c.name.toLowerCase(), c.name);
      break;
    case "karts":
      for (const v of data.vehicles ?? []) byName.set(v.name.toLowerCase(), v.name);
      break;
    case "wheels":
      for (const w of data.wheels ?? []) byName.set(w.name.toLowerCase(), w.name);
      break;
    case "gliders":
      for (const g of data.gliders ?? []) byName.set(g.name.toLowerCase(), g.name);
      break;
    case "tracks":
      for (const cup of data.cups ?? []) {
        for (const course of cup.courses ?? []) byName.set(course.name.toLowerCase(), course.name);
      }
      break;
  }
  return byName.size > 0 ? { category, byName } : null;
}

function parseCategoryAndItem(args: string): { category: BannableCategory | null; item: string | null } {
  const trimmed = args.trim();
  if (!trimmed) return { category: null, item: null };
  const parts = trimmed.split(/\s+/);
  const maybeCategory = parts[0]?.toLowerCase();
  const aliased = maybeCategory ? CATEGORY_ALIASES[maybeCategory] : undefined;
  if (aliased) {
    const item = parts.slice(1).join(" ").trim();
    return { category: aliased, item: item || null };
  }
  return { category: null, item: trimmed };
}

function reachedCategoryLimit(
  config: BansConfig,
  participantBans: Partial<Record<BannableCategory, string[]>>,
  category: BannableCategory
): boolean {
  const limit = config.category_ban_limits?.[category];
  if (typeof limit === "number" && limit > 0) {
    return (participantBans[category]?.length ?? 0) >= limit;
  }
  return false;
}

function totalBans(participantBans: Partial<Record<BannableCategory, string[]>>): number {
  return Object.values(participantBans).reduce((acc, arr) => acc + (arr?.length ?? 0), 0);
}

async function reply(ctx: BansContext, message: string) {
  await sendChatMessage({
    broadcasterId: ctx.broadcasterTwitchId,
    senderId: ctx.botTwitchId,
    message,
  });
}

/**
 * `!gs-ban <category?> <item>` — record a ban for the sender.
 */
export async function handleBanCommand(ctx: BansContext, args: string): Promise<void> {
  const moduleRow = await getSessionModule({ sessionId: ctx.sessionId, moduleId: "bans" });
  if (!moduleRow) return;

  const config = moduleRow.config as BansConfig;
  const state = (moduleRow.state ?? defaultBansState()) as BansState;
  if (state.status !== "collecting") {
    await reply(ctx, `@${ctx.senderLogin} bans are locked for this round.`);
    return;
  }
  if (!ctx.randomizerSlug) {
    await reply(ctx, `@${ctx.senderLogin} this game isn't supported for bans yet.`);
    return;
  }

  const { category: parsedCategory, item: parsedItem } = parseCategoryAndItem(args);
  if (!parsedItem) {
    await reply(
      ctx,
      `@${ctx.senderLogin} usage: !gs-ban <${config.bannable_categories.join("|")}> <item>`
    );
    return;
  }

  let category: BannableCategory | null = parsedCategory;
  if (!category) {
    if (config.bannable_categories.length === 1) {
      category = config.bannable_categories[0];
    } else {
      await reply(
        ctx,
        `@${ctx.senderLogin} please specify a category: !gs-ban <${config.bannable_categories.join("|")}> <item>`
      );
      return;
    }
  }
  if (!config.bannable_categories.includes(category)) {
    await reply(
      ctx,
      `@${ctx.senderLogin} ${category} isn't enabled for bans (active: ${config.bannable_categories.join(", ")}).`
    );
    return;
  }

  const pool = buildPool(ctx.randomizerSlug, category);
  if (!pool) {
    await reply(ctx, `@${ctx.senderLogin} no ${category} available for this game.`);
    return;
  }

  const canonical = pool.byName.get(parsedItem.toLowerCase());
  if (!canonical) {
    await reply(
      ctx,
      `@${ctx.senderLogin} "${parsedItem}" isn't in the ${category} pool.`
    );
    return;
  }

  const next: BansState = {
    ...state,
    bans_by_participant: { ...state.bans_by_participant },
  };
  const senderBans = { ...(next.bans_by_participant[ctx.senderTwitchId] ?? {}) };
  const existingForCategory = [...(senderBans[category] ?? [])];

  if (existingForCategory.includes(canonical)) {
    await reply(ctx, `@${ctx.senderLogin} you already banned ${canonical}.`);
    return;
  }
  if (reachedCategoryLimit(config, senderBans, category)) {
    if (!config.allow_ban_changes) {
      await reply(ctx, `@${ctx.senderLogin} you're at the limit for ${category} bans.`);
      return;
    }
    existingForCategory.shift();
  }
  if (totalBans(senderBans) >= config.bans_per_participant) {
    if (!config.allow_ban_changes) {
      await reply(ctx, `@${ctx.senderLogin} you've used all your bans (${config.bans_per_participant}).`);
      return;
    }
    for (const cat of ALL_CATEGORIES) {
      if (senderBans[cat]?.length) {
        senderBans[cat] = senderBans[cat]!.slice(1);
        break;
      }
    }
  }

  existingForCategory.push(canonical);
  senderBans[category] = existingForCategory;
  next.bans_by_participant[ctx.senderTwitchId] = senderBans;

  // Stamp timer_started_at on the FIRST ban of the round so the cron
  // sweep can compute elapsed collection time.
  if (!next.timer_started_at) {
    next.timer_started_at = new Date().toISOString();
  }

  await updateModuleState({ sessionId: ctx.sessionId, moduleId: "bans", state: next });

  const usedTotal = totalBans(senderBans);
  const remaining = Math.max(0, config.bans_per_participant - usedTotal);
  await reply(
    ctx,
    `🚫 @${ctx.senderLogin} banned ${canonical}${remaining > 0 ? ` — ${remaining} ban${remaining === 1 ? "" : "s"} left.` : " — that's all your bans."}`
  );
}

/**
 * `!gs-bans` — show the sender's current bans.
 */
export async function handleBansListCommand(ctx: BansContext): Promise<void> {
  const moduleRow = await getSessionModule({ sessionId: ctx.sessionId, moduleId: "bans" });
  if (!moduleRow) return;
  const state = (moduleRow.state ?? defaultBansState()) as BansState;
  const senderBans = state.bans_by_participant[ctx.senderTwitchId];
  if (!senderBans || totalBans(senderBans) === 0) {
    await reply(ctx, `@${ctx.senderLogin} no bans yet — try !gs-ban.`);
    return;
  }
  const summary = ALL_CATEGORIES
    .map((cat) => {
      const items = senderBans[cat];
      if (!items || items.length === 0) return null;
      return `${cat}: ${items.join(", ")}`;
    })
    .filter(Boolean)
    .join(" · ");
  await reply(ctx, `🚫 @${ctx.senderLogin}'s bans → ${summary}`);
}

/**
 * `!gs-banreset` — clear bans. Sender clears their own; broadcaster /
 * moderator can clear all bans by tagging anyone.
 */
export async function handleBanResetCommand(ctx: BansContext, args: string): Promise<void> {
  const moduleRow = await getSessionModule({ sessionId: ctx.sessionId, moduleId: "bans" });
  if (!moduleRow) return;
  const state = (moduleRow.state ?? defaultBansState()) as BansState;

  const tagged = args.trim().match(/^@?([A-Za-z0-9_]+)\s*$/);
  const targetLogin = tagged ? tagged[1].toLowerCase() : null;

  const next: BansState = {
    ...state,
    bans_by_participant: { ...state.bans_by_participant },
  };

  if (targetLogin) {
    if (!ctx.isBroadcaster && !ctx.isModerator) {
      await reply(ctx, `@${ctx.senderLogin} only the broadcaster or moderators can reset other participants' bans.`);
      return;
    }
    next.bans_by_participant = {};
    await updateModuleState({ sessionId: ctx.sessionId, moduleId: "bans", state: next });
    await reply(ctx, `🚫 bans reset by @${ctx.senderLogin}.`);
    return;
  }

  if (!next.bans_by_participant[ctx.senderTwitchId]) {
    await reply(ctx, `@${ctx.senderLogin} you have no bans to reset.`);
    return;
  }
  delete next.bans_by_participant[ctx.senderTwitchId];
  await updateModuleState({ sessionId: ctx.sessionId, moduleId: "bans", state: next });
  await reply(ctx, `@${ctx.senderLogin} bans cleared.`);
}

export function defaultBansState(): BansState {
  return {
    status: "collecting",
    bans_by_participant: {},
    timer_started_at: null,
    locked_at: null,
  };
}

export async function ensureBansEnabled(sessionId: string) {
  return ensureSessionModule({
    sessionId,
    moduleId: "bans",
    initialState: defaultBansState(),
  });
}
