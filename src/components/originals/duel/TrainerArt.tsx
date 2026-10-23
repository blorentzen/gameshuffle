/**
 * The Daily Duel trainer's picture (picks 2026-10-21, https://claude.ai/artifact/4YeQz1MVRnuBLkSHmkMCmp):
 * the art window of their own Supporter card (else their official artwork, else their ace's card),
 * cropped with CSS from the card image as Scrydex serves it (official artwork: our own copy). `banner` covers a wide frame with the face a little above the middle;
 * `round` and `tile` close in on the face (the card's hand-set face point and zoom). Our own drawing
 * (CascadeDS has no picture crop); the sums match artCrop in src/lib/originals/duel/pictures.ts.
 * Size the frame from outside (width and height, or an aspect-ratio): it never sizes itself, so
 * nothing shifts while the image loads. No hooks, so server and client pages can both use it.
 */

import type { CSSProperties } from "react";
import type { DuelPicture } from "@/lib/originals/duel/view";
import "@/styles/duel-art.css";

export type TrainerArtShape = "banner" | "round" | "tile";

/** The CSS variables the crop reads (art window, image shape, face, zoom, where the face sits in the frame). */
export function artVars(p: DuelPicture, shape: TrainerArtShape): CSSProperties {
  const [ax, ay, aw, ah] = p.box;
  const [fx, fy, zoom] = p.face;
  return {
    "--ax": ax, "--ay": ay, "--aw": aw, "--ah": ah, "--ar": p.ratio, "--fx": fx, "--fy": fy,
    "--z": shape === "banner" ? 1 : Math.max(1, zoom), "--px": 0.5, "--py": shape === "banner" ? 0.42 : 0.5,
  } as CSSProperties;
}

/**
 * `alt`: the picture's words where it carries meaning (the start card's banner), else "" (the
 * trainer's name is right beside it).
 */
export function TrainerArt({ picture, shape, alt = "", className, eager = false }: {
  picture: DuelPicture;
  shape: TrainerArtShape;
  alt?: string;
  className?: string;
  /** Load straight away (the start card's banner, above the fold). */
  eager?: boolean;
}) {
  return (
    <span className={`duel-art duel-art--${shape}${picture.kind !== "card" ? ` duel-art--${picture.kind}` : ""}${className ? ` ${className}` : ""}`} style={artVars(picture, shape)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Scrydex CDN image, medium size, never rewritten (official artwork: our own small copy) */}
      <img src={picture.img} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" draggable={false} />
    </span>
  );
}
