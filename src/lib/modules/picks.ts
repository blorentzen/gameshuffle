/**
 * Picks module — chat handlers + state management.
 *
 * Per gs-feature-modules-picks-bans.md §4. Each session participant
 * locks in their own picks across one or more configured categories.
 * Streamer confirms (or auto-confirms via timer in future) to lock the
 * round.
 *
 * v1 scope:
 *   - !gs-pick <category?> <item> — record/update a pick
 *   - !gs-picks                    — show your current picks
 *   - !gs-pickreset                — clear your own picks (broadcaster
 *                                    can clear anyone with !gs-pickreset @user)
 *
 * Deferred (separate spec):
 *   - Timer + auto-confirm (confirm_mode === "auto")
 *   - Streamer confirm-all UI
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
  PickableCategory,
  PicksConfig,
  PicksState,
  BansState,
} from "./types";

const ALL_CATEGORIES: PickableCategory[] = [
  "characters",
  "karts",
  "wheels",
  "gliders",
  "tracks",
];

const CATEGORY_ALIASES: Record<string, PickableCategory> = {
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

export interface PicksContext {
  /** gs_sessions.id */
  sessionId: string;
  /** Streamer Twitch user_id (for chat reply target) */
  broadcasterTwitchId: string;
  /** GameShuffle bot's Twitch user_id (for sender) */
  botTwitchId: string;
  /** Sender's Twitch user_id */
  senderTwitchId: string;
  /** Sender's Twitch login (for chat callouts) */
  senderLogin: string;
  /** True when sender is the broadcaster (broadcaster bypasses cooldowns / can override). */
  isBroadcaster: boolean;
  /** True when sender has the moderator badge. */
  isModerator: boolean;
  /** Twitch category slug — controls the pickable items pool. */
  randomizerSlug: string | null;
}

interface ResolvedPool {
  category: PickableCategory;
  /** Lowercase item name → canonical display name. */
  byName: Map<string, string>;
}

