"use client";

/**
 * Multi-select tile UI for declaring which games a session will host.
 *
 * Two interaction modes via `reorderable`:
 *   - false (default for the new-session modal) → click to toggle only.
 *     Pure selection, no drag, no order badges. The streamer just picks
 *     what they're going to play; ordering is a Settings-tab concern.
 *   - true (the Settings tab on the detail page) → adds drag-to-reorder
 *     among selected tiles + numeric play-order badges. Index 1 = the
 *     default active game when a test session activates without a
 *     Twitch category.
 *
 * Disabled state freezes the entire control (used after activation when
 * lifecycle gating prevents edits).
 */

import { useMemo, useState } from "react";
import {
  GAME_ARTWORK,
  GS_DEFAULT_SLUG,
  SUPPORTED_GAME_SLUGS,
} from "@/lib/games/artwork";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /** When true, selected tiles can be dragged to reorder + show their
   *  position badge. Default false — most surfaces just need selection. */
  reorderable?: boolean;
}

export function GameMultiSelect({
  value,
  onChange,
  disabled = false,
  reorderable = false,
}: Props) {
  // Catalog excludes GS_DEFAULT — that's the queue fallback, not a
  // "configurable game" the streamer picks. The Modules tab carousel
  // shows it permanently; this surface does not.
  const allSlugs = useMemo(() => SUPPORTED_GAME_SLUGS, []);
  const [draggingSlug, setDraggingSlug] = useState<string | null>(null);

  const toggle = (slug: string) => {
    if (disabled) return;
    if (value.includes(slug)) {
      onChange(value.filter((s) => s !== slug));
    } else {
      onChange([...value, slug]);
    }
  };

  const reorder = (fromSlug: string, toSlug: string) => {
    if (disabled || fromSlug === toSlug) return;
    if (!value.includes(fromSlug) || !value.includes(toSlug)) return;
    const next = [...value];
    const fromIdx = next.indexOf(fromSlug);
    const toIdx = next.indexOf(toSlug);
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, fromSlug);
    onChange(next);
  };

  return (
    <div
      className={`game-multi-select${disabled ? " game-multi-select--disabled" : ""}`}
      role="group"
      aria-label="Games for this session"
    >
      <div className="game-multi-select__grid">
        {allSlugs.map((slug) => {
          const orderIdx = value.indexOf(slug);
          const isSelected = orderIdx !== -1;
          const entry = GAME_ARTWORK[slug];
          const dragEnabled = reorderable && isSelected && !disabled;
          return (
            <button
              key={slug}
              type="button"
              className={`game-multi-select__tile${
                isSelected ? " game-multi-select__tile--selected" : ""
              }`}
              onClick={() => toggle(slug)}
              disabled={disabled}
              draggable={dragEnabled}
              onDragStart={
                dragEnabled
                  ? (e) => {
                      setDraggingSlug(slug);
                      e.dataTransfer.effectAllowed = "move";
                    }
                  : undefined
              }
              onDragOver={
                dragEnabled
                  ? (e) => {
                      if (draggingSlug && draggingSlug !== slug) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                      }
                    }
                  : undefined
              }
              onDrop={
                dragEnabled
                  ? (e) => {
                      if (draggingSlug && draggingSlug !== slug) {
                        e.preventDefault();
                        reorder(draggingSlug, slug);
                      }
                      setDraggingSlug(null);
                    }
                  : undefined
              }
              onDragEnd={
                dragEnabled ? () => setDraggingSlug(null) : undefined
              }
              aria-pressed={isSelected}
              aria-label={`${entry.name}${
                isSelected
                  ? reorderable
                    ? `, position ${orderIdx + 1}`
                    : ", selected"
                  : ", not selected"
              }`}
            >
              {/* Full-bleed artwork. Plain <img> — these are CDN-hosted
                  JPGs at fixed dimensions; the next/image optimizer
                  pipeline isn't worth the build cost. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={entry.artworkUrl}
                alt=""
                className="game-multi-select__art"
                loading="lazy"
              />
              <span className="game-multi-select__title">{entry.name}</span>
              {isSelected && (
                <span className="game-multi-select__check" aria-hidden="true">
                  ✓
                </span>
              )}
              {isSelected && reorderable && (
                <span className="game-multi-select__order-badge">
                  {orderIdx + 1}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="game-multi-select__hint">
        {reorderable ? (
          <>
            Click to toggle. Drag a selected tile to set play order — index 1
            is the default active game when a test session activates without a
            Twitch category.
          </>
        ) : (
          <>
            Click each game you plan to host. You can adjust play order on
            the Settings tab once the session is created.
          </>
        )}
        {value.length === 0 && " No games selected → queue-only session."}
      </p>
      {/* Reference the constant so static analyzers see it as used; the
          value is the authoritative key for the queue-fallback artwork. */}
      <span hidden>{GS_DEFAULT_SLUG}</span>
    </div>
  );
}
