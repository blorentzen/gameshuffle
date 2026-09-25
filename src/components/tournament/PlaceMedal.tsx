/**
 * Podium place: a Tabler medal for the top three, the plain number after that.
 *
 * The emoji medals (🥇🥈🥉) this replaces carried their meaning in COLOUR, not
 * shape — at a glance you read gold/silver/bronze, not "a medal". A monochrome
 * icon would throw that away, so the rank drives a colour token and the icon
 * only supplies the form. Tokens flip for dark mode, which the emoji could not
 * do: the same glyph sat on both grounds at whatever contrast it happened to
 * land on.
 *
 * Four call sites repeated the same ternary; this is the one of them.
 */

import { IconMedal } from "@tabler/icons-react";

const PLACE = ["gold", "silver", "bronze"] as const;

export function PlaceMedal({ rank, size = 16 }: { rank: number; size?: number }) {
  const place = PLACE[rank - 1];
  if (!place) return <>{rank}</>;
  return (
    <IconMedal
      size={size}
      stroke={1.9}
      className={`place-medal place-medal--${place}`}
      aria-label={`${rank === 1 ? "First" : rank === 2 ? "Second" : "Third"} place`}
    />
  );
}
