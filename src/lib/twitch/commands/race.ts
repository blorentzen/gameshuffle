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

// ---------- !gs-track [N] --------------------------------------------------

export async function handleTrackCommand(
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

  const total = parseSeriesLength(args);
  const game = gameForSession(session.randomizer_slug);

  // Build the candidate pool ONCE so dedupe-within-series works.
  const trackPool = applyPicksBansToPool(listTracksForGame(game), config.tracks);

  if (total === 1) {
    const track = pickRandomFrom(trackPool);
    if (!track) {
      await adapter.postChatMessage(
        "❌ No tracks available — picks/bans removed everything. Use !gs-clear-track-bans to reset."
      );
      return;
    }
    // Soft prompt: most lobbies are 4/6/8 races. If the streamer just
    // typed `!gs-track` (no count), append a nudge so they see the
    // series shape exists. Argless invocations only.
    const suffix = args.trim() ? "" : " · Want more? Try `!gs-track 4` for a series.";
    await adapter.postChatMessage(`${trackLine(track)}${suffix}`);
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
        series_index: 1,
        series_total: 1,
      },
    });
    return;
  }

  // Series — N>1. Same dedupe-within-series semantics as !gs-race.
  if (trackPool.length === 0) {
    await safePostChatMessage(
      adapter,
      "❌ No tracks available — picks/bans removed everything. Use !gs-clear-track-bans to reset.",
      "track-series-empty"
    );
    return;
  }

  await safePostChatMessage(adapter, `🏁 Track series — ${total} tracks`, "track-series-header");

  let lastTrackId: string | null = null;
  for (let i = 0; i < total; i++) {
    const seriesIndex = i + 1;
    try {
      if (trackPool.length === 0) {
        await safePostChatMessage(
          adapter,
          `⚠️ Only ${seriesIndex - 1} unique track${seriesIndex === 2 ? "" : "s"} available in the pool — series stops here.`,
          `track-series-${seriesIndex}-stop`
        );
        break;
      }
      const track = pickRandomFrom(trackPool);
      if (!track) break;
      const idx = trackPool.findIndex((t) => t.id === track.id);
      if (idx >= 0) trackPool.splice(idx, 1);

      // Pace messages so burst-protection doesn't drop them silently.
      if (i > 0) await sleep(SERIES_POST_DELAY_MS);
      await safePostChatMessage(
        adapter,
        `Race ${seriesIndex}/${total}: ${trackLine(track)}`,
        `track-series-${seriesIndex}`
      );
      lastTrackId = track.id;
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
          series_index: seriesIndex,
          series_total: total,
        },
      });
    } catch (err) {
      console.error(
        `[twitch/race] track series race ${seriesIndex}/${total} threw:`,
        err
      );
    }
  }
  if (lastTrackId) {
    try {
      await touchModuleState(session.id, { last_track_id: lastTrackId });
    } catch (err) {
      console.error("[twitch/race] track series touchModuleState failed:", err);
    }
  }
}

// ---------- !gs-items ------------------------------------------------------

export async function handleItemsCommand(
  ctx: RaceCommandContext,
  // Items pool is intentionally small (3 presets in Phase A) so a series
  // would just spam repeats. We accept the arg for shape parity with
  // !gs-track and !gs-race but ignore it — single roll either way.
  _args: string = ""
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

/** Inter-message delay for series posts. Twitch's bot chat rate limit
 *  is 100 messages / 30s for moderator-status bots (which our bot is in
 *  authorized broadcasters' channels), but rapid back-to-back posts can
 *  still trip burst-protection / anti-spam heuristics. 600ms keeps a
 *  4-race series under 3 seconds total while staying safely below any
 *  documented or undocumented burst cap. */
const SERIES_POST_DELAY_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Post a chat message and log AdapterResult failures so they show up in
 * Vercel logs when a series partial-fails. Without this wrapper, the
 * caller silently ignores `{ ok: false }` returns and there's no signal
 * that 3 of 4 race-series messages dropped.
 */
async function safePostChatMessage(
  adapter: TwitchAdapter,
  message: string,
  context: string
): Promise<boolean> {
  const result = await adapter.postChatMessage(message);
  if (!result.ok) {
    console.error(
      `[twitch/race] postChatMessage failed (${context}): ${"error" in result ? result.error : "unknown"}`
    );
    return false;
  }
  return true;
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

  // Single-race fast path. Adds a soft prompt for argless invocations
  // because most kart lobbies run 4/6/8 race blocks — the spec wants
  // streamers to discover the series shape on their first try.
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
    const suffix = args.trim() ? "" : " · Want a series? Try `!gs-race 4`.";
    await adapter.postChatMessage(`${parts.join(" | ")}${suffix}`);

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
  await safePostChatMessage(adapter, `🎲 Race series — ${total} races`, "series-header");

  let lastTrackId: string | null = null;
  let lastPresetId: string | null = null;
  let trackPoolExhaustedAt: number | null = null;

  for (let i = 0; i < total; i++) {
    const seriesIndex = i + 1;

    // Per-iteration try/catch so one DB hiccup or transient post failure
    // doesn't kill the whole series — we want all 4 (or however many)
    // rolls to attempt regardless of mid-series failures.
    try {
      let track: Track | null = null;
      if (config.tracks.enabled) {
        if (trackPool.length === 0) {
          if (trackPoolExhaustedAt === null) {
            trackPoolExhaustedAt = seriesIndex;
            await safePostChatMessage(
              adapter,
              `⚠️ Only ${trackPoolFull.length} unique track${trackPoolFull.length === 1 ? "" : "s"} available — remaining races skip the track roll.`,
              `series-${seriesIndex}-exhausted`
            );
            await sleep(SERIES_POST_DELAY_MS);
          }
        } else {
          track = pickRandomFrom(trackPool);
          if (track) {
            const idx = trackPool.findIndex((t) => t.id === track!.id);
            if (idx >= 0) trackPool.splice(idx, 1);
          }
        }
      }

      const preset = config.items.enabled ? randomizeItems(game, config.items) : null;

      if (!track && !preset) {
        continue;
      }

      const parts: string[] = [];
      if (track) parts.push(trackLine(track));
      if (preset) parts.push(itemsLine(preset));

      // Pace messages so Twitch's burst-protection + anti-spam don't
      // silently drop posts mid-series. The first message goes out
      // immediately; subsequent messages wait SERIES_POST_DELAY_MS.
      if (i > 0) await sleep(SERIES_POST_DELAY_MS);
      await safePostChatMessage(
        adapter,
        `Race ${seriesIndex}/${total}: ${parts.join(" | ")}`,
        `series-${seriesIndex}`
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
    } catch (err) {
      console.error(
        `[twitch/race] series race ${seriesIndex}/${total} threw:`,
        err
      );
    }
  }

  try {
    await touchModuleState(session.id, {
      last_track_id: lastTrackId,
      last_item_preset_id: lastPresetId,
    });
  } catch (err) {
    console.error("[twitch/race] touchModuleState (post-series) failed:", err);
  }
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
