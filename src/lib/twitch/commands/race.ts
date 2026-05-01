/**
 * `!gs-track` / `!gs-items` / `!gs-race` + the picks/bans / clear-bans
 * commands. Phase A spec §5.
 *
 * Authorization model: broadcaster-only. Mod-permission configuration is
 * Phase 5 work; the dispatcher gates these commands before invocation,
 * so the handlers themselves trust the caller is allowed.
 *
 * Idempotency: each handler reads the existing `race_randomizer` module
 * row, applies its config, writes the resulting choice, and emits a
 * single session_events row. Phase 4A.1's webhook composite dedupe
 * keeps duplicate notifications from invoking these twice.
 */

import { createTwitchAdminClient } from "@/lib/twitch/admin";
import { TwitchAdapter } from "@/lib/adapters/twitch";
import {
  findTwitchSessionForUser,
} from "@/lib/sessions/twitch-platform";
import {
  ensureSessionModule,
  getSessionModule,
  updateModuleConfig,
  updateModuleState,
} from "@/lib/modules/store";
import { recordEvent } from "@/lib/sessions/service";
import { SESSION_EVENT_TYPES } from "@/lib/sessions/event-types";
import type {
  RaceRandomizerConfig,
  RaceRandomizerState,
} from "@/lib/modules/types";
import {
  applyPicksBansToPool,
  getItemPresetById,
  getTrackById,
  listTracksForGame,
  randomizeItems,
  randomizeTrack,
  type ItemPreset,
  type RaceGame,
  type Track,
} from "@/lib/randomizers/race";
import { parseSeriesLength } from "@/lib/randomizers/race/series";

export interface RaceCommandContext {
  /** GameShuffle user_id of the broadcaster. */
  userId: string;
  broadcasterTwitchId: string;
  senderTwitchId: string;
  senderDisplayName: string;
  /** Used as fallback chat sender when no adapter session exists. */
  botTwitchId: string;
}

const DEFAULT_GAME: RaceGame = "mk8dx";

function isRaceGame(slug: string | null | undefined): slug is RaceGame {
  return slug === "mk8dx" || slug === "mkworld";
}

async function loadActiveSession(userId: string) {
  return findTwitchSessionForUser(userId, ["active", "test"]);
}

async function ensureModule(sessionId: string) {
  return ensureSessionModule({
    sessionId,
    moduleId: "race_randomizer",
  });
}

async function loadModuleConfig(
  sessionId: string
): Promise<RaceRandomizerConfig | null> {
  const row = await getSessionModule({
    sessionId,
    moduleId: "race_randomizer",
    includeDisabled: true,
  });
  if (!row) return null;
  return row.config as RaceRandomizerConfig;
}

function gameForSession(slug: string | null | undefined): RaceGame {
  return isRaceGame(slug) ? slug : DEFAULT_GAME;
}

function trackLine(track: Track): string {
  return `🏁 Track: **${track.name}** (${track.cup} Cup)`;
}

function itemsLine(preset: ItemPreset): string {
  return `🎯 Items: **${preset.name}**`;
}

// ---------- !gs-track ------------------------------------------------------

export async function handleTrackCommand(
  ctx: RaceCommandContext
): Promise<void> {
  const session = await loadActiveSession(ctx.userId);
  if (!session) return;
  const adapter = new TwitchAdapter({
    sessionId: session.id,
    ownerUserId: ctx.userId,
  });

  await ensureModule(session.id);
  const config = await loadModuleConfig(session.id);
  if (!config || !config.enabled) {
    await adapter.postChatMessage(
      "🏁 Race randomizer isn't enabled. Streamer: enable it on the configure page."
    );
    return;
  }
  if (!config.tracks.enabled) {
    await adapter.postChatMessage(
      "🏁 Track randomization is off. Streamer: turn it on in the Race Randomizer config."
    );
    return;
  }

  const game = gameForSession(session.randomizer_slug);
  const track = randomizeTrack(game, config.tracks);
  if (!track) {
    await adapter.postChatMessage(
      "❌ No tracks available — picks/bans removed everything. Use !gs-clear-track-bans to reset."
    );
    return;
  }

  await adapter.postChatMessage(trackLine(track));
  await touchModuleState(session.id, { last_track_id: track.id });
  await recordEvent({
    sessionId: session.id,
    eventType: SESSION_EVENT_TYPES.track_randomized,
    actorType: "streamer",
    actorId: ctx.broadcasterTwitchId,
    payload: {
      track_id: track.id,
      track_name: track.name,
      cup: track.cup,
      game: track.game,
      trigger: "chat_command",
    },
  });
}

