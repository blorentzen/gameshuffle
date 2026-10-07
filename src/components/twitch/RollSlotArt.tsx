"use client";

import type { CSSProperties } from "react";
import { IconHeart, IconShield, IconStar, IconSword } from "@tabler/icons-react";
import { getImagePath } from "@/lib/images";
import type { RollGlyph, RollSlot } from "@/lib/twitch/chatRoll";

const GLYPHS: Record<RollGlyph, typeof IconShield> = { shield: IconShield, sword: IconSword, heart: IconHeart, star: IconStar };

/**
 * The picture for one part of a chat roll, inside the caller's box (each
 * surface sizes its own: the OBS card, the lobby page, /live). Game art sits on
 * the box's own mat; everything else stands on the part's colour: full-body
 * art, a Perfect Dark icon, a hero's role glyph, or the name when a game has
 * no art (GoldenEye, Pokémon Stadium). `compact` boxes are too small for a
 * name, so a name tile shows its initial and the caller prints the name below.
 */
export function RollSlotArt({ slot, className, glyphSize = 40, compact = false }: { slot: RollSlot; className?: string; glyphSize?: number; compact?: boolean }) {
  const tinted = slot.kind !== "art" && slot.color;
  const style: CSSProperties | undefined = tinted
    ? { background: `radial-gradient(120% 90% at 50% 20%, color-mix(in srgb, ${slot.color} 70%, #fff), ${slot.color})` }
    : undefined;
  const Glyph = slot.glyph ? GLYPHS[slot.glyph] : null;
  return (
    <div className={`roll-art roll-art--${slot.kind}${className ? ` ${className}` : ""}`} style={style}>
      {slot.kind === "glyph" && Glyph ? (
        <Glyph size={glyphSize} stroke={1.8} color="#fff" aria-hidden />
      ) : slot.kind === "text" || !slot.img ? (
        compact
          ? <span className="roll-art__text roll-art__text--initial" aria-hidden>{slot.name.charAt(0)}</span>
          : <span className="roll-art__text">{slot.name}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- art comes from the CDN or /images, sized by the box
        <img src={getImagePath(slot.img)} alt={slot.name} />
      )}
    </div>
  );
}
