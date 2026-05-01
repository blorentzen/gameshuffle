"use client";

/**
 * Items tab — preset gallery for the live view. Per spec §6. Smaller
 * fixed list (3 entries in Phase A scope), card-based, more visual
 * than the track picker since presets benefit from descriptions.
 */

import { useMemo } from "react";
import { Badge } from "@empac/cascadeds";
import {
  listItemPresetsForGame,
  type ItemPreset,
  type RaceGame,
} from "@/lib/randomizers/race";
import { useLiveState } from "../RealtimeLiveView";
import type { PendingAction } from "../useReplayActionAfterAuth";

interface LiveItemsTabProps {
  game: RaceGame | null;
  requestAction: (
    kind: PendingAction["kind"],
    id: string,
    label: string
  ) => void;
}

type PresetStatus = "current" | "picked" | "banned" | "neutral";

export function LiveItemsTab({ game, requestAction }: LiveItemsTabProps) {
  const live = useLiveState();
  const presets = useMemo(() => (game ? listItemPresetsForGame(game) : []), [game]);

  const currentPresetId = useMemo(() => {
    for (const e of live.events) {
      if (e.event_type === "race_randomized" || e.event_type === "items_randomized") {
        const id = (e.payload?.preset_id as string | null) ?? null;
        if (id) return id;
      }
    }
    return null;
  }, [live.events]);

  const config = live.raceConfig?.items;
  const picks = useMemo(() => new Set(config?.picks ?? []), [config?.picks]);
  const bans = useMemo(() => new Set(config?.bans ?? []), [config?.bans]);

  const statusFor = (preset: ItemPreset): PresetStatus => {
    if (preset.id === currentPresetId) return "current";
    if (picks.has(preset.id)) return "picked";
    if (bans.has(preset.id)) return "banned";
    return "neutral";
  };

  if (!game) {
    return (
      <div className="live-tab live-tab--empty">
        <p>
          The streamer hasn&rsquo;t selected a game for this session yet —
          item presets will appear here once they pick a randomizer.
        </p>
      </div>
    );
  }

  if (presets.length === 0) {
    return (
      <div className="live-tab live-tab--empty">
        <p>
          Item presets aren&rsquo;t configured for this game yet. (MKWorld
          item presets are deferred to a follow-up release.)
        </p>
      </div>
    );
  }

  return (
    <div className="live-tab">
      <p className="live-picker__count">
        {presets.length} item rule set{presets.length === 1 ? "" : "s"} available
      </p>
      <div className="live-picker__preset-grid">
        {presets.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            status={statusFor(preset)}
            onPick={() =>
              requestAction("pick-item", preset.id, `Pick ${preset.name}`)
            }
            onBan={() =>
              requestAction("ban-item", preset.id, `Ban ${preset.name}`)
            }
          />
        ))}
      </div>
    </div>
  );
}

interface PresetCardProps {
  preset: ItemPreset;
  status: PresetStatus;
  onPick: () => void;
  onBan: () => void;
}

function PresetCard({ preset, status, onPick, onBan }: PresetCardProps) {
  const className = `live-preset-card live-preset-card--${status}`;
  return (
    <article className={className}>
      <div className="live-preset-card__header">
        <p className="live-preset-card__name">{preset.name}</p>
        {status === "current" && <Badge variant="success" size="small">Current</Badge>}
        {status === "picked" && <Badge variant="success" size="small">Picked</Badge>}
        {status === "banned" && <Badge variant="error" size="small">Banned</Badge>}
      </div>
      <p className="live-preset-card__description">{preset.description}</p>
      <div className="live-preset-card__actions">
        <button
          type="button"
          className="live-track-card__btn"
          onClick={onPick}
          aria-label={`Pick ${preset.name}`}
        >
          Pick
        </button>
        <button
          type="button"
          className="live-track-card__btn live-track-card__btn--ban"
          onClick={onBan}
          aria-label={`Ban ${preset.name}`}
        >
          Ban
        </button>
      </div>
    </article>
  );
}