// ---------- !gs-items ------------------------------------------------------

export async function handleItemsCommand(
  ctx: RaceCommandContext
): Promise<void> {
  const session = await loadActiveSession(ctx.userId);
  if (!session) return;
  const adapter = new TwitchAdapter({
    sessionId: session.id,
    ownerUserId: ctx.userId,
  });

  await ensureModule(session.id);
  const config = await loadModuleConfig(session.id);
  if (!config || !config.enabled) {
    await adapter.postChatMessage(
      "🎯 Race randomizer isn't enabled. Streamer: enable it on the configure page."
    );
    return;
  }
  if (!config.items.enabled) {
    await adapter.postChatMessage(
      "🎯 Item randomization is off. Streamer: turn it on in the Race Randomizer config."
    );
    return;
  }

  const game = gameForSession(session.randomizer_slug);
  const preset = randomizeItems(game, config.items);
  if (!preset) {
    // MKWorld currently has no presets (out-of-scope for Phase A) and
    // MK8DX could end up empty after picks/bans removed everything.
    await adapter.postChatMessage(
      game === "mkworld"
        ? "🎯 Item presets aren't configured for MKWorld yet."
        : "❌ No item presets available — picks/bans removed everything. Use !gs-clear-item-bans to reset."
    );
    return;
  }

  await adapter.postChatMessage(itemsLine(preset));
  await touchModuleState(session.id, { last_item_preset_id: preset.id });
  await recordEvent({
    sessionId: session.id,
    eventType: SESSION_EVENT_TYPES.items_randomized,
    actorType: "streamer",
    actorId: ctx.broadcasterTwitchId,
    payload: {
      preset_id: preset.id,
      preset_name: preset.name,
      game: preset.game,
      trigger: "chat_command",
    },
  });
}

// ---------- !gs-race [N] ---------------------------------------------------

/**
 * Pick a single track from a pre-filtered pool. Used by series rolls to
 * dedupe across the series (already-rolled tracks are removed from the
 * candidates before picking). Items don't dedupe — see callsite.
 */
