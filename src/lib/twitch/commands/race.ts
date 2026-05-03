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
  getModuleConfigForGame,
  updateModuleConfigForGame,
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
  getItemById,
  getItemModeById,
  getTrackById,
  listTracksForGame,
  randomizeItemMode,
  randomizeRally,
  randomizeTrack,
  type Item,
  type ItemMode,
  type RaceGame,
  type Track,
} from "@/lib/randomizers/race";
import {
  getItemModesConfig,
  getLiteralItemsConfig,
} from "@/lib/modules/types";
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
  sessionId: string,
  gameSlug: string | null | undefined
): Promise<RaceRandomizerConfig | null> {
  return getModuleConfigForGame({
    sessionId,
    moduleId: "race_randomizer",
    gameSlug,
    includeDisabled: true,
  });
}

/**
 * Resolve the slug to use for per-game config lookups.
 *
 * `randomizer_slug` is Twitch's view of the active category. For test
 * sessions (or any session whose `active_game` hasn't been seeded yet),
 * it can be null even when the streamer has games configured. Fall back
 * to `configured_games[0]` so race commands resolve a config slice
 * instead of silently dead-ending on the per-game wrap.
 */
function effectiveGameSlug(
  session: { randomizer_slug: string | null; configured_games: string[] }
): string | null {
  return session.randomizer_slug ?? session.configured_games[0] ?? null;
}

function gameForSession(slug: string | null | undefined): RaceGame {
  return isRaceGame(slug) ? slug : DEFAULT_GAME;
}

/** Diagnostic for the "race randomizer isn't enabled" early-exit path.
 *  Surfaces the actual state the handler saw so a recurrence is
 *  self-diagnosing in Vercel logs. */
function logRaceCommandGuard(
  command: string,
  session: { id: string; randomizer_slug: string | null; configured_games: string[] },
  effectiveSlug: string | null,
  config: RaceRandomizerConfig | null,
  guard: string
): void {
  console.warn(
    `[twitch/race] ${command}: ${guard}`,
    JSON.stringify({
      sessionId: session.id,
      randomizerSlug: session.randomizer_slug,
      configuredGames: session.configured_games,
      effectiveSlug,
      configEnabled: config?.enabled ?? null,
      tracksEnabled: config?.tracks?.enabled ?? null,
      rolledByVoters: config?.tracks?.source === "viewers",
    })
  );
}

/** Map a race game enum to the kebab-case slug used by `gs_sessions`. */
function gameSlugFor(game: RaceGame): string {
  return game === "mk8dx" ? "mario-kart-8-deluxe" : "mario-kart-world";
}

function trackLine(track: Track): string {
  return `🏁 Track: **${track.name}** (${track.cup} Cup)`;
}

function itemsLine(mode: ItemMode, items: Item[]): string {
  if (items.length > 0) {
    const names = items.map((i) => i.name).join(", ");
    return `🎯 Items: **${mode.name}** — ${names}`;
  }
  return `🎯 Items: **${mode.name}**`;
}

/** Resolve the items list for a mode by id, dropping any unknown ids
 *  (defensive — a mode may reference an item that hasn't been added to
 *  the catalog yet). */
function itemsForMode(mode: ItemMode): Item[] {
  const out: Item[] = [];
  for (const id of mode.items) {
    const item = getItemById(id);
    if (item) out.push(item);
  }
  return out;
}

// ---------- !gs-rally ------------------------------------------------------

/** MKWorld knockout rally roll. Force-fires a rally regardless of the
 *  config's `rollKind` preference. MK8DX has no rallies — replies with a
 *  friendly "not supported" message. */