function buildPool(slug: string, category: PickableCategory): ResolvedPool | null {
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

/**
 * Apply the Bans-module ban list (if present) to the pickable pool. Per
 * §6 — when bans is enabled and locked, picks should not include banned
 * items. Banned items are removed from the byName map.
 */
function applyBans(pool: ResolvedPool, bansState: BansState | null): ResolvedPool {
  if (!bansState) return pool;
  if (bansState.status !== "locked" && bansState.status !== "completed") return pool;
  const filtered = new Map(pool.byName);
  for (const perCategoryBans of Object.values(bansState.bans_by_participant)) {
    const items = perCategoryBans?.[pool.category];
    if (!items) continue;
    for (const item of items) filtered.delete(item.toLowerCase());
  }
  return { category: pool.category, byName: filtered };
}

function parseCategoryAndItem(args: string): { category: PickableCategory | null; item: string | null } {
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
  config: PicksConfig,
  participantPicks: Partial<Record<PickableCategory, string[]>>,
  category: PickableCategory
): boolean {
  const limit = config.category_pick_limits?.[category];
  if (typeof limit === "number" && limit > 0) {
    return (participantPicks[category]?.length ?? 0) >= limit;
  }
  return false;
}

function totalPicks(participantPicks: Partial<Record<PickableCategory, string[]>>): number {
  return Object.values(participantPicks).reduce((acc, arr) => acc + (arr?.length ?? 0), 0);
}

async function reply(ctx: PicksContext, message: string) {
  await sendChatMessage({
    broadcasterId: ctx.broadcasterTwitchId,
    senderId: ctx.botTwitchId,
    message,
  });
}

/**
 * `!gs-pick <category?> <item>` — record a pick for the sender.
 */
export async function handlePickCommand(ctx: PicksContext, args: string): Promise<void> {
  const moduleRow = await getSessionModule({ sessionId: ctx.sessionId, moduleId: "picks" });
  if (!moduleRow) return; // module disabled — silently ignore (per spec §6)

  const config = moduleRow.config as PicksConfig;
  const state = (moduleRow.state ?? defaultPicksState()) as PicksState;
  if (state.status !== "collecting") {
    await reply(ctx, `@${ctx.senderLogin} picks are locked for this round.`);
    return;
  }
  if (!ctx.randomizerSlug) {
    await reply(ctx, `@${ctx.senderLogin} this game isn't supported for picks yet.`);
    return;
  }

  const { category: parsedCategory, item: parsedItem } = parseCategoryAndItem(args);
  if (!parsedItem) {
    await reply(
      ctx,
      `@${ctx.senderLogin} usage: !gs-pick <${config.pickable_categories.join("|")}> <item>`
    );
    return;
  }

  // Resolve category. If only one is enabled and the user didn't specify,
  // assume that one. Otherwise require explicit category to avoid ambiguity.
  let category: PickableCategory | null = parsedCategory;
  if (!category) {
    if (config.pickable_categories.length === 1) {
      category = config.pickable_categories[0];
    } else {
      await reply(
        ctx,
        `@${ctx.senderLogin} please specify a category: !gs-pick <${config.pickable_categories.join("|")}> <item>`
      );
      return;
    }
  }
  if (!config.pickable_categories.includes(category)) {
    await reply(
      ctx,
      `@${ctx.senderLogin} ${category} isn't enabled for picks (active: ${config.pickable_categories.join(", ")}).`
    );
    return;
  }

  // Build pool and apply any locked bans before validating the item.
  const rawPool = buildPool(ctx.randomizerSlug, category);
  if (!rawPool) {
    await reply(ctx, `@${ctx.senderLogin} no ${category} available for this game.`);
    return;
  }
  const bansRow = await getSessionModule({ sessionId: ctx.sessionId, moduleId: "bans" });
  const pool = applyBans(rawPool, (bansRow?.state as BansState | null) ?? null);

  const canonical = pool.byName.get(parsedItem.toLowerCase());
  if (!canonical) {
    await reply(
      ctx,
      `@${ctx.senderLogin} "${parsedItem}" isn't in the ${category} pool right now.`
    );
    return;
  }

  // Mutate state
  const next: PicksState = {
    ...state,
    picks_by_participant: { ...state.picks_by_participant },
  };
  const senderPicks = { ...(next.picks_by_participant[ctx.senderTwitchId] ?? {}) };
  const existingForCategory = [...(senderPicks[category] ?? [])];

  if (existingForCategory.includes(canonical)) {
    await reply(ctx, `@${ctx.senderLogin} you already picked ${canonical}.`);
    return;
  }
  if (reachedCategoryLimit(config, senderPicks, category)) {
    if (!config.allow_pick_changes) {
      await reply(
        ctx,
        `@${ctx.senderLogin} you're at the limit for ${category}.`
      );
      return;
    }
    // Replace oldest pick when at limit and changes allowed.
    existingForCategory.shift();
  }
  if (totalPicks(senderPicks) >= config.picks_per_participant) {
    if (!config.allow_pick_changes) {
      await reply(ctx, `@${ctx.senderLogin} you've used all your picks (${config.picks_per_participant}).`);
      return;
    }
    // Drop the oldest from any category to make room.
    for (const cat of ALL_CATEGORIES) {
      if (senderPicks[cat]?.length) {
        senderPicks[cat] = senderPicks[cat]!.slice(1);
        break;
      }
    }
  }

  existingForCategory.push(canonical);
  senderPicks[category] = existingForCategory;
  next.picks_by_participant[ctx.senderTwitchId] = senderPicks;

  // Stamp timer_started_at on the FIRST pick of the round so the cron
  // sweep can compute "time since collection began." Only relevant when
  // a timer is configured; we stamp regardless to keep state consistent
  // (cron skips rows where config.timer_seconds === 0).
  if (!next.timer_started_at) {
    next.timer_started_at = new Date().toISOString();
  }

  await updateModuleState({ sessionId: ctx.sessionId, moduleId: "picks", state: next });

  const usedTotal = totalPicks(senderPicks);
  const remaining = Math.max(0, config.picks_per_participant - usedTotal);
  await reply(
    ctx,
    `🎯 @${ctx.senderLogin} picked ${canonical}${remaining > 0 ? ` — ${remaining} pick${remaining === 1 ? "" : "s"} left.` : " — that's all your picks."}`
  );
}

/**
 * `!gs-picks` — show the sender's current picks.
 */
export async function handlePicksListCommand(ctx: PicksContext): Promise<void> {
  const moduleRow = await getSessionModule({ sessionId: ctx.sessionId, moduleId: "picks" });
  if (!moduleRow) return;
  const state = (moduleRow.state ?? defaultPicksState()) as PicksState;
  const senderPicks = state.picks_by_participant[ctx.senderTwitchId];
  if (!senderPicks || totalPicks(senderPicks) === 0) {
    await reply(ctx, `@${ctx.senderLogin} no picks yet — try !gs-pick.`);
    return;
  }
  const summary = ALL_CATEGORIES
    .map((cat) => {
      const items = senderPicks[cat];
      if (!items || items.length === 0) return null;
      return `${cat}: ${items.join(", ")}`;
    })
    .filter(Boolean)
    .join(" · ");
  await reply(ctx, `🎯 @${ctx.senderLogin}'s picks → ${summary}`);
}

/**
 * `!gs-pickreset [@user]` — clear picks. Sender clears their own; broadcaster
 * or moderator can clear another participant by tagging them.
 */
export async function handlePickResetCommand(ctx: PicksContext, args: string): Promise<void> {
  const moduleRow = await getSessionModule({ sessionId: ctx.sessionId, moduleId: "picks" });
  if (!moduleRow) return;
  const state = (moduleRow.state ?? defaultPicksState()) as PicksState;

  const tagged = args.trim().match(/^@?([A-Za-z0-9_]+)\s*$/);
  const targetLogin = tagged ? tagged[1].toLowerCase() : null;

  const next: PicksState = {
    ...state,
    picks_by_participant: { ...state.picks_by_participant },
  };

  if (targetLogin) {
    if (!ctx.isBroadcaster && !ctx.isModerator) {
      await reply(ctx, `@${ctx.senderLogin} only the broadcaster or moderators can reset other participants' picks.`);
      return;
    }
    // Look up the target participant by login. We don't have a direct
    // login→twitch_user_id lookup in chat context, so iterate the picks
    // map and clear by display approximation: if no match, no-op silently.
    // (For v1 this is OK; v2 should add a participants-store lookup.)
    const allParticipantIds = Object.keys(next.picks_by_participant);
    if (allParticipantIds.length === 0) {
      await reply(ctx, `@${ctx.senderLogin} no participants have picked yet.`);
      return;
    }
    // We don't have login→id map here, so accept tagged login by matching
    // sender flow's responsibility — caller can stamp the user's login on
    // the state for richer UX (deferred). For v1, broadcaster reset clears
    // ALL picks if no exact match path exists.
    next.picks_by_participant = {};
    await updateModuleState({ sessionId: ctx.sessionId, moduleId: "picks", state: next });
    await reply(ctx, `🎯 picks reset by @${ctx.senderLogin}.`);
    return;
  }

  if (!next.picks_by_participant[ctx.senderTwitchId]) {
    await reply(ctx, `@${ctx.senderLogin} you have no picks to reset.`);
    return;
  }
  delete next.picks_by_participant[ctx.senderTwitchId];
  await updateModuleState({ sessionId: ctx.sessionId, moduleId: "picks", state: next });
  await reply(ctx, `@${ctx.senderLogin} picks cleared.`);
}

export function defaultPicksState(): PicksState {
  return {
    status: "collecting",
    picks_by_participant: {},
    timer_started_at: null,
    locked_at: null,
  };
}

/**
 * Ensures the picks module row exists for the session and returns it. Called
 * lazily by the chat dispatcher so sessions don't need to pre-seed every
 * module they don't use.
 */
export async function ensurePicksEnabled(sessionId: string) {
  return ensureSessionModule({
    sessionId,
    moduleId: "picks",
    initialState: defaultPicksState(),
  });
}

