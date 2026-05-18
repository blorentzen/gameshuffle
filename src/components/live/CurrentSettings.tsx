"use client";

/**
 * Current Settings aside — sidebar to the Twitch embed. Surfaces the
 * live state of the session at a glance:
 *
 *   - Session title (no decorative eyebrow — it IS the heading)
 *   - Now playing: current game artwork + full name
 *   - All games this session: full names of every configured_games
 *     entry (only shown when more than one)
 *   - All races this session: every rolled track / rally as inline
 *     tiles, horizontally scrollable
 *   - Current items: the actual item box for the most recent rolled
 *     mode — items with images + names, horizontally scrollable
 *
 * No "current race" indicator: streamers don't have a way to mark a
 * race as in-progress today, so the sidebar shows everything rolled
 * and lets viewers reason about position from chronology.
 */

import { useMemo } from "react";
import Image from "next/image";
import {
  GAME_ARTWORK,
  getGameArtwork,
  type GameArtworkEntry,
} from "@/lib/games/artwork";
import {
  getItemById,
  getItemModeById,
  getRallyById,
  getTrackById,
  type Item,
  type RaceGame,
} from "@/lib/randomizers/race";
import { getImagePath } from "@/lib/images";
import { useLiveState } from "./RealtimeLiveView";

interface CurrentSettingsProps {
  /** Streamer-friendly empty-state name when no game is set yet. */
  streamerName: string;
}

interface RaceTile {
  key: string;
  name: string;
  image: string | null;
  kind: "race" | "rally";
}

interface CurrentItemsState {
  presetId: string | null;
  presetName: string | null;
  items: Item[];
}

const RACE_EVENT_TYPES = new Set(["race_randomized", "track_randomized"]);
const PRESET_EVENT_TYPES = new Set(["items_randomized", "race_randomized"]);