export async function handleRallyCommand(
  ctx: RaceCommandContext
): Promise<void> {
  const session = await loadActiveSession(ctx.userId);
  if (!session) return;
  const adapter = new TwitchAdapter({
    sessionId: session.id,
    ownerUserId: ctx.userId,
  });

  await ensureModule(session.id);
  const slug = effectiveGameSlug(session);
  const config = await loadModuleConfig(session.id, slug);
  if (!config || !config.enabled) {
    logRaceCommandGuard("!gs-rally", session, slug, config, "config_missing_or_disabled");
    await adapter.postChatMessage(
      "🏁 Race randomizer isn't enabled. Streamer: enable it on the configure page."
    );
    return;
  }

  const game = gameForSession(slug);
  if (game !== "mkworld") {
    await adapter.postChatMessage(
      "🏁 Knockout rallies are MKWorld-only. Use !gs-track for the current category."
    );
    return;
  }

  const ralliesSub = config.rallies ?? { enabled: true, picks: [], bans: [] };
  if (!ralliesSub.enabled) {
    await adapter.postChatMessage(
      "🏁 Rally randomization is off. Streamer: enable rallies on the Race Randomizer config."
    );
    return;
  }

  const rally = randomizeRally(game, ralliesSub);
  if (!rally) {
    await adapter.postChatMessage(
      "❌ No rallies available — picks/bans removed everything. Streamer: clear bans on the Modules tab to reset."
    );
    return;
  }

  await adapter.postChatMessage(`🏁 Rally: **${rally.name}**`);
  await touchModuleState(session.id, { last_track_id: rally.id });
  await recordEvent({
    sessionId: session.id,
    eventType: SESSION_EVENT_TYPES.track_randomized,
    actorType: "streamer",
    actorId: ctx.broadcasterTwitchId,
    payload: {
      track_id: rally.id,
      track_name: rally.name,
      kind: "rally",
      game: rally.game,
      trigger: "chat_command",
    },
  });
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
  const slug = effectiveGameSlug(session);
  const config = await loadModuleConfig(session.id, slug);
  if (!config || !config.enabled) {
    logRaceCommandGuard("!gs-track", session, slug, config, "config_missing_or_disabled");
    await adapter.postChatMessage(
      "🏁 Race randomizer isn't enabled. Streamer: enable it on the configure page."
    );
    return;
  }
  if (!config.tracks.enabled) {
    logRaceCommandGuard("!gs-track", session, slug, config, "tracks_disabled");
    await adapter.postChatMessage(
      "🏁 Track randomization is off. Streamer: turn it on in the Race Randomizer config."
    );
    return;
  }

  const total = parseSeriesLength(args, config.defaultSeriesLength);
  const game = gameForSession(slug);

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

  // Series — N>1. Ack → cook → deliver, same shape as !gs-race series.
  if (trackPool.length === 0) {
    await safePostChatMessage(
      adapter,
      "❌ No tracks available — picks/bans removed everything. Use !gs-clear-track-bans to reset.",
      "track-series-empty"
    );
    return;
  }

  // Step 1 — ack
  await safePostChatMessage(
    adapter,
    `🏁 Picking ${total} tracks, give me a sec...`,
    "track-series-ack"
  );

  // Step 2 — cook server-side (no chat posts during)
  const trackRolls: { seriesIndex: number; track: Track }[] = [];
  let lastTrackId: string | null = null;

  for (let i = 0; i < total; i++) {
    const seriesIndex = i + 1;
    if (trackPool.length === 0) break;
    const track = pickRandomFrom(trackPool);
    if (!track) break;
    const idx = trackPool.findIndex((t) => t.id === track.id);
    if (idx >= 0) trackPool.splice(idx, 1);

    trackRolls.push({ seriesIndex, track });
    lastTrackId = track.id;
    try {
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
        `[twitch/race] track series race ${seriesIndex}/${total} event-write failed:`,
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

  // Step 3 — deliver
  if (trackRolls.length === 0) {
    await safePostChatMessage(
      adapter,
      "❌ Couldn't roll any tracks — pool was empty.",
      "track-series-empty-after-cook"
    );
    return;
  }

  const lines = trackRolls.map(
    (r) => `Race ${r.seriesIndex}/${total}: ${trackLine(r.track)}`
  );
  const chunks = chunkLinesForChat(lines);
  chunks[0] = `🏁 ${total}-track series ready — ${chunks[0]}`;
  // Same breathing-room pattern as !gs-race series — ack first, pause,
  // then deliver so Twitch's anti-spam doesn't drop the second post.
  await sleep(SERIES_ACK_TO_DELIVERY_DELAY_MS);
  await postChunkedMessages(adapter, chunks, "track-series-payload");

  if (trackRolls.length < total) {
    await sleep(SERIES_POST_DELAY_MS);
    await safePostChatMessage(
      adapter,
      `⚠️ Only ${trackRolls.length} unique track${trackRolls.length === 1 ? " was" : "s were"} available in the pool — series stopped early.`,
      "track-series-truncated"
    );
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
  const slug = effectiveGameSlug(session);
  const config = await loadModuleConfig(session.id, slug);
  if (!config || !config.enabled) {
    logRaceCommandGuard("!gs-items", session, slug, config, "config_missing_or_disabled");
    await adapter.postChatMessage(
      "🎯 Race randomizer isn't enabled. Streamer: enable it on the configure page."
    );
    return;
  }
  const itemModes = getItemModesConfig(config.items);
  const itemLiteral = getLiteralItemsConfig(config.items);
  if (!itemModes.enabled) {
    logRaceCommandGuard("!gs-items", session, slug, config, "item_modes_disabled");
    await adapter.postChatMessage(
      "🎯 Item randomization is off. Streamer: turn it on in the Race Randomizer config."
    );
    return;
  }

  const game = gameForSession(slug);
  const mode = randomizeItemMode(game, itemModes);
  if (!mode) {
    await adapter.postChatMessage(
      "❌ No item modes available — picks/bans removed everything. Streamer: clear bans on the Modules tab to reset."
    );
    return;
  }

  // Each themed mode IS the item pool — surface the items list in
  // chat so viewers know what's in the box. itemLiteral picks/bans
  // remain available as a global filter slot for future use; not
  // applied to mode rolls right now.
  void itemLiteral;
  const items = itemsForMode(mode);

  await adapter.postChatMessage(itemsLine(mode, items));
  await touchModuleState(session.id, { last_item_preset_id: mode.id });
  await recordEvent({
    sessionId: session.id,
    eventType: SESSION_EVENT_TYPES.items_randomized,
    actorType: "streamer",
    actorId: ctx.broadcasterTwitchId,
    payload: {
      preset_id: mode.id,
      preset_name: mode.name,
      game: mode.game,
      trigger: "chat_command",
      literal_item_ids:
        items.length > 0 ? items.map((i) => i.id) : undefined,
      literal_item_names:
        items.length > 0 ? items.map((i) => i.name) : undefined,
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

/** Twitch chat message hard cap. We chunk well under this so a tiny
 *  emoji-encoding miscount doesn't flip a payload over the line. */
const TWITCH_MESSAGE_CHAR_LIMIT = 480;

/** Delay between sequential chat posts. Series flows now do all the
 *  randomization + DB writes server-side BEFORE posting, so this only
 *  applies to the rare case where the delivery payload is large enough
 *  to need chunking across multiple messages. 800ms keeps us well clear
 *  of any burst-protection / anti-spam heuristics. */
const SERIES_POST_DELAY_MS = 800;

/** Pause between the "Cooking up..." ack and the delivery payload.
 *  The cook step itself is fast (~200-400ms for 4-8 races); this delay
 *  ensures the two posts are far enough apart that Twitch's anti-spam
 *  treats them as distinct chat events rather than burst output. */
const SERIES_ACK_TO_DELIVERY_DELAY_MS = 1200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pack a list of pre-rendered race lines into the smallest number of
 * chat messages that fit under TWITCH_MESSAGE_CHAR_LIMIT each. Joins
 * within a chunk use " · " because Twitch chat doesn't render newlines.
 */
function chunkLinesForChat(lines: string[]): string[] {
  const SEP = " · ";
  const out: string[] = [];
  let current = "";
  for (const line of lines) {
    if (!current) {
      current = line;
      continue;
    }
    const candidate = `${current}${SEP}${line}`;
    if (candidate.length > TWITCH_MESSAGE_CHAR_LIMIT) {
      out.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }
  if (current) out.push(current);
  return out;
}

/** Post a list of message chunks sequentially with backoff. Used for
 *  the post-cook delivery in series flows. */
async function postChunkedMessages(
  adapter: TwitchAdapter,
  chunks: string[],
  contextPrefix: string
): Promise<void> {
  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) await sleep(SERIES_POST_DELAY_MS);
    await safePostChatMessage(adapter, chunks[i], `${contextPrefix}-${i + 1}`);
  }
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
  const slug = effectiveGameSlug(session);
  const config = await loadModuleConfig(session.id, slug);
  if (!config || !config.enabled) {
    logRaceCommandGuard("!gs-race", session, slug, config, "config_missing_or_disabled");
    await adapter.postChatMessage(
      "🎲 Race randomizer isn't enabled. Streamer: enable it on the configure page."
    );
    return;
  }

  // Multi-game spec: when the streamer set rollKind=rally, !gs-race
  // routes to the rally handler. When rollKind=auto on MKWorld, flip
  // a coin per call. MK8DX (no rallies) ignores rollKind.
  const game = gameForSession(slug);
  const rollKind = config.rollKind ?? "race";
  if (game === "mkworld") {
    const shouldRally =
      rollKind === "rally" ||
      (rollKind === "auto" && Math.random() < 0.5);
    if (shouldRally) {
      await handleRallyCommand(ctx);
      return;
    }
  }

  const total = parseSeriesLength(args, config.defaultSeriesLength);
  const itemModes = getItemModesConfig(config.items);
  const itemLiteral = getLiteralItemsConfig(config.items);

  // Build the track candidate pool ONCE, then dedupe across the series.
  // Modes use the regular randomizer for each race because the pool is
  // small — duplicates across a series are expected.
  const trackPoolFull = config.tracks.enabled
    ? applyPicksBansToPool(listTracksForGame(game), config.tracks)
    : [];
  const trackPool = [...trackPoolFull];

  // Single-race fast path. Adds a soft prompt for argless invocations
  // because most kart lobbies run 4/6/8 race blocks — the spec wants
  // streamers to discover the series shape on their first try.
  if (total === 1) {
    const track = config.tracks.enabled ? pickRandomFrom(trackPool) : null;
    const mode = itemModes.enabled ? randomizeItemMode(game, itemModes) : null;
    const items = mode ? itemsForMode(mode) : [];
    void itemLiteral;
    if (!track && !mode) {
      await adapter.postChatMessage(
        "❌ Both pools are off (or empty). Streamer: enable tracks/items in the Race Randomizer config."
      );
      return;
    }
    const parts: string[] = [];
    if (track) parts.push(trackLine(track));
    if (mode) parts.push(itemsLine(mode, items));
    const suffix = args.trim() ? "" : " · Want a series? Try `!gs-race 4`.";
    await adapter.postChatMessage(`${parts.join(" | ")}${suffix}`);

    await touchModuleState(session.id, {
      last_track_id: track?.id ?? null,
      last_item_preset_id: mode?.id ?? null,
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
        preset_id: mode?.id ?? null,
        preset_name: mode?.name ?? null,
        game,
        trigger: "chat_command",
        series_index: 1,
        series_total: 1,
        literal_item_ids:
          items.length > 0 ? items.map((i) => i.id) : undefined,
      },
    });
    return;
  }

  // Series path — N>1.
  if (!config.tracks.enabled && !itemModes.enabled) {
    await adapter.postChatMessage(
      "❌ Both pools are off. Streamer: enable tracks/items in the Race Randomizer config."
    );
    return;
  }

  // Step 1 — acknowledge the request so chat knows the bot is working
  // on it. This is the only chat post BEFORE the work happens; everything
  // else waits until the server has finished cooking.
  await safePostChatMessage(
    adapter,
    `🎲 Cooking up ${total} races, give me a sec...`,
    "series-ack"
  );

  // Step 2 — do all randomization + DB writes server-side. No chat posts
  // during this phase. Twitch's burst-protection on rapid bot posts was
  // dropping mid-series messages when the loop was interleaved with
  // posting; pre-cooking lets us deliver the full payload in one shot.
  //
  // Item *modes* are a LOBBY setting in actual MK8DX play — pick once up
  // front and apply to every race in the series. Tracks rotate per race
  // (deduped by default), but the item mode stays constant. The mode's
  // item list is what GS surfaces in chat — viewers see exactly what's
  // in the box for the whole series.
  const seriesMode: ItemMode | null = itemModes.enabled
    ? randomizeItemMode(game, itemModes)
    : null;
  const seriesItems: Item[] = seriesMode ? itemsForMode(seriesMode) : [];
  void itemLiteral;

  interface SeriesRoll {
    seriesIndex: number;
    track: Track | null;
  }

  const rolls: SeriesRoll[] = [];
  let lastTrackId: string | null = null;
  let trackPoolExhausted = false;

  // Series duplicate behavior — default is "no duplicate tracks within
  // the series" (each track at most once). When the streamer enables
  // `allowSeriesDuplicates`, we keep the full pool intact between rolls
  // so the same track can repeat.
  const allowDuplicates = !!config.allowSeriesDuplicates;

  for (let i = 0; i < total; i++) {
    const seriesIndex = i + 1;
    let track: Track | null = null;
    if (config.tracks.enabled) {
      if (trackPool.length === 0) {
        trackPoolExhausted = true;
      } else {
        track = pickRandomFrom(trackPool);
        if (track && !allowDuplicates) {
          const idx = trackPool.findIndex((t) => t.id === track!.id);
          if (idx >= 0) trackPool.splice(idx, 1);
        }
      }
    }

    if (!track && !seriesMode) continue;

    rolls.push({ seriesIndex, track });
    if (track) lastTrackId = track.id;

    try {
      await recordEvent({
        sessionId: session.id,
        eventType: SESSION_EVENT_TYPES.race_randomized,
        actorType: "streamer",
        actorId: ctx.broadcasterTwitchId,
        payload: {
          track_id: track?.id ?? null,
          track_name: track?.name ?? null,
          cup: track?.cup ?? null,
          // Same mode on every event in the series — the data shape
          // tells the truth: race N used this track + the lobby's
          // chosen items. Recap dedupe naturally collapses to a single
          // "Items used: <mode>" entry across the series.
          preset_id: seriesMode?.id ?? null,
          preset_name: seriesMode?.name ?? null,
          game,
          trigger: "chat_command",
          series_index: seriesIndex,
          series_total: total,
          literal_item_ids:
            seriesItems.length > 0 ? seriesItems.map((i) => i.id) : undefined,
        },
      });
    } catch (err) {
      console.error(
        `[twitch/race] series race ${seriesIndex}/${total} event-write failed:`,
        err
      );
    }
  }
  const lastPresetId: string | null = seriesMode?.id ?? null;

  // Persist module state once (last selections) before the delivery posts
  // so a downstream `!gs-mycombo` lookup sees the latest values.
  try {
    await touchModuleState(session.id, {
      last_track_id: lastTrackId,
      last_item_preset_id: lastPresetId,
    });
  } catch (err) {
    console.error("[twitch/race] touchModuleState (post-series) failed:", err);
  }

  // Step 3 — deliver. Items live in the header (one preset for the whole
  // series, matching MK8DX lobby semantics); race lines just show
  // tracks. Cleaner for chat AND saves enough characters per line that
  // 8-race series still fit in a single delivery message.
  if (rolls.length === 0) {
    await safePostChatMessage(
      adapter,
      "❌ Couldn't roll any races — both pools came up empty.",
      "series-empty"
    );
    return;
  }

  const headerParts: string[] = [`🎲 ${total}-race series ready`];
  if (seriesMode) {
    if (seriesItems.length > 0) {
      const names = seriesItems.map((i) => i.name).join(", ");
      headerParts.push(`🎯 ${seriesMode.name} — ${names} (all races)`);
    } else {
      headerParts.push(`🎯 ${seriesMode.name} (all races)`);
    }
  }

  const lines = rolls.map((r) => {
    if (r.track) return `Race ${r.seriesIndex}/${total}: ${trackLine(r.track)}`;
    return `Race ${r.seriesIndex}/${total}: track-roll skipped`;
  });

  const chunks = chunkLinesForChat(lines);
  // Prepend the header to the first chunk so the delivery is obviously
  // "the answer" to the ack.
  chunks[0] = `${headerParts.join(" · ")} — ${chunks[0]}`;

  // Breathing room between ack and delivery so Twitch doesn't burst-flag
  // back-to-back bot posts. The cook step is fast (in-memory + DB writes
  // ~200ms total), so without an explicit pause the two posts land
  // ~300ms apart — too close for some chat-rate heuristics.
  await sleep(SERIES_ACK_TO_DELIVERY_DELAY_MS);
  await postChunkedMessages(adapter, chunks, "series-payload");

  if (trackPoolExhausted) {
    await sleep(SERIES_POST_DELAY_MS);
    await safePostChatMessage(
      adapter,
      `⚠️ Only ${trackPoolFull.length} unique track${trackPoolFull.length === 1 ? "" : "s"} available in the pool — later races in the series skipped the track roll.`,
      "series-exhausted"
    );
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

  // Items-pool chat commands target item *modes* (rule sets) — the
  // existing legacy behavior. Literal items (Blue Shell, etc.) are
  // picked via the live view, never chat. Tracks pool maps directly.
  const exists = args.pool === "tracks" ? !!getTrackById(id) : !!getItemModeById(id);
  if (!exists) {
    await adapter.postChatMessage(
      `❌ Unknown ${args.pool === "tracks" ? "track" : "item mode"} '${id}'.`
    );
    return;
  }

  await ensureModule(session.id);
  const effectiveSlug = effectiveGameSlug(session);
  const game = gameForSession(effectiveSlug);
  const slug = gameSlugFor(game);
  const existingConfig =
    (await loadModuleConfig(session.id, effectiveSlug)) ??
    defaultRaceConfig();

  // For tracks, sub === existingConfig.tracks. For items, the legacy
  // shape (existingConfig.items: RaceRandomizerSubConfig) gets normalized
  // through getItemModesConfig so writes always hit the modes pool. We
  // build the next config back into the wrapped items shape.
  const subForRead =
    args.pool === "tracks"
      ? existingConfig.tracks
      : getItemModesConfig(existingConfig.items);
  const list = subForRead[args.field];
  if (list.includes(id)) {
    // Already in the list — silent no-op so duplicate webhook deliveries
    // don't double-confirm in chat. Idempotency per Phase 4A.1.
    return;
  }
  const updatedSub = { ...subForRead, [args.field]: [...list, id] };
  const next: RaceRandomizerConfig = {
    ...existingConfig,
    ...(args.pool === "tracks"
      ? { tracks: updatedSub }
      : {
          items: {
            modes: updatedSub,
            literal: getLiteralItemsConfig(existingConfig.items),
          },
        }),
  };
  await updateModuleConfigForGame({
    sessionId: session.id,
    moduleId: "race_randomizer",
    gameSlug: slug,
    config: next,
    legacyGameSlug: slug,
  });

  const item = args.pool === "tracks" ? getTrackById(id) : getItemModeById(id);
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
  const effectiveSlug = effectiveGameSlug(session);
  const game = gameForSession(effectiveSlug);
  const slug = gameSlugFor(game);
  const existingConfig =
    (await loadModuleConfig(session.id, effectiveSlug)) ??
    defaultRaceConfig();
  const subForRead =
    pool === "tracks"
      ? existingConfig.tracks
      : getItemModesConfig(existingConfig.items);
  if (subForRead.bans.length === 0) {
    await adapter.postChatMessage(
      `✓ ${pool === "tracks" ? "Track" : "Item mode"} bans were already empty.`
    );
    return;
  }
  const cleared = { ...subForRead, bans: [] };
  const next: RaceRandomizerConfig = {
    ...existingConfig,
    ...(pool === "tracks"
      ? { tracks: cleared }
      : {
          items: {
            modes: cleared,
            literal: getLiteralItemsConfig(existingConfig.items),
          },
        }),
  };
  await updateModuleConfigForGame({
    sessionId: session.id,
    moduleId: "race_randomizer",
    gameSlug: slug,
    config: next,
    legacyGameSlug: slug,
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
    items: {
      modes: { enabled: true, picks: [], bans: [] },
      literal: { enabled: true, picks: [], bans: [] },
    },
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
