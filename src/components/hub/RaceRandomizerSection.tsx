"use client";

/**
 * Configure-page section for the Race Randomizer module. Inline UI (not
 * a modal) per spec §6 — 96 tracks needs real estate that a modal can't
 * carry.
 *
 * Three subsections:
 *   1. Master toggle + tracks toggle + items toggle
 *   2. Picks/bans multi-select for tracks (96 entries, searchable, grouped by cup)
 *   3. Picks/bans multi-select for items (3 entries today)
 *   4. Manual override buttons: "Reroll track" / "Reroll items" / "Reroll race"
 *
 * Save semantics: each toggle/picks-bans change saves on commit (debounced
 * ~400ms after the user stops interacting). Manual override buttons fire
 * the same logic as the corresponding chat commands by POSTing to a
 * dedicated endpoint.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Modal,
  Switch,
} from "@empac/cascadeds";
import {
  getItemById,
  listTracksForGame,
  listRalliesForGame,
  listItemModesForGame,
  listItemsForGame,
  type RaceGame,
} from "@/lib/randomizers/race";
import {
  getItemModesConfig,
  getLiteralItemsConfig,
  type RaceRandomizerConfig,
  type RaceRandomizerSubConfig,
} from "@/lib/modules/types";
import { updateRaceConfigAction } from "@/app/hub/sessions/[slug]/actions";

interface Props {
  /** Active session id (or null when there's no live session). */
  sessionId: string | null;
  /** Session slug — used by the per-slug save action so configuration
   *  works on draft sessions (which don't have an active sessionId
   *  resolvable through the modules API). */
  sessionSlug: string;
  /** RaceGame enum (`mk8dx` / `mkworld`) — drives which track/item
   *  registry feeds the pickers. Null when the slug isn't a supported
   *  race game (the parent renders the GS Queue surface in that case). */
  game: RaceGame | null;
  /** Kebab-case game slug as stored in `gs_sessions.configured_games`
   *  (e.g. `mario-kart-8-deluxe`). Sent to the save endpoint so the
   *  config writes into `session_modules.config.per_game[slug]`. */
  gameSlug: string;
  /** Hydrated config snapshot from the server. */
  initial: RaceRandomizerConfig | null;
}

const SAVE_DEBOUNCE_MS = 400;

const DEFAULT_CONFIG: RaceRandomizerConfig = {
  enabled: true,
  tracks: { enabled: true, picks: [], bans: [] },
  items: {
    modes: { enabled: true, picks: [], bans: [] },
    literal: { enabled: true, picks: [], bans: [] },
  },
  defaultSeriesLength: 1,
};

/** Title-case an item category for display as a "cup" group header in
 *  the SubPoolEditor. The editor renders `<cup> Cup` for tracks; for
 *  literal items we want `Offensive` / `Defensive` etc. — drop the
 *  trailing " Cup" via the editor's `cupSuffix` flag (added below). */
function titleCaseCategory(c: string): string {
  return c.charAt(0).toUpperCase() + c.slice(1);
}

/** Streamer-friendly preset series lengths surfaced in the UI. Backed
 *  by the same MAX_SERIES_LENGTH cap; the streamer can still type any
 *  value 1–16 in the manual reroll input. */
const SERIES_PRESETS: number[] = [1, 2, 4, 6, 8, 12, 16];