export function CurrentSettings({ streamerName }: CurrentSettingsProps) {
  const live = useLiveState();
  const session = live.session;
  const activeGame = session.activeGame;
  const configuredGames = session.configuredGames;
  const activeArt = getGameArtwork(activeGame);
  // `session.activeGame` is the kebab slug (`"mario-kart-8-deluxe"`);
  // map it to the RaceGame enum. The previous comparison checked the
  // slug against enum strings ("mk8dx" / "mkworld") and always fell
  // through to null, leaking cross-game items into the panel.
  const game: RaceGame | null =
    activeGame === "mario-kart-8-deluxe"
      ? "mk8dx"
      : activeGame === "mario-kart-world"
        ? "mkworld"
        : null;

  // Filter race + item events to the current active game so swapping
  // categories clears the "Races this round" and "Current items"
  // displays. `payload.game` is the RaceGame enum recorded at roll
  // time by handleRaceCommand / handleItemsCommand. Events without a
  // game payload (older sessions, non-roll events) pass through —
  // the helpers below ignore non-race / non-item events anyway.
  const eventsForGame = useMemo(() => {
    if (!game) return live.events;
    return live.events.filter((e) => {
      const p = (e.payload ?? {}) as { game?: string | null };
      // Only race + item events carry `game`; everything else passes.
      if (p.game === undefined || p.game === null) return true;
      return p.game === game;
    });
  }, [live.events, game]);

  const races = useMemo(
    () => collectCurrentRoundRaces(eventsForGame),
    [eventsForGame],
  );

  const currentItems = useMemo(
    () => deriveCurrentItems(eventsForGame, game),
    [eventsForGame, game],
  );

  return (
    <aside className="current-settings" aria-label="Current session settings">
      <h3 className="current-settings__title">{session.name}</h3>

      <section className="current-settings__section">
        <p className="current-settings__label">Now playing</p>
        <ActiveGameRow art={activeArt} hasActive={!!activeGame} streamerName={streamerName} />
      </section>

      {configuredGames.length > 1 && (
        <section className="current-settings__section">
          <p className="current-settings__label">All games this session</p>
          <div className="current-settings__scroller">
            <ul className="current-settings__game-chips">
              {configuredGames.map((slug) => (
                <li key={slug}>
                  <GameChip slug={slug} isActive={slug === activeGame} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="current-settings__section">
        <p className="current-settings__label">
          Races this round{races.length > 0 && (
            <span className="current-settings__sub">
              {" "}· {races.length}
            </span>
          )}
        </p>
        {races.length > 0 ? (
          <div className="current-settings__scroller">
            <ul className="current-settings__race-tiles">
              {races.map((race) => (
                <li key={race.key}>
                  <RaceTileItem race={race} />
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="current-settings__empty">
            <em>Not yet rolled</em>
          </p>
        )}
      </section>

      <section className="current-settings__section">
        <p className="current-settings__label">
          Current items
          {currentItems.presetName && (
            <span className="current-settings__sub">
              {" "}· {currentItems.presetName}
            </span>
          )}
        </p>
        {currentItems.items.length > 0 ? (
          <div className="current-settings__scroller">
            <ul className="current-settings__item-tiles">
              {currentItems.items.map((item) => (
                <li key={item.id}>
                  <ItemTileItem item={item} />
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="current-settings__empty">
            <em>{currentItems.presetName ? "No catalog for this mode" : "Not yet rolled"}</em>
          </p>
        )}
      </section>
    </aside>
  );
}

function ActiveGameRow({
  art,
  hasActive,
  streamerName,
}: {
  art: GameArtworkEntry;
  hasActive: boolean;
  streamerName: string;
}) {
  return (
    <div className="current-settings__active-game">
      {art.artworkUrl && (
        <div className="current-settings__active-game-img">
          <Image
            src={art.artworkUrl}
            alt={art.name}
            width={48}
            height={48}
            unoptimized
          />
        </div>
      )}
      <div className="current-settings__active-game-meta">
        <p className="current-settings__active-game-name">{art.name}</p>
        {!hasActive && (
          <p className="current-settings__sub">
            Waiting for {streamerName} to set a game on Twitch.
          </p>
        )}
      </div>
    </div>
  );
}

function GameChip({ slug, isActive }: { slug: string; isActive: boolean }) {
  // Always show the full name (e.g. "Mario Kart 8 Deluxe"), not the
  // short alias or the slug itself.
  const art = GAME_ARTWORK[slug] ?? getGameArtwork(slug);
  return (
    <span
      className={`current-settings__chip${
        isActive ? " current-settings__chip--active" : ""
      }`}
    >
      {art.name}
      {isActive && (
        <span className="current-settings__chip-active-dot" aria-hidden />
      )}
    </span>
  );
}

function RaceTileItem({ race }: { race: RaceTile }) {
  return (
    <article className="current-settings__race-tile" title={race.name}>
      {race.image ? (
        <Image
          src={getImagePath(race.image)}
          alt={race.name}
          width={104}
          height={58}
          unoptimized
        />
      ) : (
        <div className="current-settings__race-tile-placeholder" aria-hidden />
      )}
      <span className="current-settings__race-tile-name">{race.name}</span>
    </article>
  );
}

function ItemTileItem({ item }: { item: Item }) {
  return (
    <article className="current-settings__item-tile" title={item.name}>
      {item.image ? (
        <Image
          src={getImagePath(item.image)}
          alt={item.name}
          width={40}
          height={40}
          unoptimized
        />
      ) : (
        <div className="current-settings__item-tile-placeholder" aria-hidden />
      )}
      <span className="current-settings__item-tile-name">{item.name}</span>
    </article>
  );
}

/** Walk events chronologically and bucket consecutive same-series
 *  rolls into rounds. Returns the races for the **most recent** round
 *  only — the aside reflects what's being raced right now, not the
 *  full session history (Race History tab carries that).
 *
 *  A round is:
 *   - One `!gs-race [N]` series → all N races (collapsed by series_total/
 *     contiguous series_index)
 *   - One single roll (`!gs-track` or argless `!gs-race`) → 1 race
 *
 *  The "current round" is whatever the streamer rolled most recently.
 */
function collectCurrentRoundRaces(
  events: { id: string; event_type: string; payload: unknown; created_at: string }[]
): RaceTile[] {
  type ParsedRace = {
    eventId: string;
    trackId: string | null;
    trackName: string | null;
    kind: "race" | "rally";
    seriesIndex: number;
    seriesTotal: number;
  };

  // Walk newest → oldest. The very first race-event we see belongs to
  // the current round; we keep walking only as long as subsequent
  // events look like earlier members of that same series. Once the
  // chain breaks (different series_total OR seriesIndex doesn't fall
  // one step earlier), we stop.
  const reversedRoundRaces: ParsedRace[] = [];
  let pendingExpectedIndex: number | null = null;
  let pendingSeriesTotal: number | null = null;

  for (const e of events) {
    if (!RACE_EVENT_TYPES.has(e.event_type)) continue;
    const p = (e.payload ?? {}) as {
      track_id?: string | null;
      track_name?: string | null;
      kind?: "race" | "rally" | string | null;
      series_index?: number | null;
      series_total?: number | null;
    };
    if (!p.track_id && !p.track_name) continue;
    const seriesIndex = p.series_index ?? 1;
    const seriesTotal = p.series_total ?? 1;
    const parsed: ParsedRace = {
      eventId: e.id,
      trackId: p.track_id ?? null,
      trackName: p.track_name ?? null,
      kind: p.kind === "rally" ? "rally" : "race",
      seriesIndex,
      seriesTotal,
    };

    if (reversedRoundRaces.length === 0) {
      // First (newest) race seen — it's the latest entry of the
      // current round. Single rolls (seriesTotal===1) make this a
      // 1-race round; series rolls expect earlier members behind.
      reversedRoundRaces.push(parsed);
      pendingSeriesTotal = seriesTotal;
      pendingExpectedIndex = seriesTotal > 1 ? seriesIndex - 1 : 0;
      continue;
    }

    // Subsequent (older) events: only fold them into the round if
    // they're an earlier member of the same series.
    if (
      pendingSeriesTotal !== null &&
      pendingSeriesTotal > 1 &&
      seriesTotal === pendingSeriesTotal &&
      seriesIndex === pendingExpectedIndex
    ) {
      reversedRoundRaces.push(parsed);
      pendingExpectedIndex = seriesIndex - 1;
      continue;
    }
    break;
  }

  // Reverse to chronological order (oldest race → newest) so the
  // strip reads left-to-right as the round unfolds.
  const roundRaces = reversedRoundRaces.slice().reverse();
  return roundRaces.map((r) => {
    const catalog =
      r.kind === "rally"
        ? r.trackId
          ? getRallyById(r.trackId)
          : null
        : r.trackId
          ? getTrackById(r.trackId)
          : null;
    return {
      key: r.eventId,
      name: catalog?.name ?? r.trackName ?? "Unknown",
      image: catalog?.image ?? null,
      kind: r.kind,
    };
  });
}

/** Find the most recent rolled item-mode and resolve its item set.
 *  Falls back to the event's literal_item_ids when the mode isn't in
 *  the local catalog. */
function deriveCurrentItems(
  events: { event_type: string; payload: unknown }[],
  game: RaceGame | null
): CurrentItemsState {
  for (const e of events) {
    if (!PRESET_EVENT_TYPES.has(e.event_type)) continue;
    const p = (e.payload ?? {}) as {
      preset_id?: string | null;
      preset_name?: string | null;
      literal_item_ids?: string[] | null;
    };
    const presetId = p.preset_id ?? null;
    if (!presetId) continue;
    const mode = getItemModeById(presetId, game ?? undefined);
    const ids = mode?.items ?? p.literal_item_ids ?? [];
    const items: Item[] = [];
    for (const id of ids) {
      const item = getItemById(id, game ?? undefined);
      if (item) items.push(item);
    }
    return {
      presetId,
      presetName: p.preset_name ?? mode?.name ?? presetId,
      items,
    };
  }
  return { presetId: null, presetName: null, items: [] };
}