function pickRandomFrom<T>(pool: T[]): T | null {
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function handleRaceCommand(
  ctx: RaceCommandContext,
  args: string = ""
): Promise<void> {
  const session = await loadActiveSession(ctx.userId);
  if (!session) return;
  const adapter = new TwitchAdapter({
    sessionId: session.id,
    ownerUserId: ctx.userId,
  });

  await ensureModule(session.id);
  const config = await loadModuleConfig(session.id);
  if (!config || !config.enabled) {
    await adapter.postChatMessage(
      "🎲 Race randomizer isn't enabled. Streamer: enable it on the configure page."
    );
    return;
  }

  const total = parseSeriesLength(args);
  const game = gameForSession(session.randomizer_slug);

  // Build the track candidate pool ONCE, then dedupe across the series.
  // Items use the regular randomizer for each race because the pool is
  // tiny (3 MK8DX presets) — duplicates across a series are expected.
  const trackPoolFull = config.tracks.enabled
    ? applyPicksBansToPool(listTracksForGame(game), config.tracks)
    : [];
  const trackPool = [...trackPoolFull];

  // Single-race fast path mirrors the original behavior so legacy `!gs-race`
  // (no arg) is byte-for-byte the same chat output.
  if (total === 1) {
    const track = config.tracks.enabled ? pickRandomFrom(trackPool) : null;
    const preset = config.items.enabled ? randomizeItems(game, config.items) : null;
    if (!track && !preset) {
      await adapter.postChatMessage(
        "❌ Both pools are off (or empty). Streamer: enable tracks/items in the Race Randomizer config."
      );
      return;
    }
    const parts: string[] = [];
    if (track) parts.push(trackLine(track));
    if (preset) parts.push(itemsLine(preset));
    await adapter.postChatMessage(parts.join(" | "));

    await touchModuleState(session.id, {
      last_track_id: track?.id ?? null,
      last_item_preset_id: preset?.id ?? null,
    });
    await recordEvent({
      sessionId: session.id,
      eventType: SESSION_EVENT_TYPES.race_randomized,
      actorType: "streamer",
      actorId: ctx.broadcasterTwitchId,
      payload: {
        track_id: track?.id ?? null,
        track_name: track?.name ?? null,
        cup: track?.cup ?? null,
        preset_id: preset?.id ?? null,
        preset_name: preset?.name ?? null,
        game,
        trigger: "chat_command",
        series_index: 1,
        series_total: 1,
      },
    });
    return;
  }

  // Series path — N>1.
  if (!config.tracks.enabled && !config.items.enabled) {
    await adapter.postChatMessage(
      "❌ Both pools are off. Streamer: enable tracks/items in the Race Randomizer config."
    );
    return;
  }

  // Header so chat sees the series intent before the per-race lines roll in.
  await adapter.postChatMessage(`🎲 Race series — ${total} races`);

  let lastTrackId: string | null = null;
  let lastPresetId: string | null = null;
  let trackPoolExhaustedAt: number | null = null;

  for (let i = 0; i < total; i++) {
    const seriesIndex = i + 1;

    let track: Track | null = null;
    if (config.tracks.enabled) {
      if (trackPool.length === 0) {
        // Track pool exhausted by dedupe before the series finished.
        // Acknowledge once and continue rolling items only for the
        // remaining races so the streamer still gets useful output.
        if (trackPoolExhaustedAt === null) {
          trackPoolExhaustedAt = seriesIndex;
          await adapter.postChatMessage(
            `⚠️ Only ${trackPoolFull.length} unique track${trackPoolFull.length === 1 ? "" : "s"} available — remaining races skip the track roll.`
          );
        }
      } else {
        track = pickRandomFrom(trackPool);
        if (track) {
          // Remove from candidates so the next race in the series gets
          // a different track. (Dedupe within the series only — separate
          // !gs-race invocations start with a fresh pool.)
          const idx = trackPool.findIndex((t) => t.id === track!.id);
          if (idx >= 0) trackPool.splice(idx, 1);
        }
      }
    }

    const preset = config.items.enabled ? randomizeItems(game, config.items) : null;

    if (!track && !preset) {
      // Fully empty for this race; bot stays silent on this iteration.
      // The earlier exhaustion warning already explained why.
      continue;
    }

    const parts: string[] = [];
    if (track) parts.push(trackLine(track));
    if (preset) parts.push(itemsLine(preset));
    await adapter.postChatMessage(
      `Race ${seriesIndex}/${total}: ${parts.join(" | ")}`
    );

    if (track) lastTrackId = track.id;
    if (preset) lastPresetId = preset.id;

    await recordEvent({
      sessionId: session.id,
      eventType: SESSION_EVENT_TYPES.race_randomized,
      actorType: "streamer",
      actorId: ctx.broadcasterTwitchId,
      payload: {
        track_id: track?.id ?? null,
        track_name: track?.name ?? null,
        cup: track?.cup ?? null,
        preset_id: preset?.id ?? null,
        preset_name: preset?.name ?? null,
        game,
        trigger: "chat_command",
        series_index: seriesIndex,
        series_total: total,
      },
    });
  }

  await touchModuleState(session.id, {
    last_track_id: lastTrackId,
    last_item_preset_id: lastPresetId,
  });
}

// ---------- picks/bans toggles --------------------------------------------

type Pool = "tracks" | "items";

async function applyPicksBansToggle(args: {
  ctx: RaceCommandContext;
  rawArgs: string;
  pool: Pool;
  field: "picks" | "bans";
}): Promise<void> {
  const session = await loadActiveSession(args.ctx.userId);
  if (!session) return;
  const adapter = new TwitchAdapter({
    sessionId: session.id,
    ownerUserId: args.ctx.userId,
  });

  const id = args.rawArgs.trim().toLowerCase();
  if (!id) {
    await adapter.postChatMessage(
      `❌ Usage: !gs-${args.field === "picks" ? "pick" : "ban"}-${args.pool === "tracks" ? "track" : "item"} <id>`
    );
    return;
  }

  const exists = args.pool === "tracks" ? !!getTrackById(id) : !!getItemPresetById(id);
  if (!exists) {
    await adapter.postChatMessage(
      `❌ Unknown ${args.pool === "tracks" ? "track" : "item preset"} '${id}'.`
    );
    return;
  }

  await ensureModule(session.id);
  const existingConfig = (await loadModuleConfig(session.id)) ?? defaultRaceConfig();

  const sub = existingConfig[args.pool];
  const list = sub[args.field];
  if (list.includes(id)) {
    // Already in the list — silent no-op so duplicate webhook deliveries
    // don't double-confirm in chat. Idempotency per Phase 4A.1.
    return;
  }
  const next: RaceRandomizerConfig = {
    ...existingConfig,
    [args.pool]: { ...sub, [args.field]: [...list, id] },
  };
  await updateModuleConfig({
    sessionId: session.id,
    moduleId: "race_randomizer",
    config: next,
  });

  const item = args.pool === "tracks" ? getTrackById(id) : getItemPresetById(id);
  const label = item?.name ?? id;
  if (args.field === "picks") {
    await adapter.postChatMessage(`✓ Picked **${label}** for this session`);
  } else {
    await adapter.postChatMessage(`✗ Banned **${label}** for this session`);
  }
}

export const handlePickTrackCommand = (ctx: RaceCommandContext, args: string) =>
  applyPicksBansToggle({ ctx, rawArgs: args, pool: "tracks", field: "picks" });

export const handleBanTrackCommand = (ctx: RaceCommandContext, args: string) =>
  applyPicksBansToggle({ ctx, rawArgs: args, pool: "tracks", field: "bans" });

export const handlePickItemCommand = (ctx: RaceCommandContext, args: string) =>
  applyPicksBansToggle({ ctx, rawArgs: args, pool: "items", field: "picks" });

export const handleBanItemCommand = (ctx: RaceCommandContext, args: string) =>
  applyPicksBansToggle({ ctx, rawArgs: args, pool: "items", field: "bans" });

// ---------- clear-bans -----------------------------------------------------

async function clearBans(ctx: RaceCommandContext, pool: Pool): Promise<void> {
  const session = await loadActiveSession(ctx.userId);
  if (!session) return;
  const adapter = new TwitchAdapter({
    sessionId: session.id,
    ownerUserId: ctx.userId,
  });

  await ensureModule(session.id);
  const existingConfig = (await loadModuleConfig(session.id)) ?? defaultRaceConfig();
  const sub = existingConfig[pool];
  if (sub.bans.length === 0) {
    await adapter.postChatMessage(
      `✓ ${pool === "tracks" ? "Track" : "Item"} bans were already empty.`
    );
    return;
  }
  const next: RaceRandomizerConfig = {
    ...existingConfig,
    [pool]: { ...sub, bans: [] },
  };
  await updateModuleConfig({
    sessionId: session.id,
    moduleId: "race_randomizer",
    config: next,
  });
  await adapter.postChatMessage(
    `✓ Cleared all ${pool === "tracks" ? "track" : "item"} bans for this session.`
  );
}

export const handleClearTrackBansCommand = (ctx: RaceCommandContext) =>
  clearBans(ctx, "tracks");

export const handleClearItemBansCommand = (ctx: RaceCommandContext) =>
  clearBans(ctx, "items");

// ---------- helpers --------------------------------------------------------

function defaultRaceConfig(): RaceRandomizerConfig {
  return {
    enabled: true,
    tracks: { enabled: true, picks: [], bans: [] },
    items: { enabled: true, picks: [], bans: [] },
  };
}

async function touchModuleState(
  sessionId: string,
  patch: Partial<RaceRandomizerState>
): Promise<void> {
  // Read-modify-write — small surface so concurrency isn't a real
  // concern in chat-command frequency.
  const admin = createTwitchAdminClient();
  const { data: row } = await admin
    .from("session_modules")
    .select("state")
    .eq("session_id", sessionId)
    .eq("module_id", "race_randomizer")
    .maybeSingle();
  const current = ((row?.state as Record<string, unknown> | null) ?? {}) as Partial<RaceRandomizerState>;
  const merged: RaceRandomizerState = {
    last_track_id: current.last_track_id ?? null,
    last_item_preset_id: current.last_item_preset_id ?? null,
    last_randomized_at: new Date().toISOString(),
    ...patch,
  };
  await updateModuleState({
    sessionId,
    moduleId: "race_randomizer",
    state: merged,
  });
}