export function RaceRandomizerSection({
  sessionId,
  sessionSlug,
  game,
  gameSlug,
  initial,
}: Props) {
  const [config, setConfig] = useState<RaceRandomizerConfig>(
    initial ?? DEFAULT_CONFIG
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [rerolling, setRerolling] = useState<"track" | "items" | "race" | null>(null);
  const [seriesLength, setSeriesLength] = useState<number>(
    config.defaultSeriesLength ?? 1
  );
  const saveTimerRef = useRef<number | null>(null);

  // sessionId is null on draft sessions; manual reroll requires a live
  // session, but picks/bans configuration works at any time.
  const liveSession = !!sessionId;
  const noGame = !game;

  const tracks = useMemo(
    () => (game ? listTracksForGame(game) : []),
    [game]
  );
  const rallies = useMemo(
    () => (game ? listRalliesForGame(game) : []),
    [game]
  );
  // MKWorld is the only game today with rallies — surface the
  // Tracks/Rallies toggle only when there's actually a rally pool.
  const supportsRallies = rallies.length > 0;
  const itemModes = useMemo(
    () =>
      game
        ? listItemModesForGame(game).map((m) => {
            const items = m.items
              .map((id) => getItemById(id))
              .filter((i): i is NonNullable<typeof i> => !!i)
              .map((i) => ({ id: i.id, name: i.name, image: i.image }));
            return {
              id: m.id,
              name: m.name,
              info: {
                description: m.description,
                items,
              },
            };
          })
        : [],
    [game]
  );
  const literalItems = useMemo(
    () =>
      game
        ? listItemsForGame(game).map((i) => ({
            id: i.id,
            name: i.name,
            cup: titleCaseCategory(i.category),
            image: i.image,
          }))
        : [],
    [game]
  );

  // Sub-pools are read through helpers that handle both the new wrapped
  // shape (`items.modes` / `items.literal`) and the legacy single-pool
  // shape — so we render correctly even before the SQL migration runs.
  const itemModesSub = getItemModesConfig(config.items);
  const itemLiteralSub = getLiteralItemsConfig(config.items);

  // Update helpers — write back into the wrapped shape, regardless of
  // what shape the row was in. The store-side helpers do the same on
  // the server, so save round-trips converge to the wrapped form.
  const updateModesSub = (patch: Partial<RaceRandomizerSubConfig>) => {
    setConfig((c) => ({
      ...c,
      items: {
        modes: { ...getItemModesConfig(c.items), ...patch },
        literal: getLiteralItemsConfig(c.items),
      },
    }));
  };
  const updateLiteralSub = (patch: Partial<RaceRandomizerSubConfig>) => {
    setConfig((c) => ({
      ...c,
      items: {
        modes: getItemModesConfig(c.items),
        literal: { ...getLiteralItemsConfig(c.items), ...patch },
      },
    }));
  };

  // Persist on change — debounced. Single in-flight saver; if the user
  // keeps editing, the timer resets and we batch into one PATCH. Uses
  // the per-slug server action so saves work even on draft sessions
  // (when sessionId may not be live yet).
  useEffect(() => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void saveConfig(sessionSlug, gameSlug, config, {
        onStart: () => {
          setSaving(true);
          setError(null);
        },
        onSuccess: () => {
          setSaving(false);
          setSavedFlash(true);
          window.setTimeout(() => setSavedFlash(false), 1500);
        },
        onError: (msg) => {
          setSaving(false);
          setError(msg);
        },
      });
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  // We only debounce on config edits, not on the sessionSlug/game changes
  // (those imply a remount via the parent server component anyway).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  // Counts for the live "X of Y available" copy
  const trackCount = tracks.length;
  const trackBans = config.tracks.bans.length;
  const trackPicks = config.tracks.picks.length;
  const trackPoolSize =
    trackPicks > 0
      ? config.tracks.picks.filter((id) => !config.tracks.bans.includes(id)).length
      : Math.max(0, trackCount - trackBans);

  const modesCount = itemModes.length;
  const modesBans = itemModesSub.bans.length;
  const modesPicks = itemModesSub.picks.length;
  const modesPoolSize =
    modesPicks > 0
      ? itemModesSub.picks.filter((id) => !itemModesSub.bans.includes(id)).length
      : Math.max(0, modesCount - modesBans);

  const literalCount = literalItems.length;
  const literalBans = itemLiteralSub.bans.length;
  const literalPicks = itemLiteralSub.picks.length;
  const literalPoolSize =
    literalPicks > 0
      ? itemLiteralSub.picks.filter((id) => !itemLiteralSub.bans.includes(id))
          .length
      : Math.max(0, literalCount - literalBans);

  const reroll = async (kind: "track" | "items" | "race") => {
    if (!sessionId) return;
    setRerolling(kind);
    setError(null);
    try {
      const payload: Record<string, unknown> = { sessionId, kind };
      if (kind === "race" && seriesLength > 1) {
        payload.series = seriesLength;
      }
      const res = await fetch("/api/twitch/race/reroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `Reroll failed (${res.status}).`);
      }
    } catch (err) {
      console.error("[RaceRandomizerSection] reroll failed", err);
      setError("Reroll failed (network error).");
    }
    setRerolling(null);
  };

  return (
    <section className="hub-detail__section">
      <h2 className="hub-detail__section-title">Race Randomizer</h2>
      <p className="hub-form__platform-disabled">
        Roll a track + item rule set for the room. Picks/bans operate at
        the individual track level — pick the tracks you actually want in
        the pool, ban the ones you don&rsquo;t. Same model for item
        presets.
      </p>

      {error && (
        <Alert variant="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {savedFlash && !saving && !error && (
        <Alert variant="success">Saved.</Alert>
      )}

      {noGame && (
        <Alert variant="info">
          This session has no randomizer game selected — race randomization
          is queue-mode-friendly but won&rsquo;t roll until a game is set on
          the Session details section above.
        </Alert>
      )}

      <div className="hub-form__field-stack">
        <label className="hub-form__inline-field hub-form__inline-field--row">
          <Switch
            checked={config.enabled}
            onChange={() =>
              setConfig((c) => ({ ...c, enabled: !c.enabled }))
            }
          />
          <span>
            <strong>{config.enabled ? "Enabled" : "Disabled"}</strong>
            <span className="hub-form__platform-disabled">
              Master toggle. Disable to silence <code>!gs-track</code>,{" "}
              <code>!gs-items</code>, <code>!gs-race</code> entirely.
            </span>
          </span>
        </label>

        <div className="hub-form__field">
          <label className="hub-form__field" htmlFor="race-default-series">
            <span className="hub-form__label">Default race series</span>
            <select
              id="race-default-series"
              className="hub-form__select"
              value={String(config.defaultSeriesLength ?? 1)}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                setConfig((c) => ({ ...c, defaultSeriesLength: n }));
                setSeriesLength(n);
              }}
            >
              {SERIES_PRESETS.map((n) => (
                <option key={n} value={String(n)}>
                  {n === 1 ? "1 race" : `${n} races`}
                </option>
              ))}
            </select>
          </label>
          <p className="hub-form__platform-disabled">
            Sets the default series length for <code>!gs-track</code> and{" "}
            <code>!gs-race</code>. Pick what you usually play; explicit
            args (<code>!gs-race 8</code>) still override.
          </p>
        </div>

        <div className="hub-form__field">
          <span className="hub-form__label">Series duplicates</span>
          <label className="hub-form__inline-field hub-form__inline-field--row">
            <Switch
              checked={!!config.allowSeriesDuplicates}
              onChange={() =>
                setConfig((c) => ({
                  ...c,
                  allowSeriesDuplicates: !c.allowSeriesDuplicates,
                }))
              }
            />
            <span>
              <strong>
                {config.allowSeriesDuplicates
                  ? "Duplicates allowed"
                  : "No duplicate tracks"}
              </strong>
              <span className="hub-form__platform-disabled">
                {config.allowSeriesDuplicates
                  ? "A track can roll more than once in a series."
                  : "Each track in a series rolls at most once. Standard competitive default."}
              </span>
            </span>
          </label>
        </div>

        <div className="hub-form__field">
          <span className="hub-form__label">Manual roll</span>
          <div className="hub-form__action-row">
            <Button
              variant="primary"
              onClick={() => reroll("race")}
              disabled={!liveSession || !config.enabled || rerolling !== null}
            >
              {rerolling === "race"
                ? "Rolling…"
                : seriesLength === 1
                  ? "Roll race"
                  : `Roll ${seriesLength}-race series`}
            </Button>
            {saving && (
              <span className="hub-form__platform-disabled">Saving…</span>
            )}
          </div>
          <p className="hub-form__platform-disabled">
            {liveSession ? (
              <>
                Fires the same roll as <code>!gs-race</code> in chat —
                rolls a track + item mode together using the series length
                above. Track and item-mode pools each contribute based on
                their enabled state.
              </>
            ) : (
              <>
                Manual roll is available once the session is active.
                Configure picks/bans now; rolls fire from here when the
                session goes live.
              </>
            )}
          </p>
        </div>

        {supportsRallies ? (
          <TracksTabbedSection
            tracksProps={{
              title: "Tracks",
              itemNoun: "track",
              enabled: config.tracks.enabled,
              onToggleEnabled: () =>
                setConfig((c) => ({
                  ...c,
                  tracks: { ...c.tracks, enabled: !c.tracks.enabled },
                })),
              options: tracks,
              picks: config.tracks.picks,
              bans: config.tracks.bans,
              onChangePicks: (next) =>
                setConfig((c) => ({
                  ...c,
                  tracks: { ...c.tracks, picks: next },
                })),
              onChangeBans: (next) =>
                setConfig((c) => ({
                  ...c,
                  tracks: { ...c.tracks, bans: next },
                })),
              poolSize: trackPoolSize,
              totalSize: trackCount,
              source: config.tracks.source ?? "streamer",
              onChangeSource: (next) =>
                setConfig((c) => ({
                  ...c,
                  tracks: { ...c.tracks, source: next },
                })),
            }}
            ralliesProps={{
              title: "Rallies",
              itemNoun: "rally",
              enabled: config.rallies?.enabled ?? true,
              onToggleEnabled: () =>
                setConfig((c) => ({
                  ...c,
                  rallies: {
                    ...(c.rallies ?? { enabled: true, picks: [], bans: [] }),
                    enabled: !(c.rallies?.enabled ?? true),
                  },
                })),
              options: rallies,
              picks: config.rallies?.picks ?? [],
              bans: config.rallies?.bans ?? [],
              onChangePicks: (next) =>
                setConfig((c) => ({
                  ...c,
                  rallies: {
                    ...(c.rallies ?? { enabled: true, picks: [], bans: [] }),
                    picks: next,
                  },
                })),
              onChangeBans: (next) =>
                setConfig((c) => ({
                  ...c,
                  rallies: {
                    ...(c.rallies ?? { enabled: true, picks: [], bans: [] }),
                    bans: next,
                  },
                })),
              poolSize: rallies.length - (config.rallies?.bans?.length ?? 0),
              totalSize: rallies.length,
              source: config.rallies?.source ?? "streamer",
              onChangeSource: (next) =>
                setConfig((c) => ({
                  ...c,
                  rallies: {
                    ...(c.rallies ?? { enabled: true, picks: [], bans: [] }),
                    source: next,
                  },
                })),
              groupLabelSuffix: "",
            }}
            rollKind={config.rollKind ?? "race"}
            onChangeRollKind={(next) =>
              setConfig((c) => ({ ...c, rollKind: next }))
            }
          />
        ) : (
          <SubPoolEditor
            title="Tracks"
            itemNoun="track"
            enabled={config.tracks.enabled}
            onToggleEnabled={() =>
              setConfig((c) => ({
                ...c,
                tracks: { ...c.tracks, enabled: !c.tracks.enabled },
              }))
            }
            options={tracks}
            picks={config.tracks.picks}
            bans={config.tracks.bans}
            onChangePicks={(next) =>
              setConfig((c) => ({ ...c, tracks: { ...c.tracks, picks: next } }))
            }
            onChangeBans={(next) =>
              setConfig((c) => ({ ...c, tracks: { ...c.tracks, bans: next } }))
            }
            poolSize={trackPoolSize}
            totalSize={trackCount}
            source={config.tracks.source ?? "streamer"}
            onChangeSource={(next) =>
              setConfig((c) => ({
                ...c,
                tracks: { ...c.tracks, source: next },
              }))
            }
          />
        )}

        <ItemsTabbedSection
          modesProps={{
            title: "Item modes",
            itemNoun: "mode",
            enabled: itemModesSub.enabled,
            onToggleEnabled: () =>
              updateModesSub({ enabled: !itemModesSub.enabled }),
            options: itemModes,
            picks: itemModesSub.picks,
            bans: itemModesSub.bans,
            onChangePicks: (next) => updateModesSub({ picks: next }),
            onChangeBans: (next) => updateModesSub({ bans: next }),
            poolSize: modesPoolSize,
            totalSize: modesCount,
            source: itemModesSub.source ?? "streamer",
            onChangeSource: (next) => updateModesSub({ source: next }),
            imageMode: "square",
            emptyMessage:
              modesCount === 0
                ? "Item modes aren't configured for this game yet."
                : null,
          }}
          literalProps={{
            title: "Items",
            itemNoun: "item",
            enabled: itemLiteralSub.enabled,
            onToggleEnabled: () =>
              updateLiteralSub({ enabled: !itemLiteralSub.enabled }),
            options: literalItems,
            picks: itemLiteralSub.picks,
            bans: itemLiteralSub.bans,
            onChangePicks: (next) => updateLiteralSub({ picks: next }),
            onChangeBans: (next) => updateLiteralSub({ bans: next }),
            poolSize: literalPoolSize,
            totalSize: literalCount,
            source: itemLiteralSub.source ?? "streamer",
            onChangeSource: (next) => updateLiteralSub({ source: next }),
            imageMode: "square",
            emptyMessage:
              literalCount === 0
                ? "Individual items aren't catalogued for this game yet."
                : null,
            groupLabelSuffix: "",
          }}
        />
      </div>
    </section>
  );
}

