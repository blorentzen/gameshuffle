"use client";

/**
 * One GameShuffle reaction sticker (src/data/stickers.ts): the word on a tile in its tone, with its Tabler glyph.
 * Only the glyph moves (Britton, 2026-10-31), for about five seconds, then it rests; the tile and the word never move.
 * Bumping `play` restarts the motion. Reduced motion keeps it still. Sizes: lg 168, md 104, sm 64, xs 40 (no word).
 */

import { STICKER_BY_ID, stickerText } from "@/data/stickers";
import { STICKER_ICONS } from "./stickerIcons";

export type StickerSize = "lg" | "md" | "sm" | "xs";

export function GsSticker({ id, size = "md", play = 0, still = false, className }: {
  id: string;
  size?: StickerSize;
  /** Change it to play the motion again. */
  play?: number;
  /** Never move (lists where many show at once). */
  still?: boolean;
  className?: string;
}) {
  const s = STICKER_BY_ID[id];
  if (!s) return null;
  const Glyph = STICKER_ICONS[s.icon];
  const long = stickerText(s).split(" ").some((part) => part.length > 9);
  return (
    <span
      role="img"
      aria-label={`${stickerText(s)}: ${s.meaning}`}
      className={`gs-sticker gs-sticker--${size} gs-sticker--tone-${s.tone}${long ? " gs-sticker--long" : ""}${still ? "" : " gs-sticker--play"}${className ? ` ${className}` : ""}`}
    >
      <span className="gs-sticker__die">
        <span className="gs-sticker__face">
          {Glyph ? <Glyph key={play} className={`gs-sticker__glyph gs-sticker__glyph--${s.motion}`} stroke={2.2} aria-hidden /> : null}
          {size !== "xs" ? <span className="gs-sticker__word" aria-hidden>{s.word}</span> : null}
        </span>
      </span>
    </span>
  );
}
