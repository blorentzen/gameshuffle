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
  Input,
  Switch,
} from "@empac/cascadeds";
import {
  listTracksForGame,
  listItemPresetsForGame,
  type RaceGame,
} from "@/lib/randomizers/race";
import type { RaceRandomizerConfig } from "@/lib/modules/types";

interface Props {
  /** Active session id (or null when there's no live session). */
  sessionId: string | null;
  /** Game slug for the session — controls which track/item registry feeds the pickers. */
  game: RaceGame | null;
  /** Hydrated config snapshot from the server. */
  initial: RaceRandomizerConfig | null;
}

const SAVE_DEBOUNCE_MS = 400;

const DEFAULT_CONFIG: RaceRandomizerConfig = {
  enabled: true,
  tracks: { enabled: true, picks: [], bans: [] },
  items: { enabled: true, picks: [], bans: [] },
};

export function RaceRandomizerSection({ sessionId, game, initial }: Props) {
  const [config, setConfig] = useState<RaceRandomizerConfig>(
    initial ?? DEFAULT_CONFIG
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [rerolling, setRerolling] = useState<"track" | "items" | "race" | null>(null);
  const [seriesLength, setSeriesLength] = useState<number>(1);
  const saveTimerRef = useRef<number | null>(null);

  const noSession = !sessionId;
  const noGame = !game;

  const tracks = useMemo(
    () => (game ? listTracksForGame(game) : []),
    [game]
  );
  const itemPresets = useMemo(
    () => (game ? listItemPresetsForGame(game) : []),
    [game]
  );

  // Persist on change — debounced. Single in-flight saver; if the user
  // keeps editing, the timer resets and we batch into one PATCH.
  useEffect(() => {
    if (!sessionId) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void saveConfig(sessionId, config, {
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
  // We only debounce on config edits, not on the sessionId/game changes
  // (those imply a remount via the parent server component anyway).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  if (noSession) {
    return (
      <section className="hub-detail__section">
        <h2 className="hub-detail__section-title">Race Randomizer</h2>
        <p className="hub-form__platform-disabled">
          Race randomization configures per session. Activate the session
          first; this surface populates once it&rsquo;s live.
        </p>
      </section>
    );
  }

  // Counts for the live "X of Y available" copy
  const trackCount = tracks.length;
  const trackBans = config.tracks.bans.length;
  const trackPicks = config.tracks.picks.length;
  const trackPoolSize =
    trackPicks > 0
      ? config.tracks.picks.filter((id) => !config.tracks.bans.includes(id)).length
      : Math.max(0, trackCount - trackBans);

  const itemsCount = itemPresets.length;
  const itemBans = config.items.bans.length;
  const itemPicks = config.items.picks.length;
  const itemPoolSize =
    itemPicks > 0
      ? config.items.picks.filter((id) => !config.items.bans.includes(id)).length
      : Math.max(0, itemsCount - itemBans);

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
          <span className="hub-form__label">Manual reroll</span>
          <div className="hub-form__action-row">
            <Button
              variant="primary"
              onClick={() => reroll("track")}
              disabled={!config.enabled || !config.tracks.enabled || rerolling !== null}
            >
              {rerolling === "track" ? "Rolling…" : "Reroll track"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => reroll("items")}
              disabled={!config.enabled || !config.items.enabled || rerolling !== null}
            >
              {rerolling === "items" ? "Rolling…" : "Reroll items"}
            </Button>
            <span className="hub-form__platform-disabled" style={{ marginLeft: "var(--spacing-12)" }}>
              Race series:
            </span>
            <div style={{ width: 80 }}>
              <Input
                type="number"
                min={1}
                max={16}
                value={String(seriesLength)}
                onChange={(e) =>
                  setSeriesLength(
                    Math.max(1, Math.min(16, parseInt(e.target.value || "1", 10)))
                  )
                }
              />
            </div>
            <Button
              variant="secondary"
              onClick={() => reroll("race")}
              disabled={!config.enabled || rerolling !== null}
            >
              {rerolling === "race"
                ? "Rolling…"
                : seriesLength === 1
                  ? "Reroll race"
                  : `Roll ${seriesLength}-race series`}
            </Button>
            {saving && (
              <span className="hub-form__platform-disabled">Saving config…</span>
            )}
          </div>
          <p className="hub-form__platform-disabled">
            Series rolls dedupe tracks (no repeats within the series) but
            allow item-preset repeats since the preset pool is small. Same
            in chat: <code>!gs-race 4</code>, <code>!gs-race 8</code>, etc.
            (max 16).
          </p>
        </div>

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
        />

        <SubPoolEditor
          title="Item presets"
          itemNoun="item preset"
          enabled={config.items.enabled}
          onToggleEnabled={() =>
            setConfig((c) => ({
              ...c,
              items: { ...c.items, enabled: !c.items.enabled },
            }))
          }
          options={itemPresets}
          picks={config.items.picks}
          bans={config.items.bans}
          onChangePicks={(next) =>
            setConfig((c) => ({ ...c, items: { ...c.items, picks: next } }))
          }
          onChangeBans={(next) =>
            setConfig((c) => ({ ...c, items: { ...c.items, bans: next } }))
          }
          poolSize={itemPoolSize}
          totalSize={itemsCount}
          emptyMessage={
            itemsCount === 0
              ? "Item presets aren't configured for this game yet (Phase A scope: MK8DX only)."
              : null
          }
        />
      </div>
    </section>
  );
}

interface OptionLike {
  id: string;
  name: string;
  cup?: string;
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
  emptyMessage?: string | null;
}

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
}: SubPoolEditorProps<T>) {
  const [search, setSearch] = useState("");

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

  const togglePick = (id: string) => {
    if (picks.includes(id)) {
      onChangePicks(picks.filter((x) => x !== id));
    } else {
      // Picking an id auto-removes it from the bans list to prevent state drift.
      if (bans.includes(id)) onChangeBans(bans.filter((x) => x !== id));
      onChangePicks([...picks, id]);
    }
  };

  const toggleBan = (id: string) => {
    if (bans.includes(id)) {
      onChangeBans(bans.filter((x) => x !== id));
    } else {
      if (picks.includes(id)) onChangePicks(picks.filter((x) => x !== id));
      onChangeBans([...bans, id]);
    }
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
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${itemNoun}s…`}
            className="race-pool__search"
          />

          {(picks.length > 0 || bans.length > 0) && (
            <div className="race-pool__chips">
              {picks.map((id) => {
                const item = options.find((o) => o.id === id);
                return (
                  <span key={`pick-${id}`} className="race-pool__chip race-pool__chip--pick">
                    ✓ {item?.name ?? id}
                    <button
                      type="button"
                      onClick={() => togglePick(id)}
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
                  <span key={`ban-${id}`} className="race-pool__chip race-pool__chip--ban">
                    ✗ {item?.name ?? id}
                    <button
                      type="button"
                      onClick={() => toggleBan(id)}
                      aria-label={`Remove ban ${item?.name ?? id}`}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          <div className="race-pool__list">
            {groups.length === 0 ? (
              <p className="hub-form__platform-disabled">
                No {itemNoun}s match &ldquo;{search}&rdquo;.
              </p>
            ) : (
              groups.map(([cup, list]) => (
                <div key={cup} className="race-pool__group">
                  {cup !== "—" && (
                    <div className="race-pool__group-title">{cup} Cup</div>
                  )}
                  <ul className="race-pool__items">
                    {list.map((o) => {
                      const isPicked = picks.includes(o.id);
                      const isBanned = bans.includes(o.id);
                      return (
                        <li key={o.id} className="race-pool__item">
                          <span className="race-pool__item-name">{o.name}</span>
                          <span className="race-pool__item-actions">
                            <button
                              type="button"
                              className={`race-pool__btn${isPicked ? " race-pool__btn--active" : ""}`}
                              onClick={() => togglePick(o.id)}
                              title="Pick — restricts the pool to this item"
                            >
                              {isPicked ? "✓ Picked" : "Pick"}
                            </button>
                            <button
                              type="button"
                              className={`race-pool__btn race-pool__btn--ban${isBanned ? " race-pool__btn--active" : ""}`}
                              onClick={() => toggleBan(o.id)}
                              title="Ban — excludes this item from the pool"
                            >
                              {isBanned ? "✗ Banned" : "Ban"}
                            </button>
                            {isPicked && (
                              <Badge variant="success" size="small">In pool</Badge>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </div>
        </>
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
  sessionId: string,
  config: RaceRandomizerConfig,
  { onStart, onSuccess, onError }: SaveCallbacks
) {
  onStart();
  try {
    const res = await fetch("/api/twitch/modules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_config",
        moduleId: "race_randomizer",
        config,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      onError(body.message || body.error || `Save failed (${res.status}).`);
      return;
    }
    onSuccess();
  } catch (err) {
    console.error("[RaceRandomizerSection] save failed", err);
    onError("Save failed (network error).");
  }
  // sessionId param is held for future per-session API hooks; intentionally
  // unused right now since /api/twitch/modules resolves the active session
  // server-side.
  void sessionId;
}