interface ItemsTabbedSectionProps {
  modesProps: SubPoolEditorProps<OptionLike>;
  literalProps: SubPoolEditorProps<OptionLike>;
}

/** Tabbed switcher inside the Items section. Modes (rule sets) on one
 *  tab, literal items (Blue Shells, Mushrooms, etc.) on the other.
 *  Counts surface in the tab labels so the streamer sees at a glance
 *  how many of each they've picked or banned. */
function ItemsTabbedSection({
  modesProps,
  literalProps,
}: ItemsTabbedSectionProps) {
  // Items default — most streamers care about the literal item box more
  // than the rule-set mode (Custom is the only mode that draws from the
  // literal pool, and even non-Custom rolls visually show item bans).
  const [active, setActive] = useState<"modes" | "literal">("literal");
  const literalActive = active === "literal";
  const modesCountChip =
    modesProps.picks.length + modesProps.bans.length > 0
      ? ` (${modesProps.picks.length}✓ / ${modesProps.bans.length}✗)`
      : "";
  const literalCountChip =
    literalProps.picks.length + literalProps.bans.length > 0
      ? ` (${literalProps.picks.length}✓ / ${literalProps.bans.length}✗)`
      : "";

  return (
    <div className="items-tabbed">
      <div className="items-tabbed__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={literalActive}
          className={`items-tabbed__tab${literalActive ? " items-tabbed__tab--active" : ""}`}
          onClick={() => setActive("literal")}
        >
          Items{literalCountChip}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!literalActive}
          className={`items-tabbed__tab${!literalActive ? " items-tabbed__tab--active" : ""}`}
          onClick={() => setActive("modes")}
        >
          Modes{modesCountChip}
        </button>
      </div>
      <p className="items-tabbed__hint">
        <strong>Modes</strong> are gameplay rule sets (Normal, Frantic,
        No Items) — one rolls per race. <strong>Items</strong> are the
        individual items that appear in the box (Blue Shells, Mushrooms,
        etc.) — these only apply when the rolled mode is{" "}
        <strong>Custom</strong>.
      </p>
      {literalActive ? (
        <SubPoolEditor {...literalProps} />
      ) : (
        <SubPoolEditor {...modesProps} />
      )}
    </div>
  );
}

