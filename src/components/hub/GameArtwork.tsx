/**
 * Game artwork tile — the visual identity for a configured game across
 * the Hub, Modules tab, Status Strip, and session header. Kept as a
 * server component so it slots into either server or client trees.
 *
 * Per the multi-game spec: GS Queue is treated as a first-class entry,
 * not a fallback placeholder. Pass `slug={null}` (or `GS_DEFAULT_SLUG`)
 * to render the queue artwork — never render a "no artwork" state.
 */

import {
  getGameArtwork,
  type GameArtworkEntry,
} from "@/lib/games/artwork";

export type GameArtworkSize = "thumb" | "chip" | "tile" | "card";

interface GameArtworkProps {
  /** Game slug, or null/undefined for GS Queue artwork. */
  slug: string | null | undefined;
  /** Visual size — controls dimensions + label visibility:
   *   - thumb  (24×24 square, no label)         status-strip chip, header
   *   - chip   (medium pill w/ artwork + name)  modules carousel
   *   - tile   (large square, label below)      configure multi-select
   *   - card   (full-width hero w/ artwork)     hub home active card */
  size?: GameArtworkSize;
  /** Adds a "Live" pill marker — used in the modules carousel for the
   *  game whose slug equals the session's `active_game`. */
  isLive?: boolean;
  /** Toggles the selected/active state styling. */
  selected?: boolean;
  /** Hides the textual label even when size would otherwise show it. */
  hideLabel?: boolean;
  /** Optional className to compose with the size-specific class. */
  className?: string;
}

export function GameArtwork({
  slug,
  size = "thumb",
  isLive = false,
  selected = false,
  hideLabel = false,
  className,
}: GameArtworkProps) {
  const entry = getGameArtwork(slug);
  const showLabel =
    !hideLabel && (size === "chip" || size === "tile" || size === "card");
  const classes = [
    "game-art",
    `game-art--${size}`,
    selected ? "game-art--selected" : "",
    isLive ? "game-art--live" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} title={entry.name}>
      <ArtworkImage entry={entry} size={size} />
      {showLabel && (
        <span className="game-art__label">
          {size === "chip" || size === "tile"
            ? entry.shortName
            : entry.name}
        </span>
      )}
      {isLive && <span className="game-art__live-pill">LIVE</span>}
    </div>
  );
}

function ArtworkImage({
  entry,
  size,
}: {
  entry: GameArtworkEntry;
  size: GameArtworkSize;
}) {
  // Plain <img> here — these are CDN-hosted JPGs at fixed dimensions, no
  // need for the next/image optimizer pipeline.
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={entry.artworkUrl}
      alt={entry.name}
      className={`game-art__img game-art__img--${size}`}
      loading="lazy"
    />
  );
}
