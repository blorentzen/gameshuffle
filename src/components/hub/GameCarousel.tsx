"use client";

/**
 * Modules-tab game switcher — horizontal "category chip" buttons that
 * toggle which game's per-game module config the streamer is editing.
 *
 * GS Queue is permanently FIRST — the universal floor that engages
 * whenever active_game is null. Streamer typically sets up the queue
 * defaults before per-game module configs.
 *
 * No "Live" pill: the chip is the switcher; the active-game info
 * already lives in the persistent Status Strip (Current Category).
 */

import { GAME_ARTWORK, GS_DEFAULT_SLUG } from "@/lib/games/artwork";

interface Props {
  /** Configured game slugs in play order (from `gs_sessions.configured_games`). */
  configuredGames: string[];
  /** Slug currently selected in the carousel for editing. */
  selectedSlug: string;
  /** Notified when the streamer clicks a different chip. */
  onSelect: (slug: string) => void;
}

export function GameCarousel({
  configuredGames,
  selectedSlug,
  onSelect,
}: Props) {
  // GS Queue first, then configured games in declared play order.
  const slugs = [GS_DEFAULT_SLUG, ...configuredGames];

  return (
    <div className="game-carousel" role="tablist" aria-label="Game modules">
      <div className="game-carousel__track">
        {slugs.map((slug) => {
          const isSelected = slug === selectedSlug;
          const entry = GAME_ARTWORK[slug];
          if (!entry) return null;
          return (
            <button
              key={slug}
              type="button"
              role="tab"
              aria-selected={isSelected}
              className={`game-carousel__chip${
                isSelected ? " game-carousel__chip--selected" : ""
              }`}
              onClick={() => onSelect(slug)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={entry.artworkUrl}
                alt=""
                className="game-carousel__chip-art"
                loading="lazy"
              />
              <span className="game-carousel__chip-name">{entry.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