interface TracksTabbedSectionProps {
  tracksProps: SubPoolEditorProps<OptionLike>;
  ralliesProps: SubPoolEditorProps<OptionLike>;
  /** What `!gs-race` rolls in chat: a race track, a rally, or auto. */
  rollKind: "race" | "rally" | "auto";
  onChangeRollKind: (next: "race" | "rally" | "auto") => void;
}

/** Tabbed switcher inside the Tracks section for games that have
 *  rallies (MKWorld). Toggles between regular race tracks and knockout
 *  rallies, and surfaces a "What does !gs-race roll?" selector at the
 *  top so the streamer can default to one or alternate. */
function TracksTabbedSection({
  tracksProps,
  ralliesProps,
  rollKind,
  onChangeRollKind,
}: TracksTabbedSectionProps) {
  const [active, setActive] = useState<"tracks" | "rallies">("tracks");
  const tracksActive = active === "tracks";
  const tracksCountChip =
    tracksProps.picks.length + tracksProps.bans.length > 0
      ? ` (${tracksProps.picks.length}✓ / ${tracksProps.bans.length}✗)`
      : "";
  const ralliesCountChip =
    ralliesProps.picks.length + ralliesProps.bans.length > 0
      ? ` (${ralliesProps.picks.length}✓ / ${ralliesProps.bans.length}✗)`
      : "";

  return (
    <div className="items-tabbed">
      <div className="hub-form__field">
        <span className="hub-form__label">Race or rally?</span>
        <div className="race-pool__source-options">
          <button
            type="button"
            className={`race-pool__source-chip${rollKind === "race" ? " race-pool__source-chip--active" : ""}`}
            onClick={() => onChangeRollKind("race")}
            aria-pressed={rollKind === "race"}
          >
            Race tracks
          </button>
          <button
            type="button"
            className={`race-pool__source-chip${rollKind === "rally" ? " race-pool__source-chip--active" : ""}`}
            onClick={() => onChangeRollKind("rally")}
            aria-pressed={rollKind === "rally"}
          >
            Rallies
          </button>
          <button
            type="button"
            className={`race-pool__source-chip${rollKind === "auto" ? " race-pool__source-chip--active" : ""}`}
            onClick={() => onChangeRollKind("auto")}
            aria-pressed={rollKind === "auto"}
          >
            Mix it up
          </button>
        </div>
        <p className="hub-form__platform-disabled">
          {rollKind === "race"
            ? "!gs-race rolls a race track. Use !gs-rally to manually fire a knockout rally."
            : rollKind === "rally"
              ? "!gs-race rolls a knockout rally. Use !gs-track to manually fire a race track."
              : "!gs-race randomly picks between a race track and a rally for each roll."}
        </p>
      </div>

      <div className="items-tabbed__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tracksActive}
          className={`items-tabbed__tab${tracksActive ? " items-tabbed__tab--active" : ""}`}
          onClick={() => setActive("tracks")}
        >
          Race tracks{tracksCountChip}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!tracksActive}
          className={`items-tabbed__tab${!tracksActive ? " items-tabbed__tab--active" : ""}`}
          onClick={() => setActive("rallies")}
        >
          Rallies{ralliesCountChip}
        </button>
      </div>
      <p className="items-tabbed__hint">
        <strong>Race tracks</strong> are the standard 96-track lineup.{" "}
        <strong>Rallies</strong> are MKWorld&rsquo;s knockout-elimination
        events. Each pool has its own picks/bans.
      </p>
      {tracksActive ? (
        <SubPoolEditor {...tracksProps} />
      ) : (
        <SubPoolEditor {...ralliesProps} />
      )}
    </div>
  );
}

interface OptionLike {
  id: string;
  name: string;
  cup?: string;
  image?: string;
  /** When set, an (i) button appears on the tile. Clicking it opens a
   *  modal with this descriptive content — used to surface what items
   *  make up a themed mode without needing to roll. Mobile-friendly
   *  alternative to native `title` tooltips. */
  info?: {
    description?: string;
    items?: Array<{ id: string; name: string; image?: string }>;
  };
}

interface SubPoolEditorProps<T extends OptionLike> {
  title: string;
  itemNoun: string;
  enabled: boolean;
  onToggleEnabled: () => void;
  options: T[];
  picks: string[];
  bans: string[];
  onChangePicks: (next: string[]) => void;
  onChangeBans: (next: string[]) => void;
  poolSize: number;
  totalSize: number;
  /** Suffix appended to each cup-style group label (e.g. "Mushroom Cup"
   *  for tracks). Pass `""` (default) for items, where the category
   *  name is already the full label. */
  groupLabelSuffix?: string;
  emptyMessage?: string | null;
  /** Where picks/bans come from. `streamer` (default) shows the tile
   *  editor below; `viewers` swaps it for a pointer to the picks/bans
   *  round panel. */
  source: "streamer" | "viewers";
  onChangeSource: (next: "streamer" | "viewers") => void;
  /** How to render the tile artwork.
   *   - `landscape` (default): 16:9 + cover — track and rally thumbnails
   *     are wide screenshots that look right cropped.
   *   - `square`: 1:1 + contain — item icons + mode artwork are square
   *     sprites that need to render uncropped. */
  imageMode?: "landscape" | "square";
}

/**
 * Tile-grid picks/bans editor. Inspired by the Tournament track picker
 * — each option renders as an artwork tile grouped by cup. Single-click
 * cycles `neutral → picked → banned → neutral` so picks and bans share
 * one interaction (Tournament's drag-reorder doesn't apply here; this
 * is set membership, not order).
 *
 * Search bar stays — fast-filtering 96 MK8DX tracks down to a few cups
 * worth of options is the streamer's primary affordance.
 */
function SubPoolEditor<T extends OptionLike>({
  title,
  itemNoun,
  enabled,
  onToggleEnabled,
  options,
  picks,
  bans,
  onChangePicks,
  onChangeBans,
  poolSize,
  totalSize,
  emptyMessage,
  groupLabelSuffix = "Cup",
  source,
  onChangeSource,
  imageMode = "landscape",
}: SubPoolEditorProps<T>) {
  const tileImgClass =
    imageMode === "square"
      ? "race-pool__tile-img race-pool__tile-img--square"
      : "race-pool__tile-img";
  const [search, setSearch] = useState("");
  // Mobile-friendly info modal — clicking the (i) badge on a tile
  // surfaces the option's `info` payload (description + item images).
  // `infoOpen` carries the option id of the open modal, or null.
  const [infoOpen, setInfoOpen] = useState<T | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const needle = search.toLowerCase();
    return options.filter((o) => o.name.toLowerCase().includes(needle));
  }, [options, search]);

  // Group options by cup for the visual grouping in the picker.
  const groups = useMemo(() => {
    const m = new Map<string, T[]>();
    for (const o of filtered) {
      const key = o.cup ?? "—";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(o);
    }
    return Array.from(m.entries());
  }, [filtered]);

  const cycleState = (id: string) => {
    const isPicked = picks.includes(id);
    const isBanned = bans.includes(id);
    if (!isPicked && !isBanned) {
      onChangePicks([...picks, id]);
      return;
    }
    if (isPicked) {
      onChangePicks(picks.filter((x) => x !== id));
      onChangeBans([...bans, id]);
      return;
    }
    // banned → neutral
    onChangeBans(bans.filter((x) => x !== id));
  };

  const removePick = (id: string) => {
    onChangePicks(picks.filter((x) => x !== id));
  };
  const removeBan = (id: string) => {
    onChangeBans(bans.filter((x) => x !== id));
  };

  return (
    <div className="hub-form__field race-pool">
      <div className="race-pool__header">
        <label className="hub-form__inline-field hub-form__inline-field--row">
          <Switch checked={enabled} onChange={onToggleEnabled} />
          <span>
            <strong>{title}</strong>
            <span className="hub-form__platform-disabled">
              {emptyMessage
                ? emptyMessage
                : enabled
                  ? `${poolSize} of ${totalSize} ${itemNoun}s available`
                  : "Off — won't roll for this session."}
            </span>
          </span>
        </label>
      </div>

      {enabled && options.length > 0 && (
        <>
          <div className="race-pool__source-row" role="group" aria-label={`${title} picks/bans source`}>
            <span className="race-pool__source-label">Who picks/bans these?</span>
            <div className="race-pool__source-options">
              <button
                type="button"
                className={`race-pool__source-chip${source === "streamer" ? " race-pool__source-chip--active" : ""}`}
                onClick={() => onChangeSource("streamer")}
                aria-pressed={source === "streamer"}
              >
                I&rsquo;ll set the list
              </button>
              <button
                type="button"
                className={`race-pool__source-chip${source === "viewers" ? " race-pool__source-chip--active" : ""}`}
                onClick={() => onChangeSource("viewers")}
                aria-pressed={source === "viewers"}
              >
                Viewers vote
              </button>
            </div>
          </div>

          {source === "viewers" ? (
            <p className="hub-form__platform-disabled race-pool__hint">
              Viewers will pick + ban {itemNoun}s in real time via the
              picks/bans round flow. Open a round from the{" "}
              <strong>Picks &amp; Bans round</strong> panel above. Whatever
              the streamer applies after a round becomes this pool.
            </p>
          ) : (
            <>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${itemNoun}s…`}
                className="race-pool__search"
              />

              <p className="hub-form__platform-disabled race-pool__hint">
                Click to cycle — first click <strong>picks</strong>{" "}
                (restricts the pool to this {itemNoun}), second click{" "}
                <strong>bans</strong> (excludes it), third click clears.
              </p>
            </>
          )}

          {source === "streamer" && (picks.length > 0 || bans.length > 0) && (
            <div className="race-pool__chips">
              {picks.map((id) => {
                const item = options.find((o) => o.id === id);
                return (
                  <span
                    key={`pick-${id}`}
                    className="race-pool__chip race-pool__chip--pick"
                  >
                    ✓ {item?.name ?? id}
                    <button
                      type="button"
                      onClick={() => removePick(id)}
                      aria-label={`Remove pick ${item?.name ?? id}`}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
              {bans.map((id) => {
                const item = options.find((o) => o.id === id);
                return (
                  <span
                    key={`ban-${id}`}
                    className="race-pool__chip race-pool__chip--ban"
                  >
                    ✗ {item?.name ?? id}
                    <button
                      type="button"
                      onClick={() => removeBan(id)}
                      aria-label={`Remove ban ${item?.name ?? id}`}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {source === "streamer" && (
          <div className="race-pool__cups">
            {groups.length === 0 ? (
              <p className="hub-form__platform-disabled">
                No {itemNoun}s match &ldquo;{search}&rdquo;.
              </p>
            ) : (
              groups.map(([cup, list]) => (
                <div key={cup} className="race-pool__cup">
                  {cup !== "—" && (
                    <div className="race-pool__cup-title">
                      {groupLabelSuffix ? `${cup} ${groupLabelSuffix}` : cup}
                    </div>
                  )}
                  <div className="race-pool__tile-grid">
                    {list.map((o) => {
                      const isPicked = picks.includes(o.id);
                      const isBanned = bans.includes(o.id);
                      const stateClass = isPicked
                        ? " race-pool__tile--picked"
                        : isBanned
                          ? " race-pool__tile--banned"
                          : "";
                      return (
                        <button
                          key={o.id}
                          type="button"
                          className={`race-pool__tile${stateClass}`}
                          onClick={() => cycleState(o.id)}
                          title={
                            isPicked
                              ? "Picked — click to ban"
                              : isBanned
                                ? "Banned — click to clear"
                                : "Click to pick"
                          }
                          aria-pressed={isPicked || isBanned}
                          aria-label={`${o.name}${
                            isPicked
                              ? ", picked"
                              : isBanned
                                ? ", banned"
                                : ""
                          }`}
                        >
                          {o.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={o.image}
                              alt=""
                              className={tileImgClass}
                              loading="lazy"
                            />
                          ) : (
                            <div
                              className={`${tileImgClass} race-pool__tile-img--placeholder`}
                            />
                          )}
                          <span className="race-pool__tile-name">{o.name}</span>
                          {o.info && (
                            <button
                              type="button"
                              className="race-pool__tile-info"
                              aria-label={`Show details for ${o.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setInfoOpen(o);
                              }}
                            >
                              i
                            </button>
                          )}
                          {isPicked && (
                            <span
                              className="race-pool__tile-marker race-pool__tile-marker--pick"
                              aria-hidden="true"
                            >
                              ✓
                            </span>
                          )}
                          {isBanned && (
                            <span
                              className="race-pool__tile-marker race-pool__tile-marker--ban"
                              aria-hidden="true"
                            >
                              ✗
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
          )}
        </>
      )}
      {infoOpen && (
        <Modal
          isOpen={!!infoOpen}
          onClose={() => setInfoOpen(null)}
          title={infoOpen.name}
          size="medium"
          primaryAction={{
            label: "Close",
            onClick: () => setInfoOpen(null),
          }}
        >
          <div className="race-pool__info-modal">
            {infoOpen.info?.description && (
              <p className="race-pool__info-description">
                {infoOpen.info.description}
              </p>
            )}
            {infoOpen.info?.items && infoOpen.info.items.length > 0 && (
              <>
                <p className="race-pool__info-label">
                  Items in this {itemNoun}
                </p>
                <ul className="race-pool__info-grid">
                  {infoOpen.info.items.map((it) => (
                    <li key={it.id} className="race-pool__info-item">
                      {it.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={it.image}
                          alt=""
                          className="race-pool__info-item-img"
                          loading="lazy"
                        />
                      ) : (
                        <div className="race-pool__info-item-img race-pool__info-item-img--placeholder" />
                      )}
                      <span className="race-pool__info-item-name">
                        {it.name}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

interface SaveCallbacks {
  onStart: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}

async function saveConfig(
  sessionSlug: string,
  gameSlug: string,
  config: RaceRandomizerConfig,
  { onStart, onSuccess, onError }: SaveCallbacks
) {
  onStart();
  try {
    const result = await updateRaceConfigAction(sessionSlug, {
      gameSlug,
      config: config as unknown as Record<string, unknown>,
    });
    if (!result.ok) {
      onError(result.error ?? "Save failed.");
      return;
    }
    onSuccess();
  } catch (err) {
    console.error("[RaceRandomizerSection] save failed", err);
    onError("Save failed (network error).");
  }
}
